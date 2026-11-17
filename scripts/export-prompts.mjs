/**
 * 从真实源码 prompts.js 导出四代 Prompt 的完整内容，
 * 不手抄、不改写，保证与代码里实际发送的内容一字不差。
 */
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildMessages, PROMPT_VERSIONS } from '../src/lib/prompts.js'

const outDir = join(process.cwd(), 'Prompt版本源代码')
mkdirSync(outDir, { recursive: true })

const baseCtx = {
  count: 8,
  style: '通吃',
  durationText: '52 分 18 秒',
  chunkIndex: 1,
  totalChunks: 3,
  chunk: '<<字幕材料>>',
}

const profileText = `[编辑画像 · 来自操作者本人过去 14 条反馈，共 3 轮]
- 保留片段的平均时长 22 秒、金句平均长度 38 字、平均推荐分 79
- 标签偏好：干货(+1)、观点(+0.4)、故事(-0.6)
- 可参考的正例（只用于理解口味，禁止复述）：
1. "..."（干货 / 21s / 86分）
- 操作者删除过的类型，本次回避：
1. "..."（故事，已被删除）`

const names = {
  v1: 'v1-基础需求',
  v2: 'v2-JSON结构化',
  v3: 'v3-工程化',
  v4: 'v4-自我更新',
}

for (const v of PROMPT_VERSIONS) {
  const ctx = v.id === 'v4' ? { ...baseCtx, profileText } : baseCtx
  const msgs = buildMessages(v.id, ctx)
  const body = `# ${v.label}

迭代目标：${v.goal}
暴露的问题：${v.problem}
这一轮改法：${v.fix}

================ 实际发送给模型的完整 Prompt ================

[System]
${msgs[0].content}

[User]
${msgs[1].content}
`
  writeFileSync(join(outDir, `${names[v.id]}.txt`), body, 'utf8')
}

console.log('已导出文件：')
for (const f of readdirSync(outDir)) console.log(' -', f)
