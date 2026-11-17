import React from 'react'

export default function TopBar({
  engineLabel,
  mode,
  onOpenSettings,
  onOpenPrompts,
  onOpenEvolve,
  onOpenHelp,
  learned,
  positiveCount,
  selfEvolve,
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="10" width="2" height="4" rx="1" fill="#4FBFAD" />
            <rect x="7" y="7" width="2" height="10" rx="1" fill="#4FBFAD" />
            <rect x="11" y="4" width="2" height="16" rx="1" fill="#4FBFAD" />
            <rect x="15" y="8" width="2" height="8" rx="1" fill="#4FBFAD" />
            <rect x="19" y="11" width="2" height="3" rx="1" fill="#4FBFAD" />
            <rect x="6" y="14" width="13" height="3" rx="1" fill="#F6A72B" />
          </svg>
        </span>
        <div>
          <h1 className="brand-title">
            金句时间轴
            <span className="brand-version">v5.0</span>
          </h1>
          <div className="brand-sub">播客高光剪辑台 · 识别 · 校对 · 导出</div>
        </div>
      </div>

      <span className="topbar-spacer" />

      <div className="topbar-actions">
        <span className="model-pill" title={engineLabel}>
          <i className={`dot ${mode === 'api' ? 'on' : 'warn'}`} />
          {engineLabel}
        </span>

        <button className="chip" onClick={onOpenHelp} style={{ height: 28 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginRight: 5, verticalAlign: -1 }}>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M9.6 9.3a2.4 2.4 0 014.7.7c0 1.5-1.3 1.9-2 2.6-.4.4-.5.8-.5 1.4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
          </svg>
          使用说明
        </button>

        <button
          className="chip"
          onClick={onOpenPrompts}
          style={{ height: 28, color: selfEvolve ? '#4FBFAD' : undefined, borderColor: selfEvolve ? 'rgba(79,191,173,.35)' : undefined }}
        >
          Prompt 迭代
        </button>

        <button className="chip" onClick={onOpenEvolve} style={{ height: 28 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginRight: 5, verticalAlign: -1 }}>
            <path
              d="M20 12a8 8 0 11-2.6-5.9M20 4v4h-4"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          自我更新
          {learned && (
            <span
              className="mono"
              style={{
                marginLeft: 6,
                fontSize: 10,
                color: '#F6A72B',
                border: '1px solid rgba(246,167,43,.4)',
                borderRadius: 8,
                padding: '0 6px',
                lineHeight: '15px',
              }}
            >
              {positiveCount}
            </span>
          )}
        </button>

        <button className="chip" onClick={onOpenSettings} style={{ height: 28 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginRight: 5, verticalAlign: -1 }}>
            <path
              d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M19.4 13.5a7.5 7.5 0 000-3l1.7-1.3-1.7-3-2 .8a7.5 7.5 0 00-2.6-1.5L14.4 3h-3.5l-.4 2.5A7.5 7.5 0 007.9 7l-2-.8-1.7 3L5.9 10.5a7.5 7.5 0 000 3L4.2 14.8l1.7 3 2-.8a7.5 7.5 0 002.6 1.5l.4 2.5h3.5l.4-2.5a7.5 7.5 0 002.6-1.5l2 .8 1.7-3-1.7-1.3z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          模型设置
        </button>
      </div>
    </header>
  )
}
