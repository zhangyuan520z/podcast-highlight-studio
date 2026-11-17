/**
 * 本地语音转写（ASR）
 *
 * 在浏览器内用 transformers.js 跑 Whisper，全程本地推理：
 * 音频不离开本机、不需要 API Key、输出带时间戳的分段，再转成 SRT 走现有金句流程。
 * 模型首次从 hf-mirror 镜像下载，之后由浏览器缓存，可离线使用。
 */
import { secToStamp } from './timecode.js'

const TARGET_SR = 16000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------------- 健壮 fetch：剥离 Range + 网络失败自动重试 ---------------- */

let nativeFetch = null
function getNativeFetch() {
  // 始终锚定第一次拿到的全局 fetch，避免切换模型时 env.fetch 被反复嵌套包装
  if (!nativeFetch) nativeFetch = fetch.bind(globalThis)
  return nativeFetch
}

function stripRange(init) {
  const h = init.headers
  const hasRange = h && (
    (h instanceof Headers && h.has('Range')) ||
    (typeof h === 'object' && !(h instanceof Headers) && 'Range' in h)
  )
  if (!hasRange) return init
  let headers = h
  if (h instanceof Headers) {
    headers = new Headers(h)
    headers.delete('Range')
  } else {
    headers = { ...h }
    delete headers.Range
  }
  return { ...init, headers }
}

/**
 * 只在「网络层失败」（fetch 直接 reject、拿不到任何响应，如 Failed to fetch）时重试，
 * 带响应的 HTTP 状态码（404/500 等）不在这里重试。最多重试 2 次，指数退避。
 */
async function robustFetch(input, init = {}) {
  const nf = getNativeFetch()
  const finalInit = stripRange(init)
  let lastError
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    try {
      return await nf(input, finalInit)
    } catch (err) {
      lastError = err
      if (attempt < 2) await sleep(500 * 2 ** attempt)
    }
  }
  throw lastError
}

/** 可选模型档位：首次下载体积越大，中文精度通常越好 */
export const ASR_MODELS = [
  { id: 'Xenova/whisper-tiny', label: '极速', size: '约 40 MB', note: '速度最快，精度一般，适合快速试跑' },
  { id: 'Xenova/whisper-base', label: '平衡', size: '约 80 MB', note: '速度与精度均衡，日常推荐' },
  { id: 'Xenova/whisper-small', label: '精准', size: '约 245 MB', note: '中文识别更准，首次下载较久' },
]

export const DEFAULT_ASR_MODEL = ASR_MODELS[0].id

export const ASR_LANGUAGES = [
  { key: 'chinese', label: '中文' },
  { key: 'english', label: '英文' },
  { key: null, label: '自动检测' },
]

/* ---------------- 单例懒加载，避免首屏打入大依赖 ---------------- */

let cachedModelId = null
let cachedTranscriber = null

async function getTranscriber(modelId, onProgress) {
  if (cachedTranscriber && cachedModelId === modelId) return cachedTranscriber

  const { pipeline, env } = await import('@huggingface/transformers')
  // 大陆直连 huggingface.co 会超时，统一走镜像
  env.remoteHost = 'https://hf-mirror.com/'
  env.allowLocalModels = false

  // 本地 ONNX 运行时：不从 jsDelivr 加载（当前网络对 jsDelivr 不通）
  const base = import.meta.env.BASE_URL || '/'
  env.backends.onnx.wasm.wasmPaths = {
    mjs: `${base}ort/ort-wasm-simd-threaded.asyncify.mjs`,
    wasm: `${base}ort/ort-wasm-simd-threaded.asyncify.wasm`,
  }
  // 单线程：避免 Worker / SharedArrayBuffer 对跨域隔离头的依赖，ASR 场景足够快
  env.backends.onnx.wasm.numThreads = 1

  // hf-mirror 不支持带 Range 的跨域请求（预检失败），而 transformers 用 Range 取元数据：
  // 统一走 robustFetch：剥离 Range 改普通 GET，并对网络抖动自动重试
  env.fetch = robustFetch

  cachedTranscriber = await pipeline('automatic-speech-recognition', modelId, {
    device: 'wasm',
    progress_callback: (e) => {
      if (e.status === 'progress') onProgress?.('model', e.progress, `下载 ${e.file}`)
      else if (e.status === 'done') onProgress?.('model', 100, `已缓存 ${e.file}`)
    },
  })
  cachedModelId = modelId
  return cachedTranscriber
}

/* ---------------- 音频解码 + 重采样到 16k 单声道 ---------------- */

async function decodeAudioFile(file) {
  const arrayBuffer = await file.arrayBuffer()
  const BaseCtx = window.AudioContext || window.webkitAudioContext
  const decodeCtx = new BaseCtx()
  let decoded
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer)
  } catch (err) {
    decodeCtx.close()
    const friendly = new Error(
      `浏览器无法解码该音频（${file.name}）。请确认它是标准的 mp3 / wav / m4a（AAC），` +
      `若是少见编码或损坏文件，可先用格式工厂 / 剪映转成标准 mp3 或 wav 再试。`
    )
    friendly.cause = err
    throw friendly
  }
  decodeCtx.close()

  const length = Math.ceil(decoded.duration * TARGET_SR)
  const offline = new OfflineAudioContext(1, length, TARGET_SR)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start(0)
  const rendered = await offline.startRendering()

  return {
    samples: rendered.getChannelData(0),
    duration: decoded.duration,
    sampleRate: TARGET_SR,
  }
}

/* ---------------- Whisper 分段转 SRT ---------------- */

export function chunksToSrt(chunks) {
  return chunks
    .map((chunk, i) => {
      const [startRaw, endRaw] = chunk.timestamp || [0, 0]
      const start = Math.max(0, startRaw || 0)
      let end = endRaw
      if (!Number.isFinite(end) || end <= start) end = start + 2
      return `${i + 1}\n${secToStamp(start, true)} --> ${secToStamp(end, true)}\n${chunk.text.trim()}\n`
    })
    .join('\n')
}

/* ---------------- 主流程 ---------------- */

/**
 * @param {File} file 音频文件
 * @param {object} options modelId / language / onStage / onProgress
 * @returns {{chunks, text, duration, srt}}
 */
export async function transcribeAudio(file, options = {}) {
  const {
    modelId = DEFAULT_ASR_MODEL,
    language = 'chinese',
    onStage,
    onProgress,
  } = options
  if (!file) throw new Error('没有可转写的音频文件')

  onStage?.('decode', '解码音频…')
  const { samples, duration } = await decodeAudioFile(file)

  onStage?.('model', '准备识别模型…')
  let transcriber
  try {
    transcriber = await getTranscriber(modelId, onProgress)
  } catch (err) {
    const msg = String(err?.message || err)
    if (msg.includes('Failed to fetch') || msg.includes('network')) {
      throw new Error(
        '模型下载网络中断（已自动重试仍失败）。请检查网络后重新点转写；' +
        '模型首次需联网下载，成功一次后即可离线使用。'
      )
    }
    throw err
  }

  onStage?.('recognize', '正在逐段识别…')
  const output = await transcriber(samples, {
    chunk_length_s: 30,
    stride_length_s: 5,
    language,
    task: 'transcribe',
    return_timestamps: true,
  })

  const chunks = (output.chunks || []).filter((c) => c.text && c.text.trim())
  const srt = chunksToSrt(chunks)
  onStage?.('done', `识别完成，共 ${chunks.length} 段`)
  return { chunks, text: output.text, duration, srt }
}
