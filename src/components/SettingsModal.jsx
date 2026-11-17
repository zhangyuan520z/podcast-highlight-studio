import React, { useEffect, useState } from 'react'
import { App as AntApp, Button, Input, Modal } from 'antd'

const PROVIDERS = [
  {
    name: 'DeepSeek',
    site: 'https://platform.deepseek.com',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    note: '官方 Base URL 不带 /v1',
  },
  {
    name: '豆包 · 火山方舟',
    site: 'https://console.volcengine.com/ark',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'deepseek-v4-1-flash-261017',
    note: '预置接入点直接填 Model ID；自定义接入点才填 ep-xxx',
    arkModels: [
      { id: 'deepseek-v4-1-flash-261017', label: 'DeepSeek V4.1 Flash' },
      { id: 'deepseek-v4-1-flash-economy-261017', label: 'DeepSeek 经济版' },
      { id: 'doubao-seed-evolving', label: '豆包 Evolving' },
      { id: 'doubao-seed-2-1-pro-260915', label: '豆包 2.1 Pro' },
      { id: 'glm-5-3-flash-260828', label: 'GLM 5.3 Flash' },
      { id: 'kimi-k3-1-pro-261024', label: 'Kimi K3.1 Pro' },
    ],
  },
  {
    name: '通义千问',
    site: 'https://dashscope.console.aliyun.com',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  {
    name: '智谱 GLM',
    site: 'https://open.bigmodel.cn',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4.5',
  },
  {
    name: 'Kimi · 月之暗面',
    site: 'https://platform.moonshot.cn',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2-0905-preview',
  },
  {
    name: '硅基流动',
    site: 'https://cloud.siliconflow.cn',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
    note: '一个 Key 调多家模型，模型名带前缀',
  },
  {
    name: '百度千帆',
    site: 'https://qianfan.cloud.baidu.com',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    model: 'ernie-speed-8k',
  },
  {
    name: '腾讯混元',
    site: 'https://cloud.tencent.com/product/hunyuan',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    model: 'hy4-flash',
  },
  {
    name: 'MiniMax',
    site: 'https://platform.minimaxi.com',
    baseUrl: 'https://api.minimax.chat/v1',
    model: 'MiniMax-M3',
  },
  {
    name: 'OpenAI',
    site: 'https://platform.openai.com',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
]

export default function SettingsModal({ open, config, promptVersion, onPromptVersion, onClose, onSave }) {
  const { message } = AntApp.useApp()
  const [draft, setDraft] = useState(config)
  const [testing, setTesting] = useState(false)
  const [siteProvider, setSiteProvider] = useState(null)
  const [siteUrl, setSiteUrl] = useState('')

  useEffect(() => {
    if (open) setDraft(config)
  }, [open, config])

  const applyPreset = (p) => {
    // 火山方舟 model 为空时一并清空，避免残留上一家的模型名导致 404
    setDraft((d) => ({ ...d, baseUrl: p.baseUrl, model: p.model }))
  }

  const openSite = (p) => {
    setSiteProvider(p)
    setSiteUrl(p.site)
  }

  const copySite = async () => {
    try {
      await navigator.clipboard.writeText(siteUrl)
      message.success('官网地址已复制')
    } catch {
      message.error('浏览器拒绝了剪贴板访问')
    }
  }

  const testConnection = async () => {
    if (!draft.apiKey?.trim()) {
      message.warning('先填 API Key')
      return
    }
    setTesting(true)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const base = draft.baseUrl.trim().replace(/\/+$/, '')
      const url = /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${draft.apiKey.trim()}` },
        body: JSON.stringify({
          model: draft.model.trim(),
          messages: [{ role: 'user', content: '回复 ok 两个字母' }],
          max_tokens: 8,
        }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        if (res.status === 401) throw new Error('Key 无效（401）')
        if (res.status === 402) throw new Error('账户余额不足（402），请登录官网充值后再试')
        if (res.status === 404) {
          if (/volces\.com/i.test(base)) {
            throw new Error('火山方舟模型名不对（404）：预置接入点填 Model ID（如 deepseek-v4-1-flash-261017），自定义接入点填 ep-xxx')
          }
          throw new Error('接口地址或模型名不对（404）')
        }
        throw new Error(`${res.status} ${body.slice(0, 100)}`)
      }
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      message.success(`连接正常，模型返回：${String(content || '').slice(0, 24)}`)
    } catch (err) {
      if (err?.name === 'AbortError') {
        message.error('15 秒内没连上：该端点在当前网络下不可达（如 OpenAI 大陆直连），建议换 DeepSeek 等国内服务商')
      } else if (err instanceof TypeError) {
        const isOpenAI = /api\.openai\.com/i.test(draft.baseUrl)
        message.error(
          isOpenAI
            ? 'OpenAI 官方端点在中国大陆无法直连，请换 DeepSeek / 通义 / 智谱等国内服务商'
            : '请求发不出去：Base URL 不通，或该服务商不允许浏览器直连（CORS）'
        )
      } else {
        message.error(`连接失败：${err.message}`)
      }
    } finally {
      clearTimeout(timer)
      setTesting(false)
    }
  }

  return (
    <>
      <Modal
        open={open}
        title="模型设置"
        onCancel={onClose}
        width={560}
      footer={[
        <Button key="test" onClick={testConnection} loading={testing} style={{ float: 'left' }}>
          测试连接
        </Button>,
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="ok" type="primary" onClick={() => onSave(draft)}>
          保存
        </Button>,
      ]}
      styles={{ body: { paddingTop: 14 } }}
    >
      <div style={{ fontSize: 11.5, color: '#828D93', lineHeight: 1.8, marginBottom: 14 }}>
        Key 只保存在这台电脑的浏览器 localStorage 里，不经过本项目任何后端——本工具本身没有后端。
        留空则一律走本地模拟引擎。
      </div>

      <div className="block-head">
        <span className="block-title">主流服务商</span>
        <span className="block-hint">点名称填充 · 点官网去领 Key</span>
      </div>
      <div className="provider-list">
        {PROVIDERS.map((p) => (
          <div className="provider-item" key={p.name}>
            <button type="button" className="provider-name" onClick={() => applyPreset(p)}>
              {p.name}
            </button>
            <div className="provider-meta">
              <span className="provider-url">{p.baseUrl}</span>
              {p.note && <span className="provider-note">{p.note}</span>}
            </div>
            <button type="button" className="provider-site" onClick={() => openSite(p)}>
              官网
            </button>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: '#828D93', lineHeight: 1.6, margin: '6px 0 16px' }}>
        模型名为示例，具体 ID 以各官网「模型列表」复制为准。火山方舟预置接入点可直接用 Model ID（如 deepseek-v4-1-flash-261017），只有自定义接入点才需要填 ep-xxx。
      </div>

      <div className="param">
        <div className="param-head">
          <span className="param-name">Base URL</span>
          <span className="block-hint">结尾不要带斜杠</span>
        </div>
        <Input
          value={draft.baseUrl}
          onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
          placeholder="https://api.openai.com/v1"
        />
      </div>

      <div className="param">
        <div className="param-head">
          <span className="param-name">API Key</span>
          <span className="block-hint">各平台格式不同，原样粘贴</span>
        </div>
        <Input.Password
          value={draft.apiKey}
          onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
          placeholder="留空 = 使用本地模拟引擎"
          autoComplete="off"
        />
      </div>

      <div className="param">
        <div className="param-head">
          <span className="param-name">模型名</span>
          <span className="block-hint">按服务商实际名称填</span>
        </div>
        <Input
          value={draft.model}
          onChange={(e) => setDraft({ ...draft, model: e.target.value })}
          placeholder="deepseek-flash / qwen-plus / deepseek-v4-1-flash-261017"
        />
        {/volces\.com/i.test(draft.baseUrl) && (
          <div className="ark-models">
            <div className="ark-models-tip">火山方舟 · 点选完整 Model ID，无需手打（避免漏日期后缀）</div>
            <div className="ark-model-chips">
              {PROVIDERS.find((p) => /volces\.com/i.test(p.baseUrl))?.arkModels.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className={`ark-model-chip${draft.model === m.id ? ' active' : ''}`}
                  title={m.id}
                  onClick={() => setDraft({ ...draft, model: m.id })}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="param">
        <div className="param-head">
          <span className="param-name">Prompt 版本</span>
          <span className="block-hint">默认 v3</span>
        </div>
        <div className="seg" style={{ marginTop: 8, marginBottom: 10 }}>
          {['v1', 'v2', 'v3'].map((v) => (
            <button key={v} aria-pressed={promptVersion === v} onClick={() => onPromptVersion(v)}>
              {v}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#828D93', lineHeight: 1.7, paddingBottom: 4 }}>
          切换后用同一个素材再跑一次，就能直接对比三代 Prompt 的输出差异——这是本项目故意保留的对照实验。
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#828D93', lineHeight: 1.7, marginTop: 8 }}>
        浏览器直连会被部分服务商以 CORS 拦截。OpenAI、DeepSeek、通义兼容模式通常允许；若被拦截，
        可改用服务商提供的「允许浏览器访问」的兼容端点，或本地起一个代理。
      </div>
    </Modal>

    <Modal
      open={Boolean(siteProvider)}
      title={siteProvider ? `${siteProvider.name} · 官网` : ''}
      onCancel={() => setSiteProvider(null)}
      width={520}
      footer={[
        <Button key="copy" onClick={copySite}>
          复制地址
        </Button>,
        <Button key="cancel" onClick={() => setSiteProvider(null)}>
          关闭
        </Button>,
        <Button key="open" type="primary" onClick={() => window.open(siteUrl, '_blank', 'noopener')}>
          在新标签打开官网
        </Button>,
      ]}
    >
      {siteProvider && (
        <div className="site-modal-body">
          <div className="site-field">
            <div className="site-field-head">
              <span>官网地址</span>
              <span className="block-hint">输入窗 · 可编辑 / 复制</span>
            </div>
            <Input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          </div>
          <div className="site-field">
            <div className="site-field-head">
              <span>Base URL</span>
            </div>
            <Input value={siteProvider.baseUrl} readOnly />
          </div>
          <div className="site-field">
            <div className="site-field-head">
              <span>示例模型</span>
            </div>
            <Input value={siteProvider.model || '预置填 Model ID，自定义接入点填 ep-xxx'} readOnly />
          </div>
          <p className="site-tip">
            这些平台的安全策略禁止被其它网页内嵌（如 DeepSeek 明确 frame-ancestors none），本窗口无法直接显示官网页面；
            请点「在新标签打开官网」，登录后在控制台创建 API Key，再回到本工具填入。
          </p>
        </div>
      )}
    </Modal>
    </>
  )
}
