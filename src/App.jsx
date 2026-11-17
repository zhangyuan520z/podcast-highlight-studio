import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp } from 'antd'
import { parseSubtitle, DEFAULT_CHARS_PER_SEC } from './lib/subtitle.js'
import { analyzeLocally } from './lib/highlights.js'
import { runAnalysis, loadConfig, saveConfig } from './lib/llm.js'
import { buildPlainList, copyText, downloadCsv } from './lib/exporter.js'
import { humanDuration, secToStamp, stampToSec } from './lib/timecode.js'
import { loadFeedback, resetFeedback, recordFeedback, recordBatch, buildProfile } from './lib/feedback.js'
import { calibrate } from './lib/calibrator.js'
import { DEMO_SRT, DEMO_TITLE } from './data/demoSubtitle.js'

import TopBar from './components/TopBar.jsx'
import SourcePanel from './components/SourcePanel.jsx'
import Timeline from './components/Timeline.jsx'
import DensityChart from './components/DensityChart.jsx'
import HighlightList from './components/HighlightList.jsx'
import DetailPanel from './components/DetailPanel.jsx'
import EmptyStage from './components/EmptyStage.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import PromptDrawer from './components/PromptDrawer.jsx'
import HelpDrawer from './components/HelpDrawer.jsx'
import SelfEvolvePanel from './components/SelfEvolvePanel.jsx'
import StatusBar from './components/StatusBar.jsx'

const DEFAULT_PARAMS = { count: 6, minDur: 15, maxDur: 60, style: '通吃' }

