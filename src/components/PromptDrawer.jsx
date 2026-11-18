import React, { useState } from 'react'
import { Drawer } from 'antd'
import { PROMPT_VERSIONS } from '../lib/prompts.js'

const ROWS = [
  ['目标', 'goal'],
  ['暴露的问题', 'problem'],
  ['这一轮改了什么', 'fix'],
]

export default function PromptDrawer({
  open,
  onClose,
  activeVersion,
  selectedVersion,
  selfEvolve,
  hasLearned,
}) {
  const [expanded, setExpanded] = useState(PROMPT_VERSIONS[PROMPT_VERSIONS.length - 1].id)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={620}
      title="Prompt 链 · 迭代留痕"
      styles={{ body: { padding: '4px 22px 40px' } }}
    >
      <div className="pv-concept">
        <div className="pv-concept-row">
          <span className="pv-concept-k">软件版本</span>
          <span>
            左上角徽标的 <span className="mono">v6.0</span>，指整个应用（界面、转写、导出等全部功能）的发布版本，随每次发版递增。
          </span>
        </div>
        <div className="pv-concept-row">
          <span className="pv-concept-k">Prompt 版本</span>
          <span>
            指「识别金句」这一步喂给大模型的提示词，在
            <span className="mono"> src/lib/prompts.js </span>
            里共存四代 v1–v4。它和软件版本是两条独立的线，不会因为软件到 6.0 就有 v6 的 Prompt。
          </span>
        </div>
        <div className="pv-concept-line">
          当前实际生效：<span className="mono" style={{ color: '#F2A94B' }}>{activeVersion}</span>
          {activeVersion === 'v4'
            ? '（已开启自我更新且有历史画像，在 v3 基础上注入你的编辑画像）'
            : `（默认 Prompt，可在「模型设置」切换；选 v4 需开启自我更新并积累反馈）`}
        </div>
        {!hasLearned && selfEvolve && (
          <div className="pv-concept-line" style={{ color: '#828D93' }}>
            尚未产生历史反馈，即使开启自我更新，本次也会退化为所选版本，不会使用 v4。
          </div>
        )}
      </div>

      {PROMPT_VERSIONS.map((v) => {
        const isActive = activeVersion === v.id
        const isSelected = selectedVersion === v.id
        return (
          <div className="pv-item" key={v.id}>
            <div className="pv-head">
              <span className="pv-stage">{v.stage}</span>
              <span className="pv-label">{v.label}</span>
              {isActive && <span className="pv-active">当前使用</span>}
              {!isActive && isSelected && <span className="pv-picked">已选为默认</span>}
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
        )
      })}
    </Drawer>
  )
}
