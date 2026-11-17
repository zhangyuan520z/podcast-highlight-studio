/**
 * 自我更新 · 反馈采集与编辑画像
 * 所有数据只存在本机 localStorage，不随请求外发。
 */

const STORE_KEY = 'phs:feedback'
const MAX_ACTIONS = 300
const MAX_SAMPLES = 40

const EMPTY_STORE = {
  version: 1,
  rounds: 0,
  actions: [],
  positives: [],
  negatives: [],
}

export function loadFeedback() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
    if (raw && typeof raw === 'object' && Array.isArray(raw.actions)) {
      return {
        version: raw.version || 1,
        rounds: raw.rounds || 0,
        actions: raw.actions,
        positives: Array.isArray(raw.positives) ? raw.positives : [],
        negatives: Array.isArray(raw.negatives) ? raw.negatives : [],
      }
    }
  } catch (e) {
    /* 数据损坏时回落为空档案 */
  }
  return structuredClone(EMPTY_STORE)
}

function persist(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch (e) {
    /* 存储满或隐私模式：静默失败，不影响主流程 */
  }
}

export function resetFeedback() {
  persist(structuredClone(EMPTY_STORE))
  return structuredClone(EMPTY_STORE)
}

function toSample(h) {
  return {
    quote: String(h.quote || '').slice(0, 72),
    tag: h.tag || '观点',
    score: Math.round(h.score || 0),
    dur: Math.round((h.end || 0) - (h.start || 0)),
    len: String(h.quote || '').length,
  }
}

/**
 * 记录一次编辑动作
 * @param {object} store 当前档案
 * @param {string} type keep | delete | adjust | export | preview | copy | round
 * @param {object} payload 片段或补丁
 */
export function recordFeedback(store, type, payload = {}) {
  const next = {
    ...store,
    actions: [...store.actions],
    positives: [...store.positives],
    negatives: [...store.negatives],
  }

  const action = {
    type,
    at: Date.now(),
    tag: payload.tag || '',
    score: Math.round(payload.score || 0),
    dur: Number.isFinite(payload.start) && Number.isFinite(payload.end)
      ? Math.round(payload.end - payload.start)
      : 0,
    len: payload.quote ? String(payload.quote).length : 0,
  }
  next.actions.push(action)
  if (next.actions.length > MAX_ACTIONS) next.actions = next.actions.slice(-MAX_ACTIONS)

  if (type === 'delete') {
    next.negatives.push(toSample(payload))
    if (next.negatives.length > MAX_SAMPLES) next.negatives = next.negatives.slice(-MAX_SAMPLES)
  }

  // 导出 = 整批片段被明确采纳，是最强正反馈
  if (type === 'keep' || type === 'export') {
    const s = toSample(payload)
    if (s.quote && !next.positives.some((p) => p.quote === s.quote)) {
      next.positives.push(s)
      if (next.positives.length > MAX_SAMPLES) next.positives = next.positives.slice(-MAX_SAMPLES)
    }
  }

  if (type === 'round') next.rounds += 1

  persist(next)
  return next
}

/** 批量记录（导出整批时） */
export function recordBatch(store, type, list) {
  let cur = store
  for (const item of list) cur = recordFeedback(cur, type, item)
  return cur
}

/* ------------------------------------------------------------------ */
/* 画像：从历史动作里提炼“这个人的剪辑口味”                                */
/* ------------------------------------------------------------------ */

function mean(arr, key) {
  const nums = arr.map((x) => Number(x[key])).filter((n) => Number.isFinite(n) && n > 0)
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function buildProfile(store) {
  const pos = store.positives || []
  const neg = store.negatives || []
  const total = pos.length + neg.length

  if (total < 2) {
    return { learned: false, total: 0, tagAffinity: {}, prefDur: 0, prefLen: 0, prefScore: 0, posSamples: [], negSamples: [] }
  }

  // 标签偏好：正例里的标签占比减去负例里的占比
  const tagAffinity = {}
  for (const p of pos) tagAffinity[p.tag] = (tagAffinity[p.tag] || 0) + 1
  for (const n of neg) tagAffinity[n.tag] = (tagAffinity[n.tag] || 0) - 1
  const scale = Math.max(1, ...Object.values(tagAffinity).map((v) => Math.abs(v)))
  Object.keys(tagAffinity).forEach((k) => {
    tagAffinity[k] = Number((tagAffinity[k] / scale).toFixed(2))
  })

  // 挑 3 个不同标签的最近正例做 few-shot
  const posSamples = []
  const seenTags = new Set()
  for (let i = pos.length - 1; i >= 0 && posSamples.length < 3; i -= 1) {
    if (!seenTags.has(pos[i].tag)) {
      posSamples.push(pos[i])
      seenTags.add(pos[i].tag)
    }
  }
  if (posSamples.length < 3) {
    for (let i = pos.length - 1; i >= 0 && posSamples.length < 3; i -= 1) {
      if (!posSamples.includes(pos[i])) posSamples.push(pos[i])
    }
  }

  return {
    learned: true,
    total,
    rounds: store.rounds,
    positiveCount: pos.length,
    negativeCount: neg.length,
    tagAffinity,
    prefDur: Math.round(mean(pos, 'dur')),
    prefLen: Math.round(mean(pos, 'len')),
    prefScore: Math.round(mean(pos, 'score')),
    posSamples,
    negSamples: neg.slice(-2),
  }
}

/** 给 Prompt 用的画像文字（v4 注入） */
export function profileToPromptText(profile) {
  if (!profile.learned) return ''
  const tags = Object.entries(profile.tagAffinity)
    .sort((a, b) => b[1] - a[1])
    .map(([t, v]) => `${t}(${v > 0 ? '+' : ''}${v})`)
    .join('、')

  const pos = profile.posSamples
    .map((s, i) => `${i + 1}. "${s.quote}"（${s.tag} / ${s.dur}s / ${s.score}分）`)
    .join('\n')
  const neg = profile.negSamples
    .map((s, i) => `${i + 1}. "${s.quote}"（${s.tag}，已被删除）`)
    .join('\n')

  return `[编辑画像 · 来自操作者本人过去 ${profile.total} 条反馈，共 ${profile.rounds} 轮]
- 保留片段的平均时长 ${profile.prefDur} 秒、金句平均长度 ${profile.prefLen} 字、平均推荐分 ${profile.prefScore}
- 标签偏好（正为偏好，负为回避）：${tags}
- 可参考的正例（只用于理解口味，禁止复述、禁止引用）：
${pos}
${neg ? `- 操作者删除过的类型，本次回避：\n${neg}` : ''}
请按这份画像调整本次选择与打分。`
}
