/**
 * Prompt 链留痕
 * 三代 Prompt 都真实保留在这里，运行时用的是 v3，界面里可以对比查看。
 */

export const SYSTEM_PROMPT = [
  '你是一位服务播客博主的短视频二次剪辑选题编辑。',
  '你的判断标准只有三条：脱离上下文仍然成立；有明确的信息增量；有可被剪成前 3 秒的情绪钩子。',
  '你只做筛选和标注，不改写原文。',
].join('\n')

const FORMAT_RULES = `输出格式硬约束：
1. 只输出一个 JSON 对象，不要任何解释文字，不要 markdown 代码块围栏。
2. 顶层结构固定为 {"highlights": [ ... ]}，即使没有结果也要输出 {"highlights": []}。
3. 每条字段：start（字符串）、end（字符串）、quote（字符串）、reason（字符串）、score（0-100 整数）、tag（"观点"|"干货"|"故事"|"情绪"|"数字" 之一）。
4. start / end 必须是 "MM:SS,mmm" 形式，分钟与秒都要两位补零，毫秒三位并用英文逗号分隔，例如 "03:07,500"。
5. start 与 end 只能取材料中出现过的时间码，取值范围为 00:00,000 到材料给出的最后一条结束时间，不允许超出。`

const QUALITY_RULES = `内容质量约束：
- quote 必须是原文连续原话，长度 15~60 字，允许跨 2~3 条字幕拼接，但不许改写、不许补字、不许加省略号以外的标点。
- 单段时长 15~60 秒；宁短勿长，短视频片段超过 60 秒基本无法搬运。
- 相邻两段不允许时间重叠，且间隔至少 5 秒。
- reason 用一句话说明可剪理由，不超过 30 字，不要复述 quote。
- score 表示"如果只发一条，你会先发它"的程度，拉开差距，不要都给 88 分。
- 如果材料里真正够格的片段不足 ${'{count}'} 条，就少给，不要为凑数降低标准。`

/** v1：最初的基础版 */
export const PROMPT_V1 = (ctx) => `你是一位播客剪辑师，下面是一期播客的字幕，请帮我找出其中最有传播价值的金句片段，每个片段给出开始时间、结束时间和这句话本身，一共找 ${ctx.count} 条左右。

字幕内容：
${ctx.chunk}`

/** v2：加了 JSON 结构约束 */
export const PROMPT_V2 = (ctx) => `你是一位播客剪辑师。从下面的字幕里挑出 ${ctx.count} 个最适合做成短视频的金句片段。

${FORMAT_RULES}

其他要求：单段 15~60 秒，按 score 从高到低排列。

字幕内容：
${ctx.chunk}`

/** v3：工程化版本（当前线上使用） */
export const PROMPT_V3 = (ctx) => {
  const styleHint = {
    干货: '优先选信息密度高的观点、方法、数据；可以牺牲一点情绪浓度。',
    情绪: '优先选有情绪起伏、冲突、共鸣的原话，钩子越强越好。',
    故事: '优先选有具体时间地点人物的叙事片段，完整讲完一个小事件。',
    通吃: '信息增量与情绪钩子各占一半，优先能同时满足两者的片段。',
  }[ctx.style] || '信息增量与情绪钩子各占一半。'

  return `这期播客总时长 ${ctx.durationText}，你正在处理的是第 ${ctx.chunkIndex}/${ctx.totalChunks} 段材料。
请在这一段材料里挑出最多 ${ctx.count} 个可以独立剪成短视频的金句片段。全程只使用本段材料，不要引用本段之外的内容。

选题偏好：${styleHint}

${FORMAT_RULES}

${QUALITY_RULES.replace('${count}', String(ctx.count))}

本段材料（每行格式为 [开始 --> 结束] 原文）：
${ctx.chunk}`
}

/** v4：自我更新版（v3 + 编辑画像注入） */
export const PROMPT_V4 = (ctx) => {
  const base = PROMPT_V3(ctx)
  return ctx.profileText ? `${base}\n\n${ctx.profileText}` : base
}

/** 给界面展示用的三代对比元信息 */
export const PROMPT_VERSIONS = [
  {
    id: 'v1',
    label: 'v1 · 基础需求',
    stage: '迭代 1',
    goal: '先跑通「字幕 → 金句片段」这条链路，把字幕和数量要求交给模型。',
    problem:
      '模型返回散文段落和三种混用的时间戳（1:20 / 00:01:20,000 / 直接给秒数），前端无法解析；有时还只给"上面第 3 段"这类指代。',
    fix: '不修 prompt，先确认问题出在输出格式契约缺失。',
    code: PROMPT_V1({ count: 8, chunk: '<<字幕材料>>' }),
  },
  {
    id: 'v2',
    label: 'v2 · JSON 结构化',
    stage: '迭代 2',
    goal: '把输出钉死成可解析的 JSON，并约束时间码格式。',
    problem:
      '格式基本稳定，但模型仍会：end 小于 start、给到材料范围之外的时间、两段重叠、quote 被改写、分数全给 88 分。',
    fix: '前端补一层 normalize：clamp 到字幕区间、时长修正、重叠去重、分数归一化。',
    code: PROMPT_V2({ count: 8, chunk: '<<字幕材料>>' }),
  },
  {
    id: 'v3',
    label: 'v3 · 工程化',
    stage: '迭代 3',
    goal: '长字幕分块、风格可调、防幻觉、空结果合法化，让前端拿到的一定是能渲染的数据。',
    problem:
      '长播客一次塞不进上下文；空输入直接抛异常把页面打白；模型在没有合格片段时硬凑数。',
    fix: '分块调用 + 明确"宁可少给"；前端对空数组、null、非数组返回值全部兜底并渲染空态。',
    code: PROMPT_V3({
      count: 8,
      style: '通吃',
      durationText: '52 分 18 秒',
      chunkIndex: 1,
      totalChunks: 3,
      chunk: '<<字幕材料>>',
    }),
  },
  {
    id: 'v4',
    label: 'v4 · 自我更新',
    stage: '迭代 4',
    goal: '把操作者的保留、删除、微调沉淀成编辑画像，自动注入 Prompt，让同一台工具越用越贴合本人。',
    problem:
      'v3 对所有人输出同一套标准，无法区分"这个博主只想要 20 秒干货"和"那个博主专做情绪长片段"。',
    fix: '反馈库 + 画像 + few-shot 正例/负例注入；结果再经本地校准层修正分数。无历史反馈时自动退化为 v3。',
    code: PROMPT_V4({
      count: 8,
      style: '通吃',
      durationText: '52 分 18 秒',
      chunkIndex: 1,
      totalChunks: 3,
      chunk: '<<字幕材料>>',
      profileText: '[编辑画像 · 来自操作者本人过去 14 条反馈，共 3 轮]\n- 保留片段的平均时长 22 秒、金句平均长度 38 字、平均推荐分 79\n- 标签偏好：干货(+1)、观点(+0.4)、故事(-0.6)\n- 可参考的正例（只用于理解口味，禁止复述）：\n1. "..."（干货 / 21s / 86分）\n- 操作者删除过的类型，本次回避：\n1. "..."（故事，已被删除）',
    }),
  },
]

export function buildMessages(version, ctx) {
  const builder =
    version === 'v1'
      ? PROMPT_V1
      : version === 'v2'
        ? PROMPT_V2
        : version === 'v4'
          ? PROMPT_V4
          : PROMPT_V3
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: builder(ctx) },
  ]
}
