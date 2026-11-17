# AI 对话历史快照（Prompt 链）

本文件按时间顺序还原开发过程中与 AI 的核心对话，聚焦三个功能迭代：
每个片段都包含「我的提问 → AI 的修改建议 → 我如何引导 AI 修复 Bug」的完整往返。
四代 Prompt 的原文见 `Prompt版本源代码/`，迭代现象与数据对照见 `PROMPT_ITERATIONS.md`。
真实对话界面的截图 / 录屏作为佐证一并提交（见 `对话截图/`）。

---

## 对话链一：从散文提取到 JSON 结构化（对应 Prompt v1 → v2）

### 我（第 1 轮提问）

> 帮我写一个 Prompt，我会把播客的 SRT 字幕贴给大模型，让它自动找出最有传播价值的金句，
> 并给出每段的开始时间、结束时间和文案。前端是 React，我后面要把结果渲染成时间轴。

### AI（修改建议）

给出了第一版 Prompt（v1）：让模型扮演"播客剪辑师"，找出 8 条左右金句，给出开始、结束和原句。

### 我（发现问题，引导修复）

> 跑了一次，结果没法用。模型返回的是一段大白话，不是结构化数据；而且时间戳有三种写法混着来：
> `1:20`、`00:01:20,000`、还有直接写 `80`（秒）。我前端没法稳定解析，正则也抠不出来。
> 你要在 Prompt 里把输出格式钉死，让它只返回 JSON，并且时间码统一成一种格式。

### AI（修复方案）

给出 v2，把四件事写成硬约束：
1. 只输出一个 JSON 对象，不要解释文字、不要 markdown 围栏；
2. 顶层固定 `{"highlights": [...]}`；
3. 每条字段固定 `start / end / quote / reason / score / tag`；
4. 时间码统一 `MM:SS,mmm`，并约束单段 15–60 秒、按 score 降序。

### 结果

输出可解析率明显提升。这一轮确认了一个原则：**模型不是不会，是没给它输出契约**；
而 JSON 合法之后，数据本身的合法性问题（越界、重叠、倒序）被留到下一轮处理。

---

## 对话链二：渲染报错、空输入与白屏修复（对应 Prompt v3）

### 我（带着报错日志提问）

> 模型偶尔返回 `{"highlights": null}`，页面直接白屏，控制台报
> `Cannot read properties of undefined (reading 'length')`。帮我定位并修复，还要处理空输入。

### AI（定位 + 修复）

根因是清洗函数默认 `raw` 一定是数组。修复：

```js
// 修复前
const arr = Array.isArray(raw) ? raw : raw.highlights
const n = arr.length // 当 raw 是字符串时 .highlights 为 undefined，这里崩

// 修复后
const arr = Array.isArray(raw)
  ? raw
  : Array.isArray(raw?.highlights) ? raw.highlights : []
```

同时把 App.jsx 里取首条改成可选链 `result.highlights[0]?.id ?? null`。

### 我（继续引导，覆盖同类隐患）

> 还有两个问题：一是同一份素材里模型给了两条 start 完全相同的片段，React 报
> `Each child should have a unique key prop`；二是我空字幕直接点识别，时间轴块宽度变成 `0px / NaN%`。
> 一起修掉，并在前端拦截空输入，别让请求发出去。

### AI（逐项修复）

- key 重复：id 从 `hl-${Math.round(start*10)}` 改为带序号的 `hl-${i}-${Math.round(start*10)}`；
- 除零：用 `safeDuration = duration || 1`，宽度 `max(百分比, 7px)` 保证再短也能点；
- 空输入拦截：没解析出字幕时 `message.warning` 并直接 return，不发请求；
- Prompt 层补「即使没有结果也输出 `{"highlights": []}`」，并新增 EmptyStage 三态界面。

### 结果

5 组字幕（含纯文本、长播客）对照，v3 全部可解析、可渲染，空输入不再白屏。
这一轮的教训是：**生产构建通过 ≠ 运行没问题**，界面改动必须在浏览器里真实点一遍。

---

## 对话链三：真实模型连接与火山方舟 Model ID 排错

### 我（报"请求发不出去"）

> 点测试连接提示「请求发不出去：Base URL 不通，或不允许浏览器直连（CORS）」，为什么连不上？

### AI（诊断）

实测对比：DeepSeek 能返回 HTTP 401（网络通、CORS 放行，仅缺 Key），而 OpenAI 官方端点
`api.openai.com` 在当前网络下一直 pending、15 秒超时——是 OpenAI 在大陆不可直连，不是软件 bug。
建议换国内服务商，并给测试连接加 15 秒超时与精准提示。

### 我（再报 402）

> 换成 DeepSeek 后又提示 `402 Insufficient Balance`。

### AI（定位）

这是**账户余额不足**，说明网络、Key、模型名全部正确，只差充值；在错误映射里把 402 明确翻译成
「账户余额不足，请充值」，不再直接甩英文 JSON。

### 我（最后报火山方舟 404）

> 我在火山方舟控制台明明看到了 DeepSeek-V4.1-Flash，模型名填 `deepseek-v4-1-flash` 为什么还是 404？
> 另外火山的 Key 不是 sk- 开头的，别再提示我 sk-。

### AI（定位 + 根治）

火山方舟标准接口要求**带日期后缀的完整 Model ID**，正确值是 `deepseek-v4-1-flash-261017`，
漏了后缀就 404。为了不让用户手打长 ID，把模型名改成**点选**：内置 6 个常用文本模型的完整 ID，
点一下即填入并高亮选中态；同时把 API Key 旁误导性的 "sk-..." 改为「各平台格式不同，原样粘贴」。

### 我（点选完整 ID 后仍失败，继续追问）

> 我已经点选了完整 ID，Key 也确认是火山方舟的，DeepSeek 平台都能连，为什么火山方舟还是 404？

### AI（不再靠状态码猜，直接读真实错误码）

用当前 Key 直接请求火山接口，读取响应体里的 `error.code`；对两个模型各发一次，都返回同一个错误：

```json
{"error":{"code":"ModelNotOpen","message":"Your account ... has not activated the model ... Please activate the model service in the Ark Console."}}
```

### 结论与修复

根因不是模型名、不是 Key、不是网络，而是**账号还没开通该模型**——火山方舟的模型必须先在控制台开通才能调用。
据此把 404 处理改成解析 `error.code`，按官方错误码精准区分：
- `ModelNotOpen` → 去「开通管理」页开通模型；
- `ModelIDAccessDisabled` → 改用 ep-xxx 推理接入点；
- `InvalidEndpointOrModel.NotFound` → 核对模型 ID。

### 结果

在火山方舟控制台「开通管理」页点「开通服务」后，回到软件点测试连接即可通过。
这一轮的关键收获：**404 只是 HTTP 状态，真正原因要看响应体里的错误码，不能只凭状态码猜。**
整个排错过程没有引入新依赖，全部在前端与 Prompt 层闭环。

---

## 留痕说明

- 以上对话为开发过程的真实往返还原；具体 Prompt 原文与代码以仓库源码为准。
- 建议评审同时查看：`PROMPT_ITERATIONS.md`（现象与数据）、`Prompt版本源代码/`（四代原文）、
  `对话截图/`（真实界面截图 / 录屏）。
