import React from 'react'
import { Drawer } from 'antd'

const KEYS = [
  ['N', '移动到下一条'],
  ['P', '移动到上一条'],
  ['K', '把当前条标记为「保留」'],
  ['X', '把当前条标记为「弃用」'],
  ['U', '把当前条恢复为「待定」'],
  ['Enter', '展开 / 收起当前条的上下文'],
  ['Ctrl + Z', '撤销上一步编辑'],
]

const STEPS = [
  ['给素材', '点左栏「载入示例素材」快速体验；或把 .srt / .vtt / .txt 字幕拖进左栏、点上传、直接粘贴。只有音频也能挂载后一键本地转写成带时间戳的字幕。'],
  ['调参数并识别', '设金句数量、单段时长上限、选题偏好，点「开始识别金句」。无 Key 时自动走内置本地模拟引擎，零成本可演示。'],
  ['过一遍做决定', '用鼠标点「保留 / 弃用 / 看上下文」，或用下面的键盘流快速过一遍。弃用的片段整行变灰划线。'],
  ['微调与导出', '时间轴上拖动块体或两端改起止点；点「导出 CSV」只导出保留与待定片段，或「复制清单」拿到纯文本。'],
]

const OTHER_PC = [
  ['安装 Node.js', '在目标电脑访问 nodejs.org，下载 LTS 长期支持版，安装时一路「下一步」即可。'],
  ['拷贝项目', '把整个 podcast-highlight-studio 文件夹拷过去（或解压源码 zip）。不需要拷 node_modules，启动脚本会自动安装。'],
  ['双击启动', '双击项目里的「启动.bat」：首次会自动执行 npm install，随后启动并自动打开浏览器；之后每次双击即可。'],
  ['手动方式', '在项目文件夹地址栏输入 cmd 回车，依次执行 npm install（仅首次）和 npm run dev，浏览器打开 http://localhost:5178。'],
]

const FAQ = [
  ['真实大模型怎么接？', '右上角「模型设置」填 Base URL / API Key / 模型名，OpenAI、DeepSeek、通义、豆包方舟都兼容，配置只存本机 localStorage。'],
  ['只有音频、没有字幕怎么办？', '在音频区挂载 mp3 / wav / m4a 后，下方出现「本地转写」：选模型档位（极速 / 平衡 / 精准）和语言，点「音频转字幕」，浏览器本地跑 Whisper 自动生成带时间戳的字幕，无需 Key、音频不离开本机。极速档模型已随项目内置，断网也能直接转写；平衡 / 精准档首次需联网下载，成功后可离线使用。'],
  ['长音频转写会卡死吗？能中途停止吗？', '推理在独立 Web Worker 线程执行，不占用主线程，几分钟的长音频转写时页面依旧可点可滚动，不会出现「此页面没有响应」。转写中按钮变为「停止转写」，点一下立即终止，已生成的部分不会保留。'],
  ['为什么是繁体？拼音怎么处理？', 'Whisper 三档默认都输出繁体，转写后会自动用 OpenCC 转成简体、半角标点转全角。模型拿不准的词可能输出拼音（拉丁字母），完成后会黄色提示并列出这些词，建议人工核对；换平衡 / 精准档可减少，模型本身的错字无法靠后处理自动修复。'],
  ['为什么双击 dist 里的 index.html 会白屏？', '构建产物依赖模块加载，file:// 直开受浏览器安全策略限制。请用「启动.bat」或 npm run dev，不要直接双击构建文件。'],
  ['纯文本字幕的时间准吗？', '没有时间码的纯文本默认按语速估算，可在素材区切换慢/正常/快，也可填真实音频总时长按字数比例锚定；界面会标注「估算/已锚定」，有 SRT/VTT 时才是精确时间。'],
  ['数据会上传吗？', '不会。本项目无后端，字幕、音频、Key、学习画像都只存在当前浏览器，清理浏览器缓存会清空它们。'],
  ['部分模型报 CORS 错误？', '纯前端直连个别服务商时会被浏览器跨域策略拦截，这是无后端的固有限制，换支持 CORS 的服务商或先用本地模拟引擎。'],
]

function Section({ index, title, children }) {
  return (
    <section className="help-section">
      <div className="help-head">
        <span className="help-no">{index}</span>
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  )
}

export default function HelpDrawer({ open, onClose }) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={640}
      title="使用说明书"
      styles={{ body: { padding: '6px 22px 44px' } }}
    >
      <p className="help-lead">
        输入播客字幕，AI 自动挑出可独立剪成短视频的金句片段，给出时间码、理由与评分，
        用时间轴摆到全片位置，可微调、可试听、可导出剪辑清单。无后端、无数据库，前端单机运行。
      </p>
      <p className="help-version-line">当前版本 v6.0 · 本地单机运行，配置与数据不离开本机</p>

      <Section index="01" title="四步上手">
        <div className="help-steps">
          {STEPS.map(([t, d]) => (
            <div className="help-step" key={t}>
              <span className="help-step-title">{t}</span>
              <span className="help-step-desc">{d}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section index="02" title="键盘快速决策（焦点不在输入框时）">
        <div className="help-keys">
          {KEYS.map(([k, d]) => (
            <div className="help-key" key={k}>
              <kbd className="help-kbd">{k}</kbd>
              <span>{d}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section index="03" title="在别的电脑上打开（Windows）">
        <div className="help-steps">
          {OTHER_PC.map(([t, d]) => (
            <div className="help-step" key={t}>
              <span className="help-step-title">{t}</span>
              <span className="help-step-desc">{d}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section index="04" title="常见问题">
        <div className="help-faq">
          {FAQ.map(([q, a]) => (
            <div className="help-faq-item" key={q}>
              <div className="help-faq-q">{q}</div>
              <div className="help-faq-a">{a}</div>
            </div>
          ))}
        </div>
      </Section>
    </Drawer>
  )
}
