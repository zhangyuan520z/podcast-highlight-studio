# 金句时间轴 · AI 播客高光裁剪台

输入一期播客的字幕，AI 自动挑出可以独立剪成短视频的金句片段，给出时间码、推荐理由和评分，
用一条时间轴把它们摆到全片位置上，可拖动微调、可试听、可一键导出剪辑清单。

赛题方向 3：多模态创意与微工具工坊。最小 MVP，前端单机可跑，无后端。

---

## 快速开始

```bash
cd podcast-highlight-studio
npm install
npm run dev
```

浏览器会自动打开 `http://localhost:5178`。

自测（不依赖浏览器，覆盖时间码转换、SRT/纯文本解析、脏数据兜底、JSON 抠取、CSV 导出）：

```bash
node scripts/smoke-test.mjs
```

打开后点左栏「载入示例素材」→「开始识别金句」，不需要配任何 Key 就能跑完整流程
（此时走的是内置的本地模拟引擎，规则打分，用于保证零成本可演示）。

要用真实大模型：点右上角「模型设置」，填 Base URL / API Key / 模型名，保存后重新识别即可。
配置只写在浏览器 localStorage，本项目没有任何后端可以接收它。

也可以复制 `.env.example` 为 `.env.local` 预置：

```
VITE_LLM_BASE_URL=https://api.openai.com/v1
VITE_LLM_API_KEY=你的APIKey
VITE_LLM_MODEL=gpt-4o-mini
```

---

## 做了什么

**输入**
- 粘贴字幕文本，或上传 `.srt` / `.vtt` / `.txt`，也可以直接把文件拖进输入区
- 自动识别时间码格式；没有时间码的纯文本按中文语速（约 4.6 字/秒）估算时间轴，并在界面明确标注"估算"
- 只有音频、没有字幕：挂载 mp3 / wav / m4a 后一键「本地转写」，浏览器内跑 Whisper 直接生成带时间戳的 SRT，无需 Key、音频不离开本机；极速档模型已内置，断网也能转写
- 音频也可只挂来试听，只在本机播放，不上传

**识别**
- OpenAI 兼容接口（OpenAI / DeepSeek / 通义 / 豆包方舟都能填）
- 长字幕按 3400 字符分块调用，单块失败不拖垮整体，最后统一合并、去重叠、按分数排序
- 参数：金句数量 3–12 条、单段时长上限 30–90 秒、选题偏好（通吃 / 干货 / 情绪 / 故事）
- 无 Key 或想零成本演示时使用本地模拟引擎（关键词 + 结构 + 长度打分，确定性输出）

**结果**
- 时间轴：高光块按片段时长比例摆放，背景波形由字幕密度真实绘制（不是伪造的音频波形）
- 拖动片段两端改起止点，拖动块体整体平移；悬停看片段文案；有音频时双击试听、点时间轴跳转
- ECharts 分布图：全片每个时段的高光数量与字幕密度，用来判断"这期节目哪些地方能剪"
- 清单：可按标签筛选，每条带时间码、时长、评分、推荐理由
- 详情面板：手动输入时间码微调、复制时间码（含毫秒 / 秒级）、复制文案、试听、删除
- 导出 CSV（带 BOM，Excel / WPS 打开中文不乱码），或复制整份纯文本清单

**自我更新（v4）**
- 自动记录保留、删除、微调、导出、试听、复制这些动作，在本机沉淀成编辑画像：标签亲和、顺手时长、金句字数、保留分线
- 下一轮分析时画像作为偏好注入 Prompt（v4），结果再经一次本地校准；用得越多越贴合本人的剪辑口味
- 顶部「自我更新」抽屉可看学习轮次、正负例、标签亲和图，支持立即校准当前结果、一键清空学习数据
- 反馈不足 2 条时自动退化为 v3，不注入空画像；所有数据只存在本机 localStorage，不外发

**音频转写（v6）**
- 浏览器内 transformers.js 本地 Whisper 推理，三档模型：极速 whisper-tiny（约 40MB）、平衡 whisper-base（约 80MB）、精准 whisper-small（约 245MB）
- 支持中文 / 英文 / 自动检测；音频在主线程解码重采样到 16k 单声道，全程不上传
- 推理在独立 Web Worker（`src/workers/transcribe.worker.js`）执行，不阻塞主线程，长音频转写时页面仍可操作；转写中可一键「停止转写」
- 极速档模型已随项目内置在 `public/models`，同源加载、断网也能转写；平衡 / 精准档首次从国内镜像 hf-mirror 下载，之后缓存可离线
- ONNX 运行时（wasm）随项目本地加载，不依赖任何 CDN；转写产出的 SRT 直接进字幕区，无缝衔接后续金句识别

**可用性：快速决策流**
- 每段有保留 / 弃用 / 待定三种状态，弃用的片段整行变灰划线，导出和复制时自动排除
- 全局键盘快速过一遍：`N` 下一条、`P` 上一条、`K` 保留、`X` 弃用、`U` 待定、`Enter` 展开上下文、`Ctrl+Z` 撤销（焦点在输入框时不触发）
- 每条可展开看前后相邻字幕，金句不再脱离上下文；上下文由 `src/lib/context.js` 从原始字幕实时取
- 撤销栈保留最近 30 次编辑：物理删除、软决策、时间轴拖拽、详情微调、重置都能回退；时间轴拖拽只在开始时压一次栈
- 本地模拟引擎的推荐理由按真实命中特征（转折 / 数字 / 情绪 / 结构 / 密度等）逐条拼出，不再千篇一律

---

## 赛题考核点对照

