/**
 * 转写 Web Worker
 *
 * 在独立线程里加载 Whisper、跑 ONNX 推理，避免长音频在主线程同步计算
 * 导致「此页面没有响应」。主线程只负责音频解码与 UI，通过 postMessage 通信。
 * 取消由主线程直接 terminate() 本 Worker，因此这里不做取消标志轮询。
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

import { normalizeChunks, detectLanguageMismatch } from '../lib/text-normalize.js'

/* ---------------- 健壮 fetch：剥离 Range + 网络失败重试 ---------------- */

const MAX_FETCH_ATTEMPTS = 5 // 首次 + 4 次重试，大文件下载更抗瞬时抖动

let nativeFetch = null
function getNativeFetch() {
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

// 指数退避 + 随机抖动，避免重试恰好撞上同一波拥塞
function backoffMs(attempt) {
  const base = 600 * 2 ** attempt // 0.6s / 1.2s / 2.4s / 4.8s
  const jitter = Math.random() * 500
  return base + jitter
}

async function robustFetch(input, init = {}) {
  const nf = getNativeFetch()
  const finalInit = stripRange(init)
  let lastError
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await nf(input, finalInit)
    } catch (err) {
      lastError = err
      if (attempt < MAX_FETCH_ATTEMPTS - 1) {
        const wait = backoffMs(attempt)
        post('progress', { stage: 'model', pct: -1, note: `网络抖动，${Math.round(wait / 100) / 10} 秒后第 ${attempt + 2} 次重试…` })
        await sleep(wait)
      }
    }
  }
  throw lastError
}

/* ---------------- 模型档位（与 asr.js 的 ASR_MODELS 保持一致） ---------------- */

const MODEL_LOCAL = {
  'Xenova/whisper-tiny': 'whisper-tiny',
}

let cachedModelId = null
let cachedTranscriber = null

function post(type, payload = {}) {
  globalThis.postMessage({ type, ...payload })
}

async function getTranscriber(modelId, base) {
  if (cachedTranscriber && cachedModelId === modelId) return cachedTranscriber

  const { pipeline, env } = await import('@huggingface/transformers')
  const localName = MODEL_LOCAL[modelId]

  if (localName) {
    // 内置离线模型：同源加载，无 CORS、断网可用
    env.remoteHost = new URL(`${base}models/`, globalThis.location.href).href
    env.remotePathTemplate = '{model}/'
  } else {
    // 未内置的大模型：走镜像，首次需联网
    env.remoteHost = 'https://hf-mirror.com/'
    env.remotePathTemplate = '{model}/resolve/{revision}/'
  }
  env.allowLocalModels = false

  // 本地 ONNX 运行时，不依赖 jsDelivr
  env.backends.onnx.wasm.wasmPaths = {
    mjs: `${base}ort/ort-wasm-simd-threaded.asyncify.mjs`,
    wasm: `${base}ort/ort-wasm-simd-threaded.asyncify.wasm`,
  }
  // Worker 内单线程，不需要 SharedArrayBuffer / COOP / COEP
  env.backends.onnx.wasm.numThreads = 1
  env.fetch = robustFetch

  cachedTranscriber = await pipeline('automatic-speech-recognition', modelId, {
    device: 'wasm',
    progress_callback: (e) => {
      if (e.status === 'progress') post('progress', { stage: 'model', pct: e.progress, note: `下载 ${e.file}` })
      else if (e.status === 'done') post('progress', { stage: 'model', pct: 100, note: `已缓存 ${e.file}` })
    },
  })
  cachedModelId = modelId
  return cachedTranscriber
}

async function run({ samples, modelId, language, base }) {
  post('stage', { stage: 'model', note: '准备识别模型…' })
  const transcriber = await getTranscriber(modelId, base)

  post('stage', { stage: 'recognize', note: '正在逐段识别…' })
  const output = await transcriber(samples, {
    chunk_length_s: 30,
    stride_length_s: 5,
    language,
    task: 'transcribe',
    return_timestamps: true,
  })

  post('stage', { stage: 'polish', note: '正在繁转简与文本规范化…' })
  const normalized = await normalizeChunks(output.chunks || [], { language })

  // 自动检测模式下，若结果几乎全是英文、几乎无汉字，疑似小模型语种误判
  const langMismatch =
    language === null ? detectLanguageMismatch(normalized.text || output.text || '') : { suspected: false }

  post('done', {
    result: {
      chunks: normalized.chunks,
      text: normalized.text || output.text || '',
      latinHits: normalized.latinHits,
      hasLatin: normalized.hasLatin,
      langMismatch,
    },
  })
}

globalThis.addEventListener('message', (event) => {
  const msg = event.data
  if (!msg || msg.type !== 'start') return
  run(msg).catch((err) => {
    const message = String(err?.message || err)
    const isNetwork =
      message.includes('Failed to fetch') ||
      message.includes('network') ||
      message.includes('NetworkError') ||
      message.includes('load')
    if (isNetwork) {
      post('error', {
        message:
          `模型文件下载失败（已自动重试 ${MAX_FETCH_ATTEMPTS} 次仍未成功），不是转写功能的问题。` +
          '可按顺序尝试：1) 换稳定网络（手机热点/有线）后重新点转写；' +
          '2) 暂时选「极速」档，该档模型已内置、断网也能用；' +
          '3) 若公司/校园网拦截了 hf-mirror.com，换网络环境再下载。未内置模型成功下载一次后即可离线使用。',
      })
    } else {
      post('error', { message: `音频转写失败：${message}` })
    }
  })
})
