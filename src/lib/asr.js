/**
 * 本地语音转写（ASR）
 *
 * 在浏览器内用 transformers.js 跑 Whisper，全程本地推理：
 * 音频不离开本机、不需要 API Key、输出带时间戳的分段，再转成 SRT 走现有金句流程。
 *
 * 推理在 Web Worker 独立线程执行（见 workers/transcribe.worker.js），
 * 长音频也不会卡住主线程；主线程只负责音频解码、重采样与 UI，并可随时终止转写。
 * 极速档（whisper-tiny）与平衡档（whisper-base）模型已随项目内置在 public/models，
 * 同源加载、断网也能转写；更大的精准档（whisper-small）首次从 hf-mirror 镜像下载，
 * 之后由浏览器缓存，可离线使用。
 */
import { secToStamp } from './timecode.js'

const TARGET_SR = 16000

/** 可选模型档位：首次下载体积越大，中文精度通常越好 */
export const ASR_MODELS = [
  { id: 'Xenova/whisper-tiny', label: '极速', size: '约 40 MB', note: '模型已内置，断网也能用，速度最快', local: 'whisper-tiny' },
  { id: 'Xenova/whisper-base', label: '平衡', size: '约 80 MB', note: '模型已内置，断网也能用，速度与精度均衡', local: 'whisper-base' },
  { id: 'Xenova/whisper-small', label: '精准', size: '约 245 MB', note: '中文识别更准，首次需联网下载', local: null },
]

export const DEFAULT_ASR_MODEL = ASR_MODELS[0].id

export const ASR_LANGUAGES = [
  { key: 'chinese', label: '中文' },
  { key: 'english', label: '英文' },
  { key: null, label: '自动检测' },
]

/* ---------------- Worker 生命周期 ---------------- */

let worker = null
let resolveCurrent = null
let rejectCurrent = null
let callbacks = {}

function teardownWorker() {
  if (worker) {
    worker.onmessage = null
    worker.onerror = null
    worker = null
  }
  resolveCurrent = null
  rejectCurrent = null
  callbacks = {}
}

function ensureWorker() {
  if (worker) return worker
  const w = new Worker(new URL('../workers/transcribe.worker.js', import.meta.url), { type: 'module' })

  w.onmessage = (event) => {
    const msg = event.data || {}
    if (msg.type === 'stage') {
      callbacks.onStage?.(msg.stage, msg.note)
    } else if (msg.type === 'progress') {
      callbacks.onProgress?.(msg.stage, msg.pct, msg.note)
    } else if (msg.type === 'done') {
      const resolve = resolveCurrent
      teardownWorker()
      resolve?.(msg.result)
    } else if (msg.type === 'error') {
      const reject = rejectCurrent
      teardownWorker()
      reject?.(new Error(msg.message))
    }
  }

  w.onerror = (event) => {
    const reject = rejectCurrent
    teardownWorker()
    reject?.(new Error(event.message || '转写线程异常终止'))
  }

  worker = w
  return w
}

/** 终止当前转写：立即销毁 Worker，主线程立刻恢复可操作 */
export function cancelTranscribe() {
  if (!worker) return
  const reject = rejectCurrent
  if (worker) worker.terminate()
  teardownWorker()
  reject?.(new Error('__CANCELLED__'))
}

/* ---------------- 音频解码 + 重采样到 16k 单声道（主线程） ---------------- */

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

  const base = import.meta.env.BASE_URL || '/'
  callbacks = { onStage, onProgress }

  const job = new Promise((resolve, reject) => {
    resolveCurrent = resolve
    rejectCurrent = reject
    const w = ensureWorker()
    // transfer 采样数据，避免拷贝
    w.postMessage(
      { type: 'start', samples, modelId, language, base },
      [samples.buffer],
    )
  })

  const result = await job
  const chunks = (result.chunks || []).filter((c) => c.text && c.text.trim())
  const srt = chunksToSrt(chunks)
  onStage?.('done', `识别完成，共 ${chunks.length} 段`)
  return {
    chunks,
    text: result.text,
    duration,
    srt,
    latinHits: result.latinHits || [],
    hasLatin: Boolean(result.hasLatin),
    langMismatch: result.langMismatch || { suspected: false },
  }
}
