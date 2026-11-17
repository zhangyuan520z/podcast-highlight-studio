import React, { useState } from 'react'
import { Drawer } from 'antd'
import { PROMPT_VERSIONS } from '../lib/prompts.js'

const ROWS = [
  ['目标', 'goal'],
  ['暴露的问题', 'problem'],
  ['这一轮改了什么', 'fix'],
]

export default function PromptDrawer({ open, onClose, activeVersion }) {
  const [expanded, setExpanded] = useState(PROMPT_VERSIONS[PROMPT_VERSIONS.length - 1].id)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={620}
      title="Prompt 链 · 三轮迭代留痕"
      styles={{ body: { padding: '4px 22px 40px' } }}
    >
      <div style={{ fontSize: 12, color: '#828D93', lineHeight: 1.85, padding: '10px 0 14px' }}>
        这个项目的核心不是页面，是这条 Prompt 链。三轮迭代都在代码里活着：
        <span className="mono" style={{ color: '#B9C0C4' }}> src/lib/prompts.js </span>
        里同时保留 v1 / v2 / v3，运行时用 v3，界面上可以切回旧版本做对照。
      </div>

      {PROMPT_VERSIONS.map((v) => (
        <div className="pv-item" key={v.id}>
          <div className="pv-head">
            <span className="pv-stage">{v.stage}</span>
            <span className="pv-label">{v.label}</span>
            {activeVersion === v.id && <span className="pv-active">当前使用</span>}
          </div>

          {ROWS.map(([label, key]) => (
            <div className="pv-row" key={key}>
              <span className="pv-key">{label}</span>
              <span style={{ color: '#B9C0C4' }}>{v[key]}</span>
            </div>
          ))}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 10,
            }}
          >
            <button
              className="chip"
              style={{ height: 24, fontSize: 10.5 }}
              onClick={() => setExpanded((cur) => (cur === v.id ? '' : v.id))}
            >
              {expanded === v.id ? '收起 Prompt 原文' : '查看 Prompt 原文'}
            </button>
            <span className="block-hint">{v.code.length} 字符</span>
          </div>

          {expanded === v.id && <pre className="pv-code">{v.code}</pre>}
        </div>
      ))}
    </Drawer>
  )
}
