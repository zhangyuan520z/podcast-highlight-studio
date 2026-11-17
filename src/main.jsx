import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, App as AntApp, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App.jsx'
import './styles/index.css'

const themeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#f6a72b',
    colorInfo: '#f6a72b',
    colorBgBase: '#0b0e10',
    colorBgContainer: '#12171a',
    colorBgElevated: '#171e22',
    colorTextBase: '#e9e7e2',
    colorBorder: 'rgba(233,231,226,0.12)',
    borderRadius: 6,
    controlHeight: 32,
    fontSize: 13,
    fontFamily:
      "'Noto Sans SC', -apple-system, 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif",
  },
  components: {
    Slider: { railSize: 3, handleSize: 10, handleSizeHover: 12 },
    Drawer: { paddingLG: 22 },
    Modal: { contentBg: '#12171a', headerBg: '#12171a' },
    Tooltip: { colorBgSpotlight: '#05070a' },
  },
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={themeConfig} locale={zhCN}>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
)