| 考核点 | 在项目里的落点 |
| --- | --- |
| Prompt 链至少 3 轮迭代 | `src/lib/prompts.js` 同时保留 v1 / v2 / v3 / v4，界面「Prompt 迭代」抽屉可逐条查看每轮的原文、暴露的问题、改法；模型设置里可切换版本用同一素材做 A/B |
| 迭代 1：基础需求 | v1：字幕 + 数量要求，无格式约束 |
| 迭代 2：时间戳格式混乱 → JSON 约束 | v2：钉死 `{"highlights":[...]}` schema 与 `MM:SS,mmm` 格式；配套 `src/lib/highlights.js` 做归一化兜底 |
| 迭代 3：前端渲染报错 → 修组件 bug、处理空输入 | v3 分块 + 允许空结果；`normalizeHighlights` 对 null / 非数组 / 越界时间码 / end<start 全部兜底；`EmptyStage` 覆盖空素材、空结果、加载中三态 |
| 迭代 4：自我更新 | v4 注入编辑画像；`feedback.js` 采集动作并计算画像，`calibrator.js` 做幂等即时校准，无反馈时自动降级 v3 |
| 前端可视化 + 一键复制 + 导出清单 | 见上 |
| 结果重置 / 参数调节 | 左栏参数滑块 + 结果区「重置结果」 |

更细的迭代记录（每轮的真实失败样本与修复动作）见 `PROMPT_ITERATIONS.md`。

---

## 目录

```
podcast-highlight-studio/
├─ index.html
├─ vite.config.js
├─ public/
│  └─ ort/                     # 本地 ONNX 运行时（mjs + wasm），不依赖 CDN
├─ src/
│  ├─ main.jsx                 # antd 深色主题 + 中文语言包
│  ├─ App.jsx                  # 状态中枢：素材 / 参数 / 识别 / 选中 / 导出
│  ├─ lib/
│  │  ├─ timecode.js           # 时间码 ↔ 秒，两种格式互转
│  │  ├─ asr.js                # 转写编排：音频解码、Worker 通信、停止、SRT 生成
│  │  ├─ subtitle.js           # SRT / VTT / 纯文本解析，分块给模型
│  │  ├─ highlights.js         # 模型输出清洗归一化 + 本地模拟引擎
│  │  ├─ prompts.js            # v1 / v2 / v3 / v4 四代 Prompt
│  │  ├─ llm.js                # OpenAI 兼容调用、JSON 抠取、错误友好化
│  │  ├─ feedback.js           # 自我更新：反馈采集、编辑画像、画像转 Prompt
│  │  ├─ calibrator.js         # 基于画像的幂等即时校准
│  │  ├─ context.js            # 取片段前后相邻字幕，支撑上下文展开
│  │  └─ exporter.js           # CSV / 纯文本清单 / 剪贴板
│  ├─ workers/
│  │  └─ transcribe.worker.js  # 独立线程加载模型与 ONNX 推理，不卡主线程
│  ├─ components/
│  │  ├─ TopBar.jsx
│  │  ├─ SourcePanel.jsx       # 左栏：素材、音频、参数、识别按钮
│  │  ├─ Timeline.jsx          # 时间轴 + canvas 波形 + 拖拽
│  │  ├─ DensityChart.jsx      # ECharts 分布图
│  │  ├─ HighlightList.jsx
│  │  ├─ DetailPanel.jsx
│  │  ├─ EmptyStage.jsx        # 空素材 / 空结果 / 加载中
│  │  ├─ SettingsModal.jsx
│  │  ├─ PromptDrawer.jsx
│  │  ├─ HelpDrawer.jsx        # 软件内使用说明书（含跨电脑步骤、快捷键、常见问题）
│  │  ├─ SelfEvolvePanel.jsx   # 自我更新面板：画像、开关、校准、清空
│  │  └─ StatusBar.jsx
│  └─ styles/index.css
└─ src/data/demoSubtitle.js     # 内置示例字幕（虚构，43 条，6 分 10 秒）

根目录另有：启动.bat（Windows 双击启动，自动安装依赖）、操作手册.md（独立使用说明书）
```

---

## 技术栈

React 18 + Vite 5 + Ant Design 5（深色主题）+ ECharts 5。无后端、无数据库、无路由。

前端直接用 `fetch` 调 OpenAI 兼容的 `/chat/completions`，Key 存在 localStorage。
音频转写用 @huggingface/transformers（transformers.js）+ onnxruntime-web，WASM 本地推理。

---

## 已知限制（如实说明）

1. **浏览器直连可能被 CORS 拦截。** 部分服务商不允许浏览器直接调接口。OpenAI、DeepSeek、通义兼容模式一般可以；
   如果被拦，报错会明确指向"网络请求失败 / CORS"，此时需要在本地起一个代理，或换成允许浏览器访问的端点。
   本工具没有后端，这是它作为纯前端 MVP 的固有限制。
2. **纯文本字幕的时间轴是估算值。** 没有真实时间码就无法精确到帧，界面会标注；要精确请用 SRT。
3. **本地模拟引擎不是大模型。** 它是关键词与结构规则打分，只能证明流程跑得通，不能代表真实识别质量。
4. **不做自动视频切片。** 音频可本地转写与试听，但导出的是剪辑清单（CSV），实际音视频切割交给剪映 / PR。
5. **极速档转写有精度局限。** whisper-tiny 体积小、可能出现错字或繁简混排，追求准确可在音频区换 base / small 档；极速档模型已内置、断网可用，平衡 / 精准档首次需联网从镜像下载，之后缓存可离线。
6. **分块上限 8 块**（约 2.7 万字）。超长素材只会分析前 8 块，状态栏不提示截断细节，界面上以 meta 里的 `truncated` 字段标记。
