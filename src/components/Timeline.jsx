import React, { useEffect, useMemo, useRef, useState } from 'react'
import { secToStamp } from '../lib/timecode.js'

const MIN_DUR = 3
const TICK_STEPS = [15, 30, 60, 120, 180, 300, 600, 900, 1800, 3600]

function pickStep(duration) {
  const target = duration / 8
  for (const s of TICK_STEPS) if (s >= target) return s
  return 3600
}

export default function Timeline({
  cues,
  duration,
  highlights,
  selectedId,
  onSelect,
  onAdjust,
  onAdjustStart,
  onAdjustEnd,
  currentTime,
  onSeek,
  hasAudio,
}) {
  const trackRef = useRef(null)
  const waveRef = useRef(null)
  const [drag, setDrag] = useState(null)
  const [hover, setHover] = useState(null)
  const [width, setWidth] = useState(0)

  const safeDuration = duration || 1

  /* ---------- 波形：用字幕本身的密度画，不伪造音频 ---------- */
  useEffect(() => {
    const wrap = trackRef.current
    if (!wrap) return undefined

    const draw = () => {
      const cv = waveRef.current
      if (!cv) return
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      if (w <= 0 || h <= 0) return

      setWidth(w)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)

      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      if (!safeDuration || !cues?.length) return

      const buckets = Math.max(40, Math.min(260, Math.floor(w / 3)))
      const acc = new Array(buckets).fill(0)

      for (const c of cues) {
        const a = Math.max(0, Math.floor((c.start / safeDuration) * buckets))
        const b = Math.min(buckets - 1, Math.floor((c.end / safeDuration) * buckets))
        const density = Math.min(1, Math.max(0.16, (c.text ? c.text.length : 0) / 42))
        for (let i = a; i <= b; i += 1) acc[i] = Math.max(acc[i], density)
      }

      const max = Math.max(...acc, 0.001)
      const barW = w / buckets

      for (let i = 0; i < buckets; i += 1) {
        const ratio = acc[i] / max
        const bh = Math.max(2, ratio * h * 0.8)
        ctx.fillStyle = `rgba(79, 191, 173, ${0.14 + ratio * 0.26})`
        ctx.fillRect(i * barW + 0.5, (h - bh) / 2, Math.max(1, barW - 1), bh)
      }
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [cues, safeDuration])

  /* ---------- 拖拽 ---------- */
  const pxToSec = (px) => {
    const w = trackRef.current?.clientWidth || 1
    return (px / w) * safeDuration
  }

  useEffect(() => {
    if (!drag) return undefined

    const onMove = (e) => {
      const dt = pxToSec(e.clientX - drag.startX)
      let s = drag.origStart
      let en = drag.origEnd

      if (drag.mode === 'move') {
        const shift = Math.max(-s, Math.min(dt, safeDuration - en))
        s += shift
        en += shift
      } else if (drag.mode === 'left') {
        s = Math.max(0, Math.min(s + dt, en - MIN_DUR))
      } else {
        en = Math.min(safeDuration, Math.max(en + dt, s + MIN_DUR))
      }
      onAdjust(drag.id, { start: s, end: en })
    }

    const onUp = () => {
      if (typeof onAdjustEnd === 'function') onAdjustEnd(drag.id)
      setDrag(null)
      setHover(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag, safeDuration, onAdjust, onAdjustEnd])

  const startDrag = (e, h, mode) => {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    if (typeof onAdjustStart === 'function') onAdjustStart()
    onSelect(h.id)
    setDrag({ id: h.id, mode, startX: e.clientX, origStart: h.start, origEnd: h.end })
  }

  const ticks = useMemo(() => {
    const step = pickStep(safeDuration)
    const out = []
    for (let t = 0; t <= safeDuration; t += step) out.push(t)
    if (out[out.length - 1] !== safeDuration) out.push(safeDuration)

    // 终点刻度常常紧贴着倒数第二个，两个时间码会叠在一起：挤掉倒数第二个
    if (out.length > 2 && out[out.length - 1] - out[out.length - 2] < step * 0.5) {
      out.splice(out.length - 2, 1)
    }
    return out
  }, [safeDuration])

  const hovered = highlights.find((h) => h.id === hover)
  const hoverPct = hovered ? (hovered.start / safeDuration) * 100 : 0

  const handleRulerClick = (e) => {
    if (!hasAudio || !onSeek) return
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onSeek(ratio * safeDuration)
  }

  return (
    <div className="tl">
      <div className="tl-head">
        <span className="tl-title">高光时间轴</span>
        <div className="tl-legend">
          <span>
            <i style={{ background: '#F6A72B' }} />
            可剪片段
          </span>
          <span>
            <i style={{ background: 'rgba(79,191,173,.55)' }} />
            字幕密度
          </span>
          <span>拖动两端可微调</span>
        </div>
      </div>

      <div className="tl-ruler">
        {ticks.map((t, i) => {
          const first = i === 0
          const last = i === ticks.length - 1
          return (
            <span
              key={t}
              className="tl-tick"
              style={{
                left: `${(t / safeDuration) * 100}%`,
                // 首尾刻度向内收，否则文字会溢出卡片边界
                transform: first ? 'none' : last ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {secToStamp(t)}
            </span>
          )
        })}
      </div>

      <div
        className="tl-track"
        ref={trackRef}
        onClick={handleRulerClick}
        style={{ cursor: hasAudio ? 'crosshair' : 'default' }}
      >
        <canvas className="tl-wave" ref={waveRef} />
        <div className="tl-base" />

        {highlights.map((h, i) => {
          const left = (h.start / safeDuration) * 100
          const wPct = ((h.end - h.start) / safeDuration) * 100
          const active = h.id === selectedId
          const dragging = drag?.id === h.id
          return (
            <div
              key={h.id}
              className={`tl-bar ${h.score < 75 ? 'low' : ''} ${active ? 'active' : ''} ${
                dragging ? 'dragging' : ''
              }`}
              style={{ left: `${left}%`, width: `max(${wPct}%, 7px)` }}              title={`${secToStamp(h.start, true)} → ${secToStamp(h.end, true)}`}
              onPointerDown={(e) => startDrag(e, h, 'move')}
              onPointerEnter={() => setHover(h.id)}
              onPointerLeave={() => (drag ? null : setHover(null))}
              onDoubleClick={(e) => {
                e.stopPropagation()
                onSelect(h.id)
              }}
            >
              <span className="tl-bar-idx">{String(i + 1).padStart(2, '0')}</span>
              <span
                className="tl-handle left"
                onPointerDown={(e) => startDrag(e, h, 'left')}
                title="拖动调整开始时间"
              />
              <span
                className="tl-handle right"
                onPointerDown={(e) => startDrag(e, h, 'right')}
                title="拖动调整结束时间"
              />
            </div>
          )
        })}

        {hasAudio && (
          <span
            className="tl-playhead"
            style={{ left: `${Math.min(100, Math.max(0, (currentTime / safeDuration) * 100))}%` }}
          />
        )}

        {hovered && !drag && (
          <div
            className="tl-tip"
            style={{
              left: `${hoverPct}%`,
              top: -6,
              transform: hoverPct > 55 ? 'translate(-100%, -100%)' : 'translate(0, -100%)',
            }}
          >
            <div className="tl-tip-meta">
              {secToStamp(hovered.start, true)} → {secToStamp(hovered.end, true)} · {Math.round(hovered.end - hovered.start)}s ·{' '}
              {hovered.score} 分
            </div>
            {hovered.quote.length > 88 ? `${hovered.quote.slice(0, 88)}…` : hovered.quote}
          </div>
        )}
      </div>

      <div className="transport">
        <span className="transport-time">
          <b>{secToStamp(currentTime)}</b> / {secToStamp(safeDuration)}
        </span>
        <span className="transport-note">
          {hasAudio
            ? '点时间轴任意位置可跳转播放；拖动片段两端改起止点'
            : '未挂载音频，时间轴按字幕推算；挂载音频后可直接试听片段'}
        </span>
      </div>
    </div>
  )
}
