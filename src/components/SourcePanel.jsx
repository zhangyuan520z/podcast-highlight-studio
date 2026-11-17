import React, { useRef, useState } from 'react'
import { App as AntApp, Button, Input, Slider } from 'antd'
import { humanDuration } from '../lib/timecode.js'
import { SPEECH_RATES } from '../lib/subtitle.js'

const STYLES = [
  { key: '通吃', desc: '信息增量与情绪钩子各占一半' },
  { key: '干货', desc: '优先信息密度高的观点、方法、数据' },
  { key: '情绪', desc: '优先有情绪起伏、冲突、共鸣的原话' },
  { key: '故事', desc: '优先有具体时间地点人物的叙事片段' },
]

const SUBTITLE_EXT = /\.(srt|vtt|txt|md)$/i
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)$/i

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取失败'))
    reader.readAsText(file, 'utf-8')
  })
}

export default function SourcePanel({
  rawText,
  onRawText,
  sourceName,
  onSourceName,
  parsed,
  params,
  onParams,
  audio,
  onAudio,
  speechRate,
  onSpeechRate,
  realDurationText,
  onRealDurationText,
  onLoadDemo,
  onClear,
  onAnalyze,
  loading,
  progress,
  hasKey,
}) {
  const { message } = AntApp.useApp()
  const [tab, setTab] = useState('paste')
  const [dragging, setDragging] = useState(false)

  const subInputRef = useRef(null)
  const audioInputRef = useRef(null)

  const applySubtitleFile = async (file) => {
    if (!file) return
    if (AUDIO_EXT.test(file.name)) {
      applyAudioFile(file)
      return
    }
    if (!SUBTITLE_EXT.test(file.name)) {
      message.warning('字幕请用 .srt / .vtt / .txt 文件；音频请用 mp3 / wav / m4a')
      return
    }
    try {
      const text = await readTextFile(file)
      if (!text.trim()) {
        message.error('这个文件是空的')
        return
      }
      if ((text.match(/\uFFFD/g) || []).length > 8) {
        message.warning('文件可能不是 UTF-8 编码，中文可能乱码。可在记事本里另存为 UTF-8 后重试。')
      }
      onRawText(text)
      onSourceName(file.name.replace(SUBTITLE_EXT, ''))
      setTab('paste')
      message.success(`已读取 ${file.name}`)
    } catch (e) {
      message.error('文件读取失败，请换一个文件或直接粘贴文本')
    }
  }

  const applyAudioFile = (file) => {
    if (!file) return
    try {
      if (audio?.url) URL.revokeObjectURL(audio.url)
      onAudio({ url: URL.createObjectURL(file), name: file.name, size: file.size })
      message.success('音频已挂载，点片段即可试听')
    } catch (e) {
      message.error('音频挂载失败')
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) applySubtitleFile(file)
  }

  const charCount = rawText.trim().length
  const modeText =
    parsed.mode === 'timestamp'
      ? '识别到时间码'
      : parsed.mode === 'plain'
        ? '纯文本 · 时间轴按语速估算'
        : '等待输入'

  return (
    <>
      {/* ---------- 素材 ---------- */}
      <div className="block">
        <div className="block-head">
          <span className="block-title">素材</span>
          <span className="block-hint">{charCount ? `${charCount} 字符` : '空'}</span>
        </div>

        <div className="seg" style={{ marginBottom: 10 }}>
          <button aria-pressed={tab === 'paste'} onClick={() => setTab('paste')}>
            粘贴字幕
          </button>
          <button aria-pressed={tab === 'file'} onClick={() => setTab('file')}>
            上传文件
          </button>
        </div>

        {tab === 'paste' ? (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={dragging ? 'dragging' : ''}
          >
            <textarea
              className="ant-input ant-input-textarea"
              value={rawText}
              onChange={(e) => onRawText(e.target.value)}
              placeholder={`把播客字幕贴进来，支持两种格式：

1) 带时间码的 SRT（推荐）
00:01:23,400 --> 00:01:30,900
真正的壁垒不是技巧，是你有没有独特的经历

2) 纯文本
没有时间码时，会按中文语速估算时间轴`}
              spellCheck={false}
              style={{
                width: '100%',
                height: 208,
                resize: 'vertical',
                padding: '10px 11px',
                borderRadius: 6,
                border: `1px solid ${dragging ? 'rgba(246,167,43,.5)' : 'rgba(233,231,226,.09)'}`,
                outline: 'none',
                display: 'block',
              }}
            />
          </div>
        ) : (
          <div
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onClick={() => subInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
          >
            <div className="dropzone-main">
              <div className="dropzone-title">{sourceName === '未命名素材' ? '选择字幕文件' : sourceName}</div>
              <div className="dropzone-sub">
                {rawText ? `${charCount} 字符 · ${modeText}` : '.srt / .vtt / .txt · 也可以直接拖进窗口'}
              </div>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 16V5m0 0l-4 4m4-4l4 4" stroke="#828D93" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M5 16v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="#828D93" strokeWidth="1.6" />
            </svg>
          </div>
        )}

        {parsed.cues.length > 0 && (
          <div className="meter">
            <span>{parsed.cues.length} 句</span>
            <div className="meter-bar">
              <div className="meter-fill" style={{ width: '100%' }} />
            </div>
            <span>{humanDuration(parsed.duration)}</span>
          </div>
        )}

        {parsed.mode === 'plain' && parsed.cues.length > 0 && (
          <div className="plain-estimate">
            <div className="plain-estimate-head">
              <span>纯文本时间轴</span>
              <span className={parsed.estimated ? 'plain-tag' : 'plain-tag anchored'}>
                {parsed.estimated ? '语速估算' : '已锚定真实时长'}
              </span>
            </div>

            <div className="plain-row">
              <span className="plain-label">语速</span>
              <div className="seg plain-seg">
                {SPEECH_RATES.map((r) => (
                  <button
                    key={r.key}
                    aria-pressed={speechRate === r.charsPerSec}
                    onClick={() => onSpeechRate(r.charsPerSec)}
                  >
                    {r.key}
                  </button>
                ))}
              </div>
            </div>

            <div className="plain-row">
              <span className="plain-label">实际时长</span>
              <Input
                value={realDurationText}
                onChange={(e) => onRealDurationText(e.target.value)}
                placeholder="如 32:00 或 1920 秒，留空则按语速估算"
                size="small"
              />
            </div>
            <p className="plain-note">
              填真实音频总时长后按各句字数比例分配，时间轴比例与真实音频对齐；纯文本无真实时间戳，金句时间仍为相对位置。
            </p>
          </div>
        )}
      </div>

      {/* ---------- 音频 ---------- */}
      <div className="block">
        <div className="block-head">
          <span className="block-title">音频</span>
          <span className="block-hint">可选</span>
        </div>
        <div className="dropzone" onClick={() => audioInputRef.current?.click()} role="button" tabIndex={0}>
          <div className="dropzone-main">
            <div className="dropzone-title">{audio ? audio.name : '挂载这期播客的音频'}</div>
            <div className="dropzone-sub">
              {audio ? '已挂载 · 点右侧片段可试听' : 'mp3 / wav / m4a · 只在本地播放，不会上传'}
            </div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 18V6l10-2v12"
              stroke={audio ? '#4FBFAD' : '#828D93'}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="6.5" cy="18" r="2.5" stroke={audio ? '#4FBFAD' : '#828D93'} strokeWidth="1.6" />
            <circle cx="16.5" cy="16" r="2.5" stroke={audio ? '#4FBFAD' : '#828D93'} strokeWidth="1.6" />
          </svg>
        </div>
      </div>

      {/* ---------- 参数 ---------- */}
      <div className="block">
        <div className="block-head">
          <span className="block-title">剪辑参数</span>
          <span className="block-hint">影响识别口径</span>
        </div>

        <div className="param">
          <div className="param-head">
            <span className="param-name">金句数量</span>
            <span className="param-value">{params.count} 条</span>
          </div>
          <Slider
            min={3}
            max={12}
            step={1}
            value={params.count}
            onChange={(v) => onParams({ ...params, count: v })}
            tooltip={{ formatter: null }}
          />
        </div>

        <div className="param">
          <div className="param-head">
            <span className="param-name">单段时长上限</span>
            <span className="param-value">
              15 – {params.maxDur} 秒
            </span>
          </div>
          <Slider
            min={30}
            max={90}
            step={5}
            value={params.maxDur}
            onChange={(v) => onParams({ ...params, maxDur: v })}
            tooltip={{ formatter: (v) => `${v}s` }}
          />
        </div>

        <div className="param">
          <div className="param-head">
            <span className="param-name">选题偏好</span>
            <span className="param-value">{params.style}</span>
          </div>
          <div className="seg" style={{ marginTop: 8, marginBottom: 8 }}>
            {STYLES.map((s) => (
              <button
                key={s.key}
                aria-pressed={params.style === s.key}
                title={s.desc}
                onClick={() => onParams({ ...params, style: s.key })}
              >
                {s.key}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#828D93', lineHeight: 1.6, paddingBottom: 6 }}>
            {STYLES.find((s) => s.key === params.style)?.desc}
          </div>
        </div>
      </div>

      {/* ---------- 动作 ---------- */}
      <div className="block">
        <Button
          type="primary"
          block
          size="large"
          loading={loading}
          onClick={onAnalyze}
          style={{ height: 42, fontSize: 14, letterSpacing: '.02em' }}
        >
          {loading ? '正在识别高光…' : '开始识别金句'}
        </Button>

        {loading && (
          <div className="meter">
            <span style={{ whiteSpace: 'nowrap' }}>
              {progress ? `${progress.index}/${progress.total}` : '···'}
            </span>
            <div className="meter-bar">
              <div
                className="meter-fill"
                style={{
                  width: progress ? `${Math.round((progress.index / progress.total) * 100)}%` : '12%',
                }}
              />
            </div>
          </div>
        )}

        {!loading && (
          <div style={{ fontSize: 11, color: '#828D93', lineHeight: 1.7, marginTop: 9 }}>
            {hasKey ? `调用 ${'已配置的模型接口'}，长字幕会分块分析` : '未配置 API Key，本轮使用本地模拟引擎，结果可完整演示'}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="chip" style={{ flex: 1, height: 30 }} onClick={onLoadDemo}>
            载入示例素材
          </button>
          <button className="chip" style={{ flex: 1, height: 30 }} onClick={onClear}>
            清空全部
          </button>
        </div>
      </div>

      <input
        ref={subInputRef}
        type="file"
        accept=".srt,.vtt,.txt,.md"
        style={{ display: 'none' }}
        onChange={(e) => {
          applySubtitleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
        style={{ display: 'none' }}
        onChange={(e) => {
          applyAudioFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </>
  )
}
