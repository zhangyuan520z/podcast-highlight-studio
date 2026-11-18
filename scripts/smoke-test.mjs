/**
 * 冒烟测试：不依赖浏览器，直接跑核心逻辑
 * 用法：node scripts/smoke-test.mjs
 */
import { parseSubtitle, textInRange, cuesToPromptLines } from '../src/lib/subtitle.js'
import { stampToSec, secToStamp } from '../src/lib/timecode.js'
import { analyzeLocally, normalizeHighlights } from '../src/lib/highlights.js'
import { extractJson } from '../src/lib/llm.js'
import { buildCsv } from '../src/lib/exporter.js'
import {
  loadFeedback,
  resetFeedback,
  recordFeedback,
  recordBatch,
  buildProfile,
  profileToPromptText,
} from '../src/lib/feedback.js'
import { calibrate } from '../src/lib/calibrator.js'
import { buildMessages } from '../src/lib/prompts.js'
import { neighborCues } from '../src/lib/context.js'
import { chunksToSrt, ASR_MODELS, DEFAULT_ASR_MODEL } from '../src/lib/asr.js'
import { normalizeChunkText, normalizeChunks, findLatinSegments, detectLanguageMismatch } from '../src/lib/text-normalize.js'
import { DEMO_SRT } from '../src/data/demoSubtitle.js'

let pass = 0
let fail = 0

