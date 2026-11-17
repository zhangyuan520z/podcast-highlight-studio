import { stampToSec } from './timecode.js'
import { textInRange } from './subtitle.js'

/**
 * 模型输出的清洗与兜底
 * 这一步是「迭代 2」要解决的问题：模型给的时间戳格式五花八门，
 * 前端不能直接拿来渲染，必须先归一化成秒，再 clamp 到字幕区间内。
 */

const START_KEYS = ['start', 'startSec', 'start_sec', 'startTime', 'begin', 'from', 'start_time', 'startTimecode']
const END_KEYS = ['end', 'endSec', 'end_sec', 'endTime', 'to', 'end_time', 'endTimecode']
const QUOTE_KEYS = ['quote', 'text', 'content', 'sentence', 'summary', 'golden_sentence']
const REASON_KEYS = ['reason', 'why', 'rationale', 'comment']
const SCORE_KEYS = ['score', 'rating', 'weight', 'confidence']
const TAG_KEYS = ['tag', 'type', 'category', 'label']

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]
  }
  return undefined
}

function toScore(v, fallback) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  const scaled = n <= 1 && n > 0 ? n * 100 : n
  return Math.max(0, Math.min(100, Math.round(scaled)))
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * @param {any} raw 模型返回的数组
 * @param {object} opts { cues, duration, maxCount, minDur, maxDur }
 */
export function normalizeHighlights(raw, opts) {
  const { cues = [], duration = 0, maxCount = 8, minDur = 15, maxDur = 60 } = opts || {}
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.highlights) ? raw.highlights : []

  const safeDuration = Math.max(duration, 0.1)

  let list = arr
    .map((item) => {
      const sRaw = pick(item, START_KEYS)
      const eRaw = pick(item, END_KEYS)
      let start = stampToSec(sRaw)
      let end = stampToSec(eRaw)

      // 模型偶尔给 "00:35 - 01:10" 这种塞在一个字段里的写法
      if (!Number.isFinite(start) && typeof sRaw === 'string' && /-|~|至/.test(sRaw)) {
        const [a, b] = sRaw.split(/-|~|至/)
        start = stampToSec(a)
        end = Number.isFinite(end) ? end : stampToSec(b)
      }
      if (!Number.isFinite(start)) return null
      if (!Number.isFinite(end) || end <= start) end = start + minDur

      start = clamp(start, 0, safeDuration)
      end = clamp(end, 0, safeDuration)

      // 时长修正
      if (end - start < minDur) {
        const want = Math.min(minDur, safeDuration)
        const grow = want - (end - start)
        const left = Math.min(start, grow / 2)
        start -= left
        end = Math.min(safeDuration, end + (grow - left))
        if (end - start < want) start = Math.max(0, end - want)
      }
      if (end - start > maxDur) end = start + maxDur

      let quote = String(pick(item, QUOTE_KEYS) ?? '').trim()
      if (quote.length < 6 && cues.length) quote = textInRange(cues, start, end)
      if (!quote) quote = '（该区间无字幕文本）'

      return {
        start,
        end,
        quote,
        reason: String(pick(item, REASON_KEYS) ?? '').trim() || '模型未给出理由',
        score: toScore(pick(item, SCORE_KEYS), 78),
        tag: String(pick(item, TAG_KEYS) ?? '').trim() || '金句',
      }
    })
    .filter(Boolean)

  // 重叠去重：分数高的优先保留
  // 剪辑清单里两段共用同一秒，导进剪映就会出现重复素材，所以任何实质交集都要判冲突
  list.sort((a, b) => b.score - a.score)
  const kept = []
  for (const h of list) {
    const conflict = kept.some((k) => {
      const inter = Math.min(h.end, k.end) - Math.max(h.start, k.start)
      return inter > 0.05
    })
    if (!conflict) kept.push(h)
  }

  const result = kept
    .sort((a, b) => a.start - b.start)
    .slice(0, Math.max(1, maxCount))
    .map((h, i) => ({
      decision: h.decision || 'pending',
      ...h,
      id: `hl-${i}-${Math.round(h.start * 10)}`,
    }))

  return result
}

/* ------------------------------------------------------------------ */
/* 本地模拟引擎：无 API Key / 调用失败时的可演示兜底                        */
/* ------------------------------------------------------------------ */

