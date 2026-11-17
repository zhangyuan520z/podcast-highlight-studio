/**
 * 时间码工具
 * 统一内部表示：秒（float）
 * 展示格式：00:01:35 / 00:01:35,300
 */

/** 秒 → 时间码。withMs 为 true 时输出剪辑软件习惯的逗号毫秒 */
export function secToStamp(sec, withMs = false) {
  const total = Number.isFinite(sec) && sec > 0 ? sec : 0
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  const ms = Math.round((total - Math.floor(total)) * 1000)
  const pad = (n, len = 2) => String(n).padStart(len, '0')
  const base = `${pad(h)}:${pad(m)}:${pad(s)}`
  return withMs ? `${base},${pad(ms, 3)}` : base
}

/** 时间码 / 纯秒数 → 秒。无法识别时返回 NaN */
export function stampToSec(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN
  if (typeof input !== 'string') return NaN

  const cleaned = input.trim().replace(/[，、]/g, ',').replace(/：/g, ':')
  if (!cleaned) return NaN

  // 纯数字（秒）
  if (/^\d+(\.\d+)?$/.test(cleaned)) return parseFloat(cleaned)

  // 00:01:35,300 / 00:01:35.300 / 01:35 / 1:35
  const parts = cleaned.split(':')
  if (parts.length < 2 || parts.length > 3) return NaN

  let h = 0
  let m = 0
  let sPart = ''
  if (parts.length === 3) {
    h = Number(parts[0])
    m = Number(parts[1])
    sPart = parts[2]
  } else {
    m = Number(parts[0])
    sPart = parts[1]
  }
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN

  const s = Number(sPart.replace(',', '.'))
  if (!Number.isFinite(s)) return NaN

  return h * 3600 + m * 60 + s
}

/** 时长（秒）→ "12分34秒" 这类人读文案 */
export function humanDuration(sec) {
  const total = Math.round(Number(sec) || 0)
  if (total < 60) return `${total} 秒`
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m < 60) return s ? `${m} 分 ${s} 秒` : `${m} 分`
  const h = Math.floor(m / 60)
  return `${h} 时 ${m % 60} 分`
}

/** 裁剪用的短格式：00:00:12 */
export function shortStamp(sec) {
  return secToStamp(sec, false)
}
