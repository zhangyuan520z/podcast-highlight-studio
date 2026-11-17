import { secToStamp } from './timecode.js'

/** 导出剪辑清单 CSV（带 BOM，Excel / WPS 直接打开不乱码） */
export function buildCsv(highlights) {
  const header = ['序号', '开始时间', '结束时间', '时长(秒)', '金句文案', '推荐理由', '评分', '标签']
  const rows = highlights.map((h, i) => [
    String(i + 1),
    secToStamp(h.start, true),
    secToStamp(h.end, true),
    (h.end - h.start).toFixed(1),
    h.quote,
    h.reason,
    String(h.score),
    h.tag,
  ])

  const escape = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const text = [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n')
  return `\uFEFF${text}`
}

export function downloadCsv(highlights, filename = '播客金句剪辑清单.csv') {
  const blob = new Blob([buildCsv(highlights)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 纯文本清单：粘进剪映/PR 的备注区，或发给剪辑师 */
export function buildPlainList(highlights) {
  return highlights
    .map(
      (h, i) =>
        `${String(i + 1).padStart(2, '0')}. ${secToStamp(h.start, true)} → ${secToStamp(h.end, true)}  (${Math.round(
          h.end - h.start,
        )}s / ${h.score}分 / ${h.tag})\n    ${h.quote}\n`,
    )
    .join('\n')
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (e) {
    /* 非安全上下文或浏览器拒绝，走下面的兜底 */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch (e) {
    return false
  }
}
