import { cuesToPromptLines } from './subtitle.js'
import { buildMessages } from './prompts.js'
import { normalizeHighlights } from './highlights.js'
import { humanDuration } from './timecode.js'
import { profileToPromptText } from './feedback.js'

const STORAGE_KEY = 'phs:llm-config'
const CHUNK_CHARS = 3400
const MAX_CHUNKS = 8
const TIMEOUT_MS = 95000

export const DEFAULT_CONFIG = {
  baseUrl: import.meta.env?.VITE_LLM_BASE_URL || 'https://api.openai.com/v1',
  apiKey: import.meta.env?.VITE_LLM_API_KEY || '',
  model: import.meta.env?.VITE_LLM_MODEL || 'gpt-4o-mini',
}

export function loadConfig() {
  const envConfig = { ...DEFAULT_CONFIG }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved && typeof saved === 'object') {
      return {
        baseUrl: saved.baseUrl || envConfig.baseUrl,
        apiKey: saved.apiKey || envConfig.apiKey,
        model: saved.model || envConfig.model,
      }
    }
  } catch (e) {
    /* localStorage 不可用或内容损坏时忽略，回落到环境变量 */
  }
  return envConfig
}

export function saveConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch (e) {
    /* 隐私模式下可能写入失败，不影响本次运行 */
  }
}

function endpoint(baseUrl) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!base) throw new Error('Base URL 为空')
  if (/\/chat\/completions$/i.test(base)) return base
  return `${base}/chat/completions`
}

/** 从模型输出的任意文本里抠出第一个完整 JSON */
export function extractJson(text) {
  let s = String(text ?? '').trim()
  if (!s) throw new Error('模型返回为空')

  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()

  const candidates = [s.indexOf('{'), s.indexOf('[')].filter((i) => i >= 0)
  if (!candidates.length) throw new Error('模型返回里没有 JSON 结构')
  const start = Math.min(...candidates)

  let depth = 0
  let inStr = false
  let escaped = false

  for (let i = start; i < s.length; i += 1) {
    const ch = s[i]
    if (inStr) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      inStr = true
      continue
    }
    if (ch === '{' || ch === '[') depth += 1
    else if (ch === '}' || ch === ']') {
      depth -= 1
      if (depth === 0) {
        const slice = s.slice(start, i + 1)
        return JSON.parse(slice)
      }
    }
  }
  throw new Error('JSON 括号没有闭合，可能是输出被截断')
}

function volcArk404(err) {
  let code = ''
  try {
    code = JSON.parse(err?.body || '')?.error?.code || ''
  } catch {
    /* body 不是 JSON 时按通用情况处理 */
  }
  if (/ModelNotOpen/i.test(code)) {
    return '火山方舟：账号还没开通这个模型（ModelNotOpen）。请到火山方舟控制台「开通管理」页开通后再试。'
  }
  if (/ModelIDAccessDisabled/i.test(code)) {
    return '火山方舟：账号不允许直接用 Model ID 调用，请创建推理接入点并改用 ep-xxx 接入点 ID。'
  }
  if (/InvalidEndpointOrModel|NotFound/i.test(code)) {
    return `火山方舟：模型 ID 不存在或无权访问（${code}），请点模型标签选完整 ID 或改用 ep-xxx。`
  }
  return `火山方舟 404：${(err?.body || '').slice(0, 120) || '模型或接入点异常'}`
}

function friendlyError(err, status, baseUrl) {
  if (status === 401 || status === 403) return 'API Key 无效或没有权限（401/403），请在「模型设置」里检查。'
  if (status === 402) return '账户余额不足（402），请登录对应服务商官网充值后再试。'
  if (status === 404) {
    if (/volces\.com/i.test(baseUrl || '')) return volcArk404(err)
    return '接口地址或模型名不存在（404），请确认 Base URL 是否带 /v1、模型名是否拼写正确。'
  }
  if (status === 429) return '请求被限流（429），稍等几十秒再试，或调小「金句数量」。'
  if (status >= 500) return `模型服务端错误（${status}），稍后重试。`
  if (err?.name === 'AbortError') return '请求超时（95 秒），可能是网络太慢或上下文太长，可减少字幕或调小数量。'
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return '网络请求失败。常见原因：Base URL 不通，或该服务商不允许浏览器直连（CORS）。可改用服务商提供的「浏览器可直连」兼容端点。'
  }
  return err?.message || '未知错误'
}

async function callModel(config, messages) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(endpoint(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.3,
        messages,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      const err = new Error(`HTTP ${res.status} ${bodyText.slice(0, 160)}`)
      err.status = res.status
      err.body = bodyText
      throw err
    }
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) throw new Error('模型没有返回内容')
    return content
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 主分析入口
 * @param {object} args { cues, duration, params:{count,minDur,maxDur,style}, config, promptVersion, profile, onProgress }
 */
export async function runAnalysis({
  cues,
  duration,
  params,
  config,
  promptVersion = 'v3',
  profile = null,
  onProgress,
}) {
  if (!config?.apiKey) {
    const err = new Error('还没有配置 API Key')
    err.code = 'NO_KEY'
    throw err
  }

  // v4 依赖画像；没有历史反馈时自动退化为 v3，不把空画像塞给模型
  const profileText = profile?.learned ? profileToPromptText(profile) : ''
  const useVersion = promptVersion === 'v4' && !profileText ? 'v3' : promptVersion

  const chunks = cuesToPromptLines(cues, CHUNK_CHARS)
  const limited = chunks.slice(0, MAX_CHUNKS)
  const truncated = chunks.length > MAX_CHUNKS

  const collected = []
  const failures = []

  for (let i = 0; i < limited.length; i += 1) {
    const ctx = {
      count: params.count,
      style: params.style,
      durationText: humanDuration(duration),
      chunkIndex: i + 1,
      totalChunks: limited.length,
      chunk: limited[i],
      profileText,
    }
    onProgress?.({
      phase: 'chunk',
      index: i + 1,
      total: limited.length,
      message: `正在分析第 ${i + 1} / ${limited.length} 段字幕`,
    })

    try {
      const content = await callModel(config, buildMessages(useVersion, ctx))
      const parsed = extractJson(content)
      const arr = Array.isArray(parsed) ? parsed : parsed?.highlights
      if (Array.isArray(arr)) collected.push(...arr)
      else failures.push(`第 ${i + 1} 段返回结构不是数组`)
    } catch (err) {
      failures.push(friendlyError(err, err.status, config.baseUrl))
      // 单块失败不整体失败：其余块继续跑
    }
  }

  const cleaned = normalizeHighlights(collected, {
    cues,
    duration,
    maxCount: params.count,
    minDur: params.minDur,
    maxDur: params.maxDur,
  })

  return {
    highlights: cleaned,
    meta: {
      model: config.model,
      chunks: limited.length,
      truncated,
      rawCount: collected.length,
      failures,
      promptVersion: useVersion,
      profileInjected: Boolean(profileText),
    },
  }
}
