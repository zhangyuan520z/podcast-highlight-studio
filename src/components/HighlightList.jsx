import React, { useMemo, useState } from 'react'
import { secToStamp } from '../lib/timecode.js'
import { neighborCues } from '../lib/context.js'

const EM_WORDS = new Set([
  '其实', '真正', '核心', '关键', '本质', '但是', '而是', '不是',
  '说白了', '千万', '一定', '必须', '记住', '因为', '所以',
])
const EM_RE = /(其实|真正|核心|关键|本质|但是|而是|不是|说白了|千万|一定|必须|记住|因为|所以)/g

function renderQuote(text) {
  return String(text || '')
    .split(EM_RE)
    .map((p, i) =>
      EM_WORDS.has(p) ? (
        <span key={i} className="hl-em">{p}</span>
      ) : (
        <React.Fragment key={i}>{p}</React.Fragment>
      ),
    )
}

const KEY_HINTS = [
  ['N', '下一条'], ['P', '上一条'], ['K', '保留'],
  ['X', '弃用'], ['U', '待定'], ['Enter', '上下文'], ['Ctrl+Z', '撤销'],
]

function ContextView({ cues, h }) {
  const ctx = neighborCues(cues, h.start, h.end)
  const row = (c, kind) => (
    <div key={`${kind}-${c.start}`} className={`ctx-row ctx-${kind}`}>
      <span className="mono ctx-time">{secToStamp(c.start)}</span>
      <span>{c.text}</span>
    </div>
  )
  return (
    <div className="hl-context">
      {ctx.before.map((c) => row(c, 'before'))}
      {ctx.inside.length ? ctx.inside.map((c) => row(c, 'inside')) : row({ start: h.start, text: h.quote }, 'inside')}
      {ctx.after.map((c) => row(c, 'after'))}
    </div>
  )
}

export default function HighlightList({
  highlights,
  selectedId,
  onSelect,
  onCopyStamp,
  cues = [],
  onDecision,
  expandedId = null,
  onToggleExpand,
}) {
  const [filter, setFilter] = useState('全部')

  const tags = useMemo(() => {
    const set = new Set(highlights.map((h) => h.tag).filter(Boolean))
    return ['全部', ...Array.from(set)]
  }, [highlights])

  const visible = filter === '全部' ? highlights : highlights.filter((h) => h.tag === filter)

  return (
    <div>
      <div className="keybar">
        {KEY_HINTS.map(([k, label]) => (
          <span key={k} className="keyhint">
            <kbd>{k}</kbd>
            {label}
          </span>
        ))}
      </div>

      <div className="list-head">
        <span className="list-title">
          片段清单 <span className="mono" style={{ color: '#828D93' }}>{highlights.length}</span>
        </span>
        <div className="list-filter">
          {tags.slice(0, 6).map((t) => (
            <button
              key={t}
              className={`chip ${filter === t ? 'on' : ''}`}
              onClick={() => setFilter(t)}
              style={{ height: 24 }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 && (
        <div style={{ padding: '26px 0', fontSize: 12, color: '#828D93', textAlign: 'center' }}>
          这类标签下没有片段，换一个筛选试试。
        </div>
      )}

      {visible.map((h) => {
        const index = highlights.findIndex((x) => x.id === h.id) + 1
        const decision = h.decision || 'pending'
        return (
          <div
            key={h.id}
            className={`hl-item decision-${decision} ${h.id === selectedId ? 'active' : ''}`}
            onClick={() => onSelect(h.id)}
            role="button"
            tabIndex={0}
          >
            <span className="hl-index">{String(index).padStart(2, '0')}</span>

            <div className="hl-body">
              <p className="hl-quote">{renderQuote(h.quote)}</p>
              <div className="hl-reason">
                <span className="hl-reason-tag">{h.tag}</span>
                <span style={{ minWidth: 0 }}>{h.reason}</span>
              </div>

              <div className="hl-decision">
                <button
                  className={`dec-btn ${decision === 'keep' ? 'on' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDecision(h.id, decision === 'keep' ? 'pending' : 'keep')
                  }}
                >
                  保留
                </button>
                <button
                  className={`dec-btn dec-drop ${decision === 'drop' ? 'on' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDecision(h.id, decision === 'drop' ? 'pending' : 'drop')
                  }}
                >
                  弃用
                </button>
                <button
                  className="dec-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleExpand(h.id)
                  }}
                >
                  {expandedId === h.id ? '收起上下文' : '看上下文'}
                </button>
              </div>

              {expandedId === h.id && <ContextView cues={cues} h={h} />}
            </div>

            <div className="hl-side">
              <span className="hl-time">
                {secToStamp(h.start)} → {secToStamp(h.end)}
              </span>
              <span className="hl-dur">
                {Math.round(h.end - h.start)}s · 第 {Math.floor(h.start / 60) + 1} 分钟
              </span>
              <span className="hl-score">
                <span className="hl-score-track">
                  <span className="hl-score-fill" style={{ width: `${Math.min(100, h.score)}%` }} />
                </span>
                {h.score}
              </span>
              <button
                className="chip"
                style={{ height: 21, padding: '0 8px', fontSize: 10.5 }}
                onClick={(e) => {
                  e.stopPropagation()
                  onCopyStamp(h, false)
                }}
              >
                复制
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
