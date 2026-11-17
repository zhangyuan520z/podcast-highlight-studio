import { stampToSec } from './timecode.js'

/**
 * 字幕解析
 * 支持 .srt / .vtt / 带时间戳的文本 / 纯文本
 * 返回统一结构 { mode, cues, duration, stats }
 */

const TIMECODE = '(?:\\d{1,2}:)?\\d{1,2}:\\d{2}(?:[,.]\\d{1,3})?'
const TIMELINE_RE = new RegExp(`^(${TIMECODE})\\s*-->\\s*(${TIMECODE})`, 'i')

/** 语速档位：中文播讲的“内容单位 / 秒”，正常约 4.6（≈276 字/分，含停顿） */
export const SPEECH_RATES = [
  { key: '慢', charsPerSec: 3.6 },
  { key: '正常', charsPerSec: 4.6 },
  { key: '快', charsPerSec: 5.6 },
]
export const DEFAULT_CHARS_PER_SEC = 4.6

/**
 * 统计内容单位：中文按字、英文按单词、数字按词，标点不计。
 * 比直接用字符串长度更准，避免英文按字母数高估时长。
 */
export function countUnits(text) {
  const t = String(text || '')
  const cjk = (t.match(/[一-鿿㐀-䶿]/g) || []).length
  const rest = t.replace(/[一-鿿㐀-䶿]/g, ' ')
  const words = (rest.match(/[A-Za-z]+(?:[’'][A-Za-z]+)?|\d+(?:[.,]\d+)?/g) || []).length
  return cjk + words
}

export function parseSubtitle(raw, options = {}) {
  const { charsPerSec = DEFAULT_CHARS_PER_SEC, realDuration = null } = options
  const text = String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()

  if (!text) {
    return { mode: 'empty', cues: [], duration: 0, stats: null, estimated: false }
  }

  const timed = parseTimed(text)
  if (timed.length >= 2) {
    return buildResult(timed, 'timestamp', false)
  }

  const plain = parsePlain(text, { charsPerSec, realDuration })
  // 只有真正锚定了用户给的真实总时长，才不算估算
  const anchored = Number.isFinite(realDuration) && realDuration > 0
  return buildResult(plain, 'plain', !anchored)
}

function parseTimed(text) {
  const lines = text.split('\n')
  const cues = []
  let current = null

  const flush = () => {
    if (current && current.text) {
      const start = Number.isFinite(current.start) ? current.start : 0
      const end = Number.isFinite(current.end) && current.end > start ? current.end : start + 1
      cues.push({ start, end, text: current.text })
    }
    current = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flush()
      continue
    }
    if (/WEBVTT/i.test(line) || /^NOTE\s/i.test(line) || /^STYLE$/i.test(line) || /^REGION$/i.test(line)) {
      continue
    }

    const m = line.match(TIMELINE_RE)
    if (m) {
      flush()
      current = { start: stampToSec(m[1]), end: stampToSec(m[2]), text: '' }
      continue
    }

    // 纯序号行：单独出现时丢弃
    if (/^\d+$/.test(line) && !current) continue

    if (current) {
      // 去掉 vtt 内联标记 <c> <i> 之类
      const clean = line.replace(/<[^>]*>/g, '').trim()
      if (clean) current.text = current.text ? `${current.text} ${clean}` : clean
    }
  }
  flush()

  return cues.filter((c) => c.text)
}

function parsePlain(text, options) {
  const { charsPerSec, realDuration } = options
  const bodies = splitPlainBodies(text)
  if (!bodies.length) return []

  const units = bodies.map((b) => Math.max(1, countUnits(b)))
  const totalUnits = units.reduce((a, b) => a + b, 0)

  const cues = []
  const anchored = Number.isFinite(realDuration) && realDuration > 0

  if (anchored) {
    // 锚定真实总时长：按各段内容单位权重比例分配，时间轴比例与真实音频一致
    let cursor = 0
    bodies.forEach((body, i) => {
      const dur = Math.max(0.6, (realDuration * units[i]) / totalUnits)
      cues.push({ start: cursor, end: cursor + dur, text: body })
      cursor += dur
    })
    // 消除浮点累计误差，末段结束对齐真实总时长
    cues[cues.length - 1].end = realDuration
    return cues
  }

  // 未锚定：按选定语速估算，段间留 0.3 秒停顿
  bodies.forEach((body, i) => {
    const dur = Math.max(1.4, units[i] / charsPerSec)
    const start = cues.length ? cues[cues.length - 1].end + 0.3 : 0
    cues.push({ start, end: start + dur, text: body })
  })
  return cues
}

/** 纯文本切句并合并成约 44 字的段落，返回段落文本数组 */
function splitPlainBodies(text) {
  const rawSentences = text
    .split(/(?<=[。！？!?；;…])/u)
    .flatMap((chunk) => chunk.split('\n'))
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const bodies = []
  let pending = ''
  const flush = () => {
    const body = pending.trim()
    if (body) bodies.push(body)
    pending = ''
  }

  for (const s of rawSentences) {
    const next = pending ? `${pending}${s}` : s
    if (next.length >= 44 || pending.length >= 20) {
      if (pending) {
        flush()
        pending = s
      } else {
        pending = s
      }
    } else {
      pending = next
    }
    if (pending.length >= 44) flush()
  }
  flush()
  return bodies
}

function buildResult(cues, mode, estimated) {
  const duration = cues.reduce((max, c) => Math.max(max, c.end), 0)
  const totalChars = cues.reduce((sum, c) => sum + c.text.length, 0)
  return {
    mode,
    estimated: Boolean(estimated),
    cues: cues.map((c, i) => ({ ...c, id: `cue-${i}` })),
    duration,
    stats: {
      cueCount: cues.length,
      totalChars,
      speechCharsPerMin: duration > 0 ? Math.round((totalChars / duration) * 60) : 0,
    },
  }
}

/** 取某区间内的字幕文本，用于补齐模型没给全的 quote */
export function textInRange(cues, start, end) {
  const hit = cues.filter((c) => c.end > start + 0.2 && c.start < end - 0.2)
  const body = hit.map((c) => c.text).join(' ').trim()
  return body
}

/** 把字幕渲染成给模型看的材料：每行一条 [起 → 止] 文本 */
export function cuesToPromptLines(cues, maxChars = 3800) {
  const chunks = []
  let bucket = []
  let size = 0

  for (const c of cues) {
    const line = `[${fmt(c.start)} --> ${fmt(c.end)}] ${c.text}`
    if (size + line.length > maxChars && bucket.length) {
      chunks.push(bucket.join('\n'))
      bucket = []
      size = 0
    }
    bucket.push(line)
    size += line.length + 1
  }
  if (bucket.length) chunks.push(bucket.join('\n'))
  return chunks
}

function fmt(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.round((sec - Math.floor(sec)) * 1000)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}
