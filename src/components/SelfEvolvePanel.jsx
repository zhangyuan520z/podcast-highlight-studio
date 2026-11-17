import React from 'react'
import { Drawer } from 'antd'

function AffinityBar({ tag, value }) {
  const pct = Math.abs(value) * 50
  const positive = value >= 0
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '7px 0' }}>
      <span className="mono" style={{ width: 34, fontSize: 11, color: '#B9C0C4' }}>
        {tag}
      </span>
      <div
        style={{
          flex: 1,
          height: 4,
          background: 'rgba(255,255,255,0.06)',
          position: 'relative',
          borderRadius: 2,
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: positive ? '50%' : `${50 - pct}%`,
            width: `${pct}%`,
            height: '100%',
            background: positive ? '#F6A72B' : '#E5645B',
            borderRadius: 2,
          }}
        />
      </div>
      <span
        className="mono"
        style={{
          width: 42,
          textAlign: 'right',
          fontSize: 11,
          color: positive ? '#F6A72B' : '#E5645B',
        }}
      >
        {positive ? '+' : ''}
        {value}
      </span>
    </div>
  )
}

export default function SelfEvolvePanel({
  open,
  onClose,
  feedback,
  profile,
  selfEvolve,
  onToggle,
  onCalibrateNow,
  onReset,
  hasHighlights,
}) {
  const learned = profile?.learned

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={560}
      title="自我更新 · 编辑画像"
      styles={{ body: { padding: '6px 22px 40px' } }}
    >
      <div style={{ fontSize: 12, color: '#828D93', lineHeight: 1.85, padding: '8px 0 14px' }}>
        工具会自动记录你保留、删除、微调、导出的动作，在本机沉淀成画像。下一轮分析时，
        画像会作为偏好注入 Prompt（v4），结果再经一次本地校准。数据不离开这台电脑。
      </div>

      <div className="seg" style={{ marginBottom: 16 }}>
        <button aria-pressed={selfEvolve} onClick={() => onToggle(true)}>
          自我更新已开启
        </button>
        <button aria-pressed={!selfEvolve} onClick={() => onToggle(false)}>
          已暂停
        </button>
      </div>

      {!learned ? (
        <div className="empty" style={{ padding: '30px 20px' }}>
          <div className="empty-title">还没有足够的反馈</div>
          <div className="empty-desc">
            正常识别一两期，删除几条不要的、导出一次清单，画像就会在这里出现。
            至少需要 2 条反馈（保留或删除）才会开始学习。
          </div>
        </div>
      ) : (
        <>
          <div className="figures" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
            <div className="figure">
              <div className="figure-num accent">{profile.rounds}</div>
              <div className="figure-cap">学习轮次</div>
            </div>
            <div className="figure">
              <div className="figure-num">{profile.positiveCount}</div>
              <div className="figure-cap">已采纳</div>
            </div>
            <div className="figure">
              <div className="figure-num">{profile.negativeCount}</div>
              <div className="figure-cap">已回避</div>
            </div>
            <div className="figure">
              <div className="figure-num">{feedback.actions.length}</div>
              <div className="figure-cap">编辑动作</div>
            </div>
          </div>

          <div className="block" style={{ marginBottom: 14 }}>
            <div className="block-head">
              <span className="block-title">标签偏好</span>
              <span className="block-hint">正 = 偏好，负 = 回避</span>
            </div>
            {Object.entries(profile.tagAffinity).map(([t, v]) => (
              <AffinityBar key={t} tag={t} value={v} />
            ))}
          </div>

          <div className="figures" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', marginBottom: 16 }}>
            <div className="figure">
              <div className="figure-num">{profile.prefDur}s</div>
              <div className="figure-cap">顺手时长</div>
            </div>
            <div className="figure">
              <div className="figure-num">{profile.prefLen}</div>
              <div className="figure-cap">金句字数</div>
            </div>
            <div className="figure">
              <div className="figure-num">{profile.prefScore}</div>
              <div className="figure-cap">保留分线</div>
            </div>
          </div>

          <div className="block-head">
            <span className="block-title">最近采纳的正例</span>
          </div>
          {profile.posSamples.map((s, i) => (
            <div
              key={i}
              style={{
                padding: '10px 0',
                borderBottom: '1px solid rgba(233,231,226,0.08)',
                fontSize: 12.5,
                lineHeight: 1.7,
              }}
            >
              <span style={{ color: '#F6A72B' }}>{s.tag}</span>
              <span className="mono" style={{ color: '#828D93', fontSize: 10.5, margin: '0 8px' }}>
                {s.dur}s / {s.score}
              </span>
              <span style={{ color: '#B9C0C4' }}>{s.quote}</span>
            </div>
          ))}
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button
          className="chip"
          style={{ flex: 1, height: 34, color: '#4FBFAD', borderColor: 'rgba(79,191,173,.35)' }}
          onClick={onCalibrateNow}
          disabled={!hasHighlights || !learned}
        >
          立即自我更新（校准当前结果）
        </button>
        <button
          className="chip"
          style={{ height: 34, color: '#E5645B', borderColor: 'rgba(229,100,91,.32)' }}
          onClick={onReset}
        >
          清空学习数据
        </button>
      </div>
    </Drawer>
  )
}
