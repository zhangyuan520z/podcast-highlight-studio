import React from 'react'

export default function StatusBar({ mode, engineLabel, promptVersion, cueCount, failures, hasAudio }) {
  return (
    <footer className="statusbar">
      <span>
        <i className={`dot ${mode === 'api' ? 'on' : 'warn'}`} style={{ marginRight: 6, verticalAlign: 1 }} />
        {mode === 'api' ? 'API 模型' : '本地模拟引擎'}
      </span>
      <span>·</span>
      <span>
        model <b>{engineLabel}</b>
      </span>
      <span>·</span>
      <span>
        prompt <b>{promptVersion}</b>
      </span>
      <span>·</span>
      <span>
        cues <b>{cueCount}</b>
      </span>
      <span>·</span>
      <span>
        audio <b>{hasAudio ? 'loaded' : 'none'}</b>
      </span>
      <span className="status-spacer" />
      {failures && failures.length > 0 ? (
        <span style={{ color: '#E5645B' }}>部分分块失败：{failures[0]}</span>
      ) : (
        <span>所有数据在本地浏览器处理</span>
      )}
    </footer>
  )
}