function check(name, cond, extra = '') {
  if (cond) {
    pass += 1
    console.log(`  ok   ${name}${extra ? ` — ${extra}` : ''}`)
  } else {
    fail += 1
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`)
  }
}

console.log('\n[1] 时间码互转')
check('00:01:23,400 → 83.4', Math.abs(stampToSec('00:01:23,400') - 83.4) < 0.001)
check('纯秒数 125.4', Math.abs(stampToSec('125.4') - 125.4) < 0.001)
check('01:23.4 也能读', Math.abs(stampToSec('01:23.4') - 83.4) < 0.001)
check('83.4 → 00:01:23,400', secToStamp(83.4, true) === '00:01:23,400', secToStamp(83.4, true))
check('非法输入返回 NaN', Number.isNaN(stampToSec('abc')))

console.log('\n[2] SRT 解析（示例素材）')
const parsed = parseSubtitle(DEMO_SRT)
check('模式为 timestamp', parsed.mode === 'timestamp')
check('解析出 43 句', parsed.cues.length === 43, `${parsed.cues.length}`)
check('总时长约 370.5 秒', Math.abs(parsed.duration - 370.5) < 1, parsed.duration.toFixed(1))
check('首句从 0 开始', parsed.cues[0].start === 0)
check('时间单调递增', parsed.cues.every((c, i) => i === 0 || c.start >= parsed.cues[i - 1].start))
check('每句都有文本', parsed.cues.every((c) => c.text && c.text.length > 0))

console.log('\n[3] 纯文本解析（无时间码）')
const plain = parseSubtitle('第一句话讲了一个观点。第二句话补充了证据！第三句话给出结论？')
check('模式为 plain', plain.mode === 'plain', plain.mode)
check('至少切出 2 句', plain.cues.length >= 2, `${plain.cues.length} 句`)
check('估算了时长', plain.duration > 0, `${plain.duration.toFixed(1)}s`)

console.log('\n[4] 空输入')
const empty = parseSubtitle('   \n  ')
check('空文本不抛异常', empty.mode === 'empty' && empty.cues.length === 0)

console.log('\n[5] 本地模拟引擎')
const local = analyzeLocally(parsed.cues, { count: 6, minDur: 15, maxDur: 60 })
check('产出 6 条', local.length === 6, `${local.length} 条`)
check('时间都落在素材范围内', local.every((h) => h.start >= 0 && h.end <= parsed.duration + 0.01))
check('end 都大于 start', local.every((h) => h.end > h.start))
check('时长都在 3~60 秒', local.every((h) => h.end - h.start >= 3 && h.end - h.start <= 60.01))
check('两两不重叠', local.every((h, i) => i === 0 || h.start >= local[i - 1].end - 0.01))
check('每句 quote 非空', local.every((h) => h.quote && h.quote.length > 5))
check('有分数和标签', local.every((h) => h.score >= 0 && h.score <= 100 && h.tag))
console.log(`     最高分 ${Math.max(...local.map((h) => h.score))}，标签 ${[...new Set(local.map((h) => h.tag))].join('/')}`)

console.log('\n[6] 脏数据兜底')
const dirtyCases = [
  { start: '00:03:40,000', end: '00:03:07,000', quote: 'end 小于 start' },
  { start: 999, end: 1030, quote: '超出总时长' },
  { start: '00:00:10', end: '00:00:12', quote: '时长过短' },
  { startSec: 20, endSec: 100, text: '字段名不统一且超长' },
  { begin: '125.4', to: '130', quote: '纯秒数字段别名' },
  { start: 'abc', end: 'def', quote: '完全无法解析' },
]
const cleaned = normalizeHighlights(dirtyCases, { cues: parsed.cues, duration: parsed.duration, maxCount: 6, minDur: 15, maxDur: 60 })
check('脏数据不抛异常', Array.isArray(cleaned))
check('非法时间被丢弃', cleaned.every((h) => Number.isFinite(h.start) && Number.isFinite(h.end)))
check('全部落在范围内', cleaned.every((h) => h.start >= 0 && h.end <= parsed.duration + 0.01))
check('全部满足最小时长', cleaned.every((h) => h.end - h.start >= 14.9))
check('不重叠', cleaned.every((h, i) => i === 0 || h.start >= cleaned[i - 1].end - 0.01))
check('null 输入返回空数组', normalizeHighlights(null, { cues: parsed.cues, duration: 10 }).length === 0)
check('对象包一层 highlights 也能读', normalizeHighlights({ highlights: [{ start: 0, end: 20, quote: 'x'.repeat(10) }] }, { cues: parsed.cues, duration: 60, minDur: 15 }).length === 1)

console.log('\n[7] 模型输出 JSON 抠取')
check('裸 JSON', extractJson('{"highlights":[]}').highlights.length === 0)
check('带 ```json 围栏', extractJson('```json\n{"highlights":[{"start":"00:00:05"}]}\n```').highlights.length === 1)
check('前后带解释文字', extractJson('好的，结果如下：\n{"highlights":[]}\n希望有帮助').highlights.length === 0)
check('括号内的字符串不会误截断', extractJson('{"a":"}"}').a === '}')
try {
  extractJson('这段输出没有 JSON')
  check('无 JSON 时抛错', false)
} catch (e) {
  check('无 JSON 时抛错', true)
}

console.log('\n[8] 区间文本回填')
const backfill = textInRange(parsed.cues, 60, 90)
check('能取到区间字幕', backfill.length > 10, `${backfill.length} 字`)

console.log('\n[9] 分块')
const chunks = cuesToPromptLines(parsed.cues, 900)
check('900 字符下切成多块', chunks.length >= 2, `${chunks.length} 块`)
check('每块都不超上限太多', chunks.every((c) => c.length < 1400))
check('块内含时间轴行', chunks[0].includes('-->'))

console.log('\n[10] CSV 导出')
const csv = buildCsv(local)
check('带 BOM', csv.charCodeAt(0) === 0xfeff)
check('首行是表头', csv.slice(1).startsWith('序号,开始时间,结束时间'))
check('行数为 1 + 片段数', csv.trim().split('\r\n').length === local.length + 1)
check('含逗号的文案被引号包裹', buildCsv([{ start: 0, end: 10, quote: '我,其实', reason: 'x', score: 80, tag: '观点' }]).includes('"我,其实"'))

console.log('\n[11] 自我更新：反馈、画像、校准、v4')

// node 环境没有 localStorage，给一个内存版
const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
}

const hPos = { id: 'a', start: 10, end: 30, quote: '这是一段足够长的正例金句文案用来测试。', tag: '观点', score: 80 }
const hNeg = { id: 'b', start: 40, end: 60, quote: '这是另一段被删除的负例文案内容。', tag: '故事', score: 60 }

let store = loadFeedback()
check('空档案未学习', buildProfile(store).learned === false)
store = recordFeedback(store, 'delete', hNeg)
store = recordBatch(store, 'keep', [hPos])
const prof = buildProfile(store)
check('两条反馈后开始学习', prof.learned === true)
check('正例 1 条', prof.positiveCount === 1, `${prof.positiveCount}`)
check('负例 1 条', prof.negativeCount === 1, `${prof.negativeCount}`)
check('标签亲和是数值', Number.isFinite(prof.tagAffinity['观点']))
check('顺手时长取正例', prof.prefDur === 20, `${prof.prefDur}`)
const ptext = profileToPromptText(prof)
check('画像文字含标题', ptext.includes('编辑画像'))
check('画像文字含正例原文', ptext.includes(hPos.quote))

store = recordFeedback(store, 'round', {})
check('round 动作自增轮次', buildProfile(store).rounds === 1)

const cal = calibrate([hPos, hNeg], prof)
check('校准分数都在 0-100', cal.every((x) => x.score >= 0 && x.score <= 100))
check('校准片段带标记字段', cal.every((x) => 'calibrated' in x && 'calibration' in x))
const blankProfile = buildProfile({ version: 1, rounds: 0, actions: [], positives: [], negatives: [] })
check('未学习时原样返回', calibrate([hPos], blankProfile)[0] === hPos)

const ctx = { count: 6, style: '通吃', durationText: 'x', chunkIndex: 1, totalChunks: 1, chunk: 'c', profileText: ptext }
check('v4 注入画像', buildMessages('v4', ctx)[1].content.includes('编辑画像'))
const noProfCtx = { ...ctx, profileText: '' }
check('v4 无画像时等于 v3', buildMessages('v4', noProfCtx)[1].content === buildMessages('v3', noProfCtx)[1].content)

const emptied = resetFeedback()
check('重置后回到未学习', buildProfile(emptied).learned === false)

console.log('\n[12] 决策状态与上下文')
check('每段初始为待定', local.every((h) => h.decision === 'pending'))
const uniqReasons = new Set(local.map((h) => h.reason))
check('推荐理由有区分', uniqReasons.size >= 2, `${uniqReasons.size} 种理由`)
const nb = neighborCues(parsed.cues, local[0].start, local[0].end, 2, 2)
check('能取到前后上下文', Array.isArray(nb.before) && Array.isArray(nb.after))
check('区间内有字幕', nb.inside.length >= 1, `${nb.inside.length} 句`)
check('空素材上下文不崩', Array.isArray(neighborCues([], 0, 10).inside))

console.log('\n[13] 音频转写 SRT 生成')
const asrChunks = [
  { timestamp: [0, 3.2], text: ' 第一句金句 ' },
  { timestamp: [3.2, 8.9], text: '第二句内容' },
  { timestamp: [10, null], text: '缺结束时间' },
]
const srt = chunksToSrt(asrChunks)
check('SRT 含序号与箭头', srt.includes('1\n') && srt.includes('-->'))
check('SRT 用逗号毫秒', srt.includes('00:00:00,000 --> 00:00:03,200'))
check('缺结束时间兜底 +2 秒', srt.includes('00:00:10,000 --> 00:00:12,000'))
check('文本被 trim', srt.includes('第一句金句') && !srt.includes(' 第一句金句 '))
check('提供 3 档模型', ASR_MODELS.length === 3)
check('默认模型在列表中', ASR_MODELS.some((m) => m.id === DEFAULT_ASR_MODEL))
const reparsed = parseSubtitle(srt)
check('生成 SRT 可被重新解析', reparsed.mode === 'timestamp' && reparsed.cues.length === 3, `${reparsed.mode} · ${reparsed.cues.length} 句`)
check('重解析时间戳精确', Math.abs(reparsed.cues[0].end - 3.2) < 0.01)

console.log('\n[14] 转写文本规范化（繁转简 / 标点 / 拼音检测）')
const t1 = await normalizeChunkText('做內容最重要的不是技巧,是你能不能持續輸出。', { language: 'chinese' })
check('繁体转简体', t1 === '做内容最重要的不是技巧，是你能不能持续输出。', t1)
const t2 = await normalizeChunkText('真正的壁壘!經歷過嗎?', { language: 'chinese' })
check('半角标点转全角', t2 === '真正的壁垒！经历过吗？', t2)
const t3 = await normalizeChunkText('Hello, world? This is English.', { language: 'english' })
check('英文模式不做中文转换', t3.includes('Hello, world?'), t3)
check('数字小数点不被当句号', (await normalizeChunkText('版本是 3.14 没错', { language: 'chinese' })).includes('3.14'))
check('拼音检测命中', JSON.stringify(findLatinSegments('叫 tushu 管理')) === '["tushu"]')
const normAll = await normalizeChunks(
  [
    { timestamp: [0, 2], text: '這個叫 tushu' },
    { timestamp: [2, 4], text: '介面用 API' },
  ],
  { language: 'chinese' },
)
check('整份 chunks 转简体', normAll.chunks[0].text === '这个叫 tushu', normAll.chunks[0].text)
check('汇总拼音/外文命中数', normAll.latinHits.length === 2 && normAll.hasLatin === true)
check('空 chunks 不抛异常', (await normalizeChunks([], { language: 'chinese' })).chunks.length === 0)
const mm1 = detectLanguageMismatch('We have been here for a few years. We have been here for a few years. We have been here.')
check('全英文长文本判定语种误判', mm1.suspected === true && mm1.latinRatio > 0.9)
const mm2 = detectLanguageMismatch('做内容最重要的不是技巧，是你能不能持续输出，很多人坚持了三个月就放弃了。')
check('正常中文不判误判', mm2.suspected === false)
const mm3 = detectLanguageMismatch('短文本')
check('样本量不足不判断', mm3.suspected === false)
const mm4 = detectLanguageMismatch('这个叫 tushu 管理系统，用 API 连接，需要部署 shujuku 服务做数据存储')
check('中英混合不轻易判误判', mm4.suspected === false)

console.log(`\n结果：${pass} 项通过，${fail} 项失败\n`)
process.exit(fail === 0 ? 0 : 1)
