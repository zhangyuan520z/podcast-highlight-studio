/**
 * 片段上下文：金句是从对话里抠出来的，单看一句常常不知所云。
 * 给定片段区间，返回它前面、内部、后面的相邻字幕。
 */

export function neighborCues(cues, start, end, before = 2, after = 2) {
  const n = cues.length
  if (!n) return { before: [], inside: [], after: [] }

  let first = cues.findIndex((c) => c.end > start && c.start < end)
  let last = -1
  for (let i = n - 1; i >= 0; i -= 1) {
    if (cues[i].end > start && cues[i].start < end) {
      last = i
      break
    }
  }

  // 区间内没有字幕（纯文本估算可能错位）：定位到时间上的插入点
  if (first < 0) {
    let pos = cues.findIndex((c) => c.start >= start)
    if (pos < 0) pos = n
    first = pos
    last = pos - 1
  }

  const bStart = Math.max(0, first - before)
  const aEnd = Math.min(n, last + 1 + after)

  return {
    before: cues.slice(bStart, first),
    inside: first <= last ? cues.slice(first, last + 1) : [],
    after: cues.slice(last + 1, aEnd),
  }
}
