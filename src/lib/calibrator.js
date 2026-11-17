/**
 * 自我更新 · 即时校准
 * 不重新调用模型，直接用历史画像调整当前片段的分数。
 * 只改分数，不重排时间顺序，避免用户刚校对完的位置被打乱。
 * 幂等：原始分保存在 _baseScore，重复校准不会叠加漂移。
 */

export function calibrate(highlights, profile) {
  if (!profile?.learned || !Array.isArray(highlights)) return highlights

  return highlights.map((h) => {
    const base = Number.isFinite(h._baseScore) ? h._baseScore : h.score
    let delta = 0
    const notes = []

    // 标签偏好（温和权重，避免把分数全推到顶）
    const aff = profile.tagAffinity?.[h.tag]
    if (Number.isFinite(aff)) {
      delta += Math.round(aff * 6)
      if (aff > 0.2) notes.push('标签命中偏好')
    }

    // 时长接近历史正例
    if (profile.prefDur > 0) {
      const dur = h.end - h.start
      const gap = Math.abs(dur - profile.prefDur) / profile.prefDur
      if (gap < 0.25) {
        delta += 4
        notes.push('时长顺手')
      } else if (gap > 0.8) delta -= 3
    }

    // 文案长度接近历史正例
    if (profile.prefLen > 0) {
      const gap = Math.abs(h.quote.length - profile.prefLen) / profile.prefLen
      if (gap < 0.3) delta += 3
      else if (gap > 0.9) delta -= 3
    }

    // 低于历史保留分太多，轻微降权
    if (profile.prefScore > 0 && base < profile.prefScore - 14) delta -= 2

    const score = Math.max(0, Math.min(100, Math.round(base + delta)))
    return {
      ...h,
      _baseScore: base,
      score,
      calibrated: delta !== 0,
      calibration: delta === 0 ? null : `${delta > 0 ? '+' : ''}${delta} · ${notes.join('、') || '画像修正'}`,
    }
  })
}