const STRONG = ['其实', '真正', '核心', '关键', '本质', '最重要', '重点是', '问题是', '说白了', '归根结底', '千万', '一定', '必须', '建议', '结论']
const CONTRAST = ['但是', '不过', '反而', '恰恰', '而是', '并不', '未必', '不是']
const EMOTION = ['震惊', '崩溃', '后悔', '离谱', '太爽', '绝了', '救命', '焦虑', '痛苦', '开心', '兴奋', '害怕', '难受', '爽']
const STORY = ['我记得', '有一次', '当时', '那天', '后来', '结果', '那时候']
const QUOTEISH = ['所谓', '一句话', '我常说', '我一直认为', '这就是', '换句话说']

const TAGS = { 观点: 1, 干货: 1, 故事: 1, 情绪: 1, 数字: 1 }

function scoreCue(cue) {
  const t = cue.text
  let score = 58
  const hits = { 观点: 0, 干货: 0, 故事: 0, 情绪: 0, 数字: 0 }
  const features = []
  const add = (label) => {
    if (!features.includes(label)) features.push(label)
  }

  STRONG.forEach((w) => {
    if (t.includes(w)) {
      score += 7
      hits.观点 += 1
      hits.干货 += 1
      add('强调判断')
    }
  })
  CONTRAST.forEach((w) => {
    if (t.includes(w)) {
      score += 6
      hits.观点 += 1
      add('含转折')
    }
  })
  EMOTION.forEach((w) => {
    if (t.includes(w)) {
      score += 6
      hits.情绪 += 1
      add('情绪词')
    }
  })
  STORY.forEach((w) => {
    if (t.includes(w)) {
      score += 5
      hits.故事 += 1
      add('叙事开头')
    }
  })
  QUOTEISH.forEach((w) => {
    if (t.includes(w)) {
      score += 6
      hits.观点 += 1
      add('金句句式')
    }
  })
  if (/\d|百分之|倍|年月|个月|块钱|[零一二三四五六七八九十百千万]{2,}/.test(t)) {
    score += 5
    hits.数字 += 1
    add('具体数字')
  }
  if (/[？?]/.test(t)) {
    score += 4
    add('设问')
  }
  if (t.length >= 20 && t.length <= 140) {
    score += 5
    add('信息密度高')
  }
  if (t.length < 12) score -= 9
  if (t.length > 180) score -= 5

  const tag =
    Object.entries(hits)
      .filter(([k]) => TAGS[k])
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k)[0] || '观点'

  return { score: Math.max(52, Math.min(97, Math.round(score))), tag, features }
}

export function analyzeLocally(cues, opts = {}) {
  const { count = 6, minDur = 15, maxDur = 60 } = opts
  if (!cues.length) return []

  const ranked = cues
    .map((c, idx) => ({ idx, cue: c, ...scoreCue(c) }))
    .sort((a, b) => b.score - a.score)

  const segments = []
  for (const item of ranked) {
    if (segments.length >= count * 3) break
    const { idx, cue, score, tag, features } = item
    let start = cue.start
    let end = cue.end
    let j = idx + 1
    // 向后吸收后续字幕，凑成一个可剪辑的片段
    while (j < cues.length) {
      const next = cues[j]
      if (next.end - start > maxDur) break
      if (cues[j - 1] && next.start - cues[j - 1].end > 1.2) break
      end = next.end
      if (end - start >= minDur * 1.1) break
      j += 1
    }
    if (end - start < minDur) {
      end = Math.min(cues[cues.length - 1].end, start + minDur)
    }
    if (end - start < 3) continue

    const segEnd = Math.min(end, start + maxDur)

    // 金句文案不要整段区间复读：从句首开始累积，控制在 26~72 字，保证是一句能被单独引用的话
    let quote = ''
    for (let k = idx; k < cues.length; k += 1) {
      const piece = cues[k].text
      if (k > idx && quote.length + piece.length > 72) break
      quote = quote ? `${quote}${piece}` : piece
      if (quote.length >= 26) break
    }
    if (!quote) quote = cue.text

    const featText = features.length ? features.slice(0, 3).join('、') : `「${tag}」特征`
    segments.push({
      start,
      end: segEnd,
      quote,
      reason: `${featText}，成片约 ${Math.round(segEnd - start)} 秒，可独立成条。`,
      score,
      tag,
    })
  }

  return normalizeHighlights(segments, {
    cues,
    duration: cues[cues.length - 1].end,
    maxCount: count,
    minDur,
    maxDur,
  })
}
