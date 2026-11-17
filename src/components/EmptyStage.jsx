import React from 'react'
import { humanDuration } from '../lib/timecode.js'

export default function EmptyStage({ parsed, loading, progress, onLoadDemo, onAnalyze }) {
  const ready = parsed.cues.length > 0

  return (
    <div className="empty">
      <div className="empty-mark">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="10" width="2" height="4" rx="1" fill="#4FBFAD" opacity=".6" />
          <rect x="7" y="7" width="2" height="10" rx="1" fill="#4FBFAD" opacity=".6" />
          <rect x="11" y="4" width="2" height="16" rx="1" fill="#4FBFAD" opacity=".6" />
          <rect x="15" y="8" width="2" height="8" rx="1" fill="#4FBFAD" opacity=".6" />
          <rect x="19" y="11" width="2" height="3" rx="1" fill="#4FBFAD" opacity=".6" />
          <rect x="5" y="15" width="14" height="2" rx="1" fill="#F6A72B" />
        </svg>
      </div>

      {loading ? (
        <>
          <div className="empty-title">正在听这期节目…</div>
          <div className="empty-desc">
            {progress?.message || '正在准备字幕分块'}
            {progress ? `　第 ${progress.index} / ${progress.total} 段` : ''}
          </div>
        </>
      ) : ready ? (
        <>
          <div className="empty-title">素材已就绪，共 {parsed.cues.length} 句</div>
          <div className="empty-desc">
            {parsed.mode === 'plain'
              ? '这是纯文本字幕，没有时间码，时间轴会按中文语速（约 4.6 字/秒）推算。若要精确到帧，建议换成 SRT。'
              : `识别到完整时间码，全片 ${humanDuration(parsed.duration)}。可以直接开始识别。`}
          </div>
          <div className="empty-steps">
            <button className="chip" style={{ height: 32, padding: '0 16px' }} onClick={onAnalyze}>
              开始识别金句
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="empty-title">先把一期播客的字幕放进来</div>
          <div className="empty-desc">
            左侧可以粘贴字幕文本、上传 .srt / .vtt / .txt 文件，或者直接载入示例素材跑通全流程。
            识别之后，这里会变成一条带高光块的时间轴。
          </div>
          <div className="empty-steps">
            <button className="chip" style={{ height: 32, padding: '0 16px' }} onClick={onLoadDemo}>
              载入示例素材
            </button>
          </div>
          <div className="empty-steps" style={{ marginTop: 18, gap: 20 }}>
            <span className="empty-step">
              <span className="step-no">1</span>放字幕
            </span>
            <span className="empty-step">
              <span className="step-no">2</span>选参数
            </span>
            <span className="empty-step">
              <span className="step-no">3</span>识别高光
            </span>
            <span className="empty-step">
              <span className="step-no">4</span>导出清单
            </span>
          </div>
        </>
      )}
    </div>
  )
}