export default function App() {
  const { message } = AntApp.useApp()

  const [rawText, setRawText] = useState('')
  const [sourceName, setSourceName] = useState('未命名素材')
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const [highlights, setHighlights] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [config, setConfig] = useState(() => loadConfig())
  const [promptVersion, setPromptVersion] = useState('v3')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [audio, setAudio] = useState(null)
  // 纯文本模式：语速（内容单位/秒）与手动填写的真实总时长文本
  const [speechRate, setSpeechRate] = useState(DEFAULT_CHARS_PER_SEC)
  const [realDurationText, setRealDurationText] = useState('')

  const [feedback, setFeedback] = useState(() => loadFeedback())
  const [profile, setProfile] = useState(() => buildProfile(loadFeedback()))
  const [selfEvolve, setSelfEvolve] = useState(true)
  const [evolveOpen, setEvolveOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const pushFeedback = (type, payload = {}) => {
    const next = recordFeedback(feedback, type, payload)
    setFeedback(next)
    setProfile(buildProfile(next))
  }

  /* 撤销：保存每次离散编辑前的片段快照 */
  const historyRef = useRef([])
  const [canUndo, setCanUndo] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  const pushHistory = () => {
    historyRef.current.push(highlights.map((h) => ({ ...h })))
    if (historyRef.current.length > 30) historyRef.current.shift()
    setCanUndo(true)
  }

  const handleUndo = () => {
    const prev = historyRef.current.pop()
    if (!prev) {
      setCanUndo(false)
      return
    }
    setHighlights(prev)
    setCanUndo(historyRef.current.length > 0)
  }

  const toggleExpand = (id) => setExpandedId((cur) => (cur === id ? null : id))

  const deferredText = useDeferredValue(rawText)
  const parsed = useMemo(() => {
    const parsedReal = stampToSec(realDurationText)
    const realDuration = Number.isFinite(parsedReal) && parsedReal > 0 ? parsedReal : null
    return parseSubtitle(deferredText, { charsPerSec: speechRate, realDuration })
  }, [deferredText, speechRate, realDurationText])
  const selected = highlights.find((h) => h.id === selectedId) || null

  const audioRef = useRef(null)
  const stopAtRef = useRef(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)

  /* ---------------- 素材 ---------------- */

  const loadDemo = () => {
    setRawText(DEMO_SRT)
    setSourceName(DEMO_TITLE)
    setHighlights([])
    setSelectedId(null)
    setMeta(null)
    message.success('已载入示例字幕，点「开始识别」即可跑通全流程')
  }

  const clearAll = () => {
    setRawText('')
    setSourceName('未命名素材')
    setHighlights([])
    setSelectedId(null)
    setMeta(null)
    setAudio(null)
    setSpeechRate(DEFAULT_CHARS_PER_SEC)
    setRealDurationText('')
  }

  /* ---------------- 识别 ---------------- */

  const handleAnalyze = async () => {
    if (!parsed.cues.length) {
      message.warning('还没有可用字幕。粘贴字幕文本、上传 .srt 文件，或先载入示例素材。')
      return
    }
    if (loading) return

    setLoading(true)
    setProgress(null)
    setSelectedId(null)

    try {
      const hasKey = Boolean(config.apiKey && config.apiKey.trim())
      const useLearned = selfEvolve && profile.learned
      const effectiveVersion = useLearned ? 'v4' : promptVersion
      let result

      if (hasKey) {
        result = await runAnalysis({
          cues: parsed.cues,
          duration: parsed.duration,
          params,
          config,
          promptVersion: effectiveVersion,
          profile: selfEvolve ? profile : null,
          onProgress: setProgress,
        })
      } else {
        result = {
          highlights: analyzeLocally(parsed.cues, params),
          meta: {
            model: '本地模拟引擎',
            chunks: 1,
            failures: [],
            promptVersion: 'local',
            profileInjected: false,
            truncated: false,
          },
        }
      }

      // 即时校准：不重新调模型，用画像修正当前分数
      const hs = useLearned ? calibrate(result.highlights, profile) : result.highlights
      const finalMeta = { ...result.meta, profileInjected: useLearned ? true : result.meta.profileInjected }

      setHighlights(hs)
      setMeta(finalMeta)
      setSelectedId(hs[0]?.id ?? null)
      pushFeedback('round')

      if (hs.length === 0) {
        message.warning(
          result.meta?.failures?.[0] ||
            '这一段素材里没有挑出够格的片段。可以调小「金句数量」或换个选题偏好再试。',
        )
      } else {
        message.success(
          `识别完成，共 ${hs.length} 个高光片段${useLearned ? '，已按你的画像校准' : ''}`,
        )
      }
    } catch (err) {
      if (err?.code === 'NO_KEY') {
        message.warning('还没有配置 API Key，请先到「模型设置」里填写。')
      } else {
        message.error(err?.message || '识别失败，请重试')
      }
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  /* ---------------- 编辑与联动 ---------------- */

  const handleAdjust = useCallback((id, patch) => {
    setHighlights((prev) =>
      prev.map((h) =>
        h.id === id
          ? { ...h, start: Math.max(0, patch.start), end: Math.max(patch.start + 1, patch.end) }
          : h,
      ),
    )
  }, [])

  // 拖拽开始：压一次栈，整个拖动只产生一条可撤销记录
  const handleAdjustStart = () => pushHistory()

  // 拖拽结束时只记一次 adjust（拖动中高频，不写反馈）
  const handleAdjustEnd = (id) => {
    const h = highlights.find((x) => x.id === id)
    if (h) pushFeedback('adjust', h)
  }

  // 详情面板的输入框确认是低频操作，更新与埋点一起做
  const handleAdjustWithFeedback = (id, patch) => {
    pushHistory()
    handleAdjust(id, patch)
    const base = highlights.find((x) => x.id === id)
    if (base) pushFeedback('adjust', { ...base, ...patch })
  }

  const handleSelect = useCallback((id) => {
    setSelectedId(id)
  }, [])

  // 软决策：保留 / 弃用 / 待定，可撤销，不写 feedback
  const handleDecision = (id, decision) => {
    pushHistory()
    setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, decision } : h)))
  }

  const handleDelete = (id) => {
    pushHistory()
    const target = highlights.find((h) => h.id === id)
    if (target) pushFeedback('delete', target)
    setHighlights((prev) => prev.filter((h) => h.id !== id))
    setSelectedId((cur) => (cur === id ? null : cur))
  }

  /* ---------------- 播放 ---------------- */

  const handlePreview = (h) => {
    const el = audioRef.current
    if (!el || !audio) {
      message.info('这段素材只有字幕。想真正试听片段，可以在左栏上传对应的音频文件。')
      return
    }
    try {
      el.currentTime = h.start
      stopAtRef.current = h.end
      setCurrentTime(h.start)
      pushFeedback('preview', h)
      const p = el.play()
      if (p && p.catch) p.catch(() => message.info('浏览器拦截了自动播放，再点一次即可'))
    } catch (e) {
      message.info('无法定位到该时间点，请确认音频与字幕是同一期节目。')
    }
  }

  const handleSeek = (sec) => {
    const el = audioRef.current
    if (!el || !audio) return
    el.currentTime = Math.max(0, Math.min(sec, el.duration || parsed.duration || 0))
    setCurrentTime(el.currentTime)
  }

  const onTimeUpdate = () => {
    const el = audioRef.current
    if (!el) return
    setCurrentTime(el.currentTime)
    if (stopAtRef.current !== null && el.currentTime >= stopAtRef.current) {
      el.pause()
      stopAtRef.current = null
    }
  }

  /* ---------------- 导出 ---------------- */

  const handleExport = () => {
    const exportable = highlights.filter((h) => h.decision !== 'drop')
    if (!exportable.length) {
      message.warning('没有可导出的片段（可能都被标记为弃用了）')
      return
    }
    const next = recordBatch(feedback, 'export', exportable)
    setFeedback(next)
    setProfile(buildProfile(next))
    downloadCsv(exportable, `${sourceName.replace(/\s/g, '_')}_剪辑清单.csv`)
    message.success(`已导出 ${exportable.length} 段，弃用片段已排除，并作为正例写入画像`)
  }

  const handleCopyAll = async () => {
    const exportable = highlights.filter((h) => h.decision !== 'drop')
    if (!exportable.length) {
      message.warning('还没有可复制的片段')
      return
    }
    pushFeedback('copy', {})
    const ok = await copyText(buildPlainList(exportable))
    ok ? message.success('已复制全部时间戳与文案') : message.error('浏览器拒绝了剪贴板访问')
  }

  const handleCopyOne = async (h, withMs = false) => {
    const stamp = withMs ? secToStamp(h.start, true) : secToStamp(h.start, false)
    pushFeedback('copy', h)
    const ok = await copyText(stamp)
    ok ? message.success(`已复制 ${stamp}`) : message.error('复制失败，请手动选择文本')
  }

  /* ---------------- 配置 ---------------- */

  const handleSaveConfig = (next) => {
    const clean = {
      baseUrl: (next.baseUrl || '').trim(),
      apiKey: (next.apiKey || '').trim(),
      model: (next.model || '').trim(),
    }
    setConfig(clean)
    saveConfig(clean)
    setSettingsOpen(false)
    message.success('模型配置已保存到本机浏览器')
  }

  /* ---------------- 自我更新 ---------------- */

  const handleCalibrateNow = () => {
    if (!profile.learned || !highlights.length) return
    setHighlights(calibrate(highlights, profile))
    message.success('已按画像校准当前结果')
  }

  const handleResetFeedback = () => {
    const empty = resetFeedback()
    setFeedback(empty)
    setProfile(buildProfile(empty))
    message.success('学习数据已清空，画像回到初始状态')
  }

  /* 全局键盘流：焦点不在输入框时，快速过一遍做决定 */
  useEffect(() => {
    const onKey = (e) => {
      const el = e.target
      const tag = (el.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || el.isContentEditable) return

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        handleUndo()
        return
      }

      if (!highlights.length) return
      const ids = highlights.map((h) => h.id)
      let curIdx = ids.indexOf(selectedId)
      if (curIdx < 0) curIdx = 0

      const move = (d) => {
        const ni = Math.min(ids.length - 1, Math.max(0, curIdx + d))
        setSelectedId(ids[ni])
        const node = document.querySelectorAll('.hl-item')[ni]
        if (node) node.scrollIntoView({ block: 'nearest' })
      }

      const key = e.key.toLowerCase()
      if (key === 'n') move(1)
      else if (key === 'p') move(-1)
      else if (key === 'k') handleDecision(ids[curIdx], 'keep')
      else if (key === 'x') handleDecision(ids[curIdx], 'drop')
      else if (key === 'u') handleDecision(ids[curIdx], 'pending')
      else if (e.key === 'Enter') {
        e.preventDefault()
        toggleExpand(ids[curIdx])
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ---------------- 派生展示值 ---------------- */

  const stats = useMemo(() => {
    if (!highlights.length) {
      return { coverage: 0, avgScore: 0, totalLen: 0 }
    }
    const totalLen = highlights.reduce((s, h) => s + (h.end - h.start), 0)
    const avgScore = Math.round(highlights.reduce((s, h) => s + h.score, 0) / highlights.length)
    const coverage = parsed.duration ? (totalLen / parsed.duration) * 100 : 0
    return { coverage, avgScore, totalLen }
  }, [highlights, parsed.duration])

  const engineLabel = config.apiKey ? config.model : '本地模拟引擎'
  const engineMode = config.apiKey ? 'api' : 'local'

  return (
    <div className="shell">
      <TopBar
        engineLabel={engineLabel}
        mode={engineMode}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenPrompts={() => setPromptOpen(true)}
        onOpenEvolve={() => setEvolveOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        learned={profile.learned}
        positiveCount={profile.positiveCount}
        selfEvolve={selfEvolve}
      />

      <main className="main">
        <aside className="rail">
          <SourcePanel
            rawText={rawText}
            onRawText={setRawText}
            sourceName={sourceName}
            onSourceName={setSourceName}
            parsed={parsed}
            params={params}
            onParams={setParams}
            audio={audio}
            onAudio={setAudio}
            speechRate={speechRate}
            onSpeechRate={setSpeechRate}
            realDurationText={realDurationText}
            onRealDurationText={setRealDurationText}
            onLoadDemo={loadDemo}
            onClear={clearAll}
            onAnalyze={handleAnalyze}
            loading={loading}
            progress={progress}
            hasKey={Boolean(config.apiKey)}
          />
        </aside>

        <section className="stage">
          {highlights.length > 0 ? (
            <>
              <div className="stage-head">
                <div style={{ minWidth: 0 }}>
                  <h2 className="stage-title">{sourceName}</h2>
                  <div className="stage-sub">
                    <span>总时长 {humanDuration(parsed.duration)}</span>
                    <span>{parsed.cues.length} 句字幕</span>
                    <span>{parsed.mode === 'plain' ? '纯文本·时间轴为估算' : '时间码识别'}</span>
                    <span>引擎 {meta?.model || engineLabel}</span>
                  </div>
                </div>
                <div className="stage-tools">
                  <button
                    className="chip"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    style={{ height: 30, padding: '0 12px' }}
                  >
                    撤销
                  </button>
                  <button className="chip" onClick={handleCopyAll} style={{ height: 30, padding: '0 12px' }}>
                    复制清单
                  </button>
                  <button className="chip" onClick={handleExport} style={{ height: 30, padding: '0 12px' }}>
                    导出 CSV
                  </button>
                  <button
                    className="chip"
                    onClick={() => {
                      pushHistory()
                      setHighlights([])
                      setSelectedId(null)
                      setMeta(null)
                      setExpandedId(null)
                    }}
                    style={{ height: 30, padding: '0 12px' }}
                  >
                    重置结果
                  </button>
                </div>
              </div>

              <div className="figures">
                <div className="figure">
                  <div className="figure-num accent">{highlights.length}</div>
                  <div className="figure-cap">可剪片段</div>
                </div>
                <div className="figure">
                  <div className="figure-num">{secToStamp(stats.totalLen)}</div>
                  <div className="figure-cap">高光总时长</div>
                </div>
                <div className="figure">
                  <div className="figure-num">{stats.avgScore}</div>
                  <div className="figure-cap">平均推荐分</div>
                </div>
                <div className="figure">
                  <div className="figure-num">{stats.coverage.toFixed(1)}%</div>
                  <div className="figure-cap">占全片比例</div>
                </div>
              </div>

              <Timeline
                cues={parsed.cues}
                duration={parsed.duration}
                highlights={highlights}
                selectedId={selectedId}
                onSelect={handleSelect}
                onAdjust={handleAdjust}
                onAdjustStart={handleAdjustStart}
                onAdjustEnd={handleAdjustEnd}
                currentTime={currentTime}
                onSeek={handleSeek}
                playing={playing}
                hasAudio={Boolean(audio)}
                onPreview={handlePreview}
              />

              <DensityChart cues={parsed.cues} highlights={highlights} duration={parsed.duration} />

              <HighlightList
                highlights={highlights}
                selectedId={selectedId}
                onSelect={handleSelect}
                onCopyStamp={handleCopyOne}
                cues={parsed.cues}
                onDecision={handleDecision}
                expandedId={expandedId}
                onToggleExpand={toggleExpand}
              />

              {selected && (
                <DetailPanel
                  highlight={selected}
                  onPreview={handlePreview}
                  onCopyStamp={handleCopyOne}
                  onDelete={handleDelete}
                  onAdjust={handleAdjustWithFeedback}
                  duration={parsed.duration}
                  hasAudio={Boolean(audio)}
                />
              )}
            </>
          ) : (
            <EmptyStage
              parsed={parsed}
              loading={loading}
              progress={progress}
              onLoadDemo={loadDemo}
              onAnalyze={handleAnalyze}
            />
          )}
        </section>
      </main>

      <StatusBar
        mode={engineMode}
        engineLabel={engineLabel}
        promptVersion={promptVersion}
        cueCount={parsed.cues.length}
        fps={null}
        failures={meta?.failures}
        hasAudio={Boolean(audio)}
      />

      <SettingsModal
        open={settingsOpen}
        config={config}
        promptVersion={promptVersion}
        onPromptVersion={setPromptVersion}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveConfig}
      />

      <PromptDrawer open={promptOpen} onClose={() => setPromptOpen(false)} activeVersion={promptVersion} />

      <SelfEvolvePanel
        open={evolveOpen}
        onClose={() => setEvolveOpen(false)}
        feedback={feedback}
        profile={profile}
        selfEvolve={selfEvolve}
        onToggle={setSelfEvolve}
        onCalibrateNow={handleCalibrateNow}
        onReset={handleResetFeedback}
        hasHighlights={highlights.length > 0}
      />

      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />

      {audio && (
        <audio
          ref={audioRef}
          src={audio.url}
          onTimeUpdate={onTimeUpdate}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          style={{ display: 'none' }}
        />
      )}
    </div>
  )
}
