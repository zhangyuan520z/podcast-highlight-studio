import { stampToSec } from './timecode.js'

/**
 * 字幕解析
 * 支持 .srt / .vtt / 带时间戳的文本 / 纯文本
 * 返回统一结构 { mode, cues, duration, stats }
 */

const TIMECODE = '(?:\\d{1,2}:)?\\d{1,2}:\\d{2}(?:[,.]\\d{1,3})?'
const TIMELINE_RE = new RegExp(`^(${TIMECODE})\\s*-->\\s*(${TIMECODE})`, 'i')

/** 估算中文播讲时长：约 4.6 字/秒，含停顿 */
const CHARS_PER_SEC = 4.6

export function parseSubtitle(raw) {
  const text = String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()

  if (!text) {
    return { mode: 'empty', cues: [], duration: 0, stats: null }
  }

  const timed = parseTimed(text)
  if (timed.length >= 2) {
    return buildResult(timed, 'timestamp')
  }

  const plain = parsePlain(text)
  return buildResult(plain, 'plain')
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

function parsePlain(text) {
  // 按句末标点切句，保留标点
  const rawSentences = text
    .split(/(?<=[。！？!?；;…])/u)
    .flatMap((chunk) => chunk.split('\n'))
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const cues = []
  let pending = ''

  const push = () => {
    const body = pending.trim()
    if (!body) {
      pending = ''
      return
    }
    const dur = Math.max(1.4, body.length / CHARS_PER_SEC)
    const start = cues.length ? cues[cues.length - 1].end + 0.3 : 0
    cues.push({ start, end: start + dur, text: body })
    pending = ''
  }

  for (const s of rawSentences) {
    const next = pending ? `${pending}${s}` : s
    if (next.length >= 44 || pending.length >= 20) {
      // 先把已有 pending 落盘，再把当前句留作下一段
      if (pending) {
        push()
        pending = s
      } else {
        pending = s
      }
    } else {
      pending = next
    }
    if (pending.length >= 44) push()
  }
  if (pending) push()

  return cues
}

function buildResult(cues, mode) {
  const duration = cues.reduce((max, c) => Math.max(max, c.end), 0)
  const totalChars = cues.reduce((sum, c) => sum + c.text.length, 0)
  return {
    mode,
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
