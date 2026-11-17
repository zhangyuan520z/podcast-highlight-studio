import React, { useEffect, useState } from 'react'
import { App as AntApp } from 'antd'
import { secToStamp, stampToSec } from '../lib/timecode.js'

export default function DetailPanel({ highlight, onPreview, onCopyStamp, onDelete, onAdjust, duration, hasAudio }) {
  const { message } = AntApp.useApp()
  const [startText, setStartText] = useState(secToStamp(highlight.start, true))
  const [endText, setEndText] = useState(secToStamp(highlight.end, true))

  useEffect(() => {
    setStartText(secToStamp(highlight.start, true))
    setEndText(secToStamp(highlight.end, true))
  }, [highlight.start, highlight.end])

  const applyEdit = () => {
    const s = stampToSec(startText)
    const e = stampToSec(endText)
    if (!Number.isFinite(s) || !Number.isFinite(e)) {
      message.warning('时间格式没看懂。可以写 00:01:23,400、01:23.4 或直接写秒数 83.4')
      setStartText(secToStamp(highlight.start, true))
      setEndText(secToStamp(highlight.end, true))
      return
    }
    if (e <= s) {
      message.warning('结束时间必须晚于开始时间')
      return
    }
    onAdjust(highlight.id, { start: Math.max(0, s), end: Math.min(e, duration) })
    message.success('片段区间已更新')
  }

  const copyQuote = async () => {
    try {
      await navigator.clipboard.writeText(highlight.quote)
      message.success('金句文案已复制')
    } catch (err) {
      message.error('剪贴板不可用，请手动选中文本')
    }
  }

  return (
    <div className="detail">
      <div className="detail-head">
        <span className="detail-badge">已选中</span>
        <span className="detail-time">
          {secToStamp(highlight.start, true)} → {secToStamp(highlight.end, true)} ·{' '}
          {Math.round(highlight.end - highlight.start)} 秒 · {highlight.score} 分
        </span>
      </div>

      <p className="detail-quote">{highlight.quote}</p>
      <div className="detail-reason">{highlight.reason}</div>

      <div className="detail-controls">
        <button className="chip" style={{ height: 28 }} onClick={() => onCopyStamp(highlight, true)}>
          复制时间码（含毫秒）
        </button>
        <button className="chip" style={{ height: 28 }} onClick={() => onCopyStamp(highlight, false)}>
          复制时间码（秒级）
        </button>
        <button className="chip" style={{ height: 28 }} onClick={copyQuote}>
          复制文案
        </button>
        <button className="chip" style={{ height: 28, color: '#4FBFAD', borderColor: 'rgba(79,191,173,.35)' }} onClick={() => onPreview(highlight)}>
          {hasAudio ? '试听这一段' : '试听（需先挂载音频）'}
        </button>

        <span className="time-edit">
          <input
            className="ant-input"
            value={startText}
            onChange={(e) => setStartText(e.target.value)}
            onBlur={applyEdit}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            style={{ width: 104, height: 26, padding: '0 7px', borderRadius: 4, border: '1px solid rgba(233,231,226,.12)', fontSize: 11 }}
            aria-label="片段开始时间"
          />
          <span>→</span>
          <input
            className="ant-input"
            value={endText}
            onChange={(e) => setEndText(e.target.value)}
            onBlur={applyEdit}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            style={{ width: 104, height: 26, padding: '0 7px', borderRadius: 4, border: '1px solid rgba(233,231,226,.12)', fontSize: 11 }}
            aria-label="片段结束时间"
          />
        </span>

        <button
          className="chip"
          style={{ height: 28, marginLeft: 'auto', color: '#E5645B', borderColor: 'rgba(229,100,91,.32)' }}
          onClick={() => onDelete(highlight.id)}
        >
          删除这段
        </button>
      </div>
    </div>
  )
}
