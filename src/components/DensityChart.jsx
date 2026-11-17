import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { secToStamp } from '../lib/timecode.js'

export default function DensityChart({ cues, highlights, duration }) {
  const option = useMemo(() => {
    const total = duration || 1
    const bucketCount = Math.min(44, Math.max(8, Math.ceil(total / 20)))
    const bucketLen = total / bucketCount

    const charBuckets = new Array(bucketCount).fill(0)
    const hlBuckets = new Array(bucketCount).fill(0)
    const labels = new Array(bucketCount).fill('')

    for (let i = 0; i < bucketCount; i += 1) {
      labels[i] = secToStamp(i * bucketLen).slice(3)
    }
    for (const c of cues) {
      const idx = Math.min(bucketCount - 1, Math.floor(c.start / bucketLen))
      charBuckets[idx] += c.text ? c.text.length : 0
    }
    for (const h of highlights) {
      const idx = Math.min(bucketCount - 1, Math.floor(h.start / bucketLen))
      hlBuckets[idx] += 1
    }

    const maxChars = Math.max(...charBuckets, 1)
    const maxHl = Math.max(...hlBuckets, 1)

    return {
      animationDuration: 400,
      grid: { left: 2, right: 2, top: 8, bottom: 2, containLabel: false },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#05070a',
        borderColor: 'rgba(233,231,226,0.16)',
        borderWidth: 1,
        textStyle: { color: '#E9E7E2', fontSize: 11.5, fontFamily: 'JetBrains Mono' },
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(246,167,43,0.08)' } },
        formatter: (params) => {
          const i = params?.[0]?.dataIndex ?? 0
          const from = secToStamp(i * bucketLen)
          const to = secToStamp(Math.min(total, (i + 1) * bucketLen))
          return `${from} – ${to}<br/>字幕 ${charBuckets[i]} 字 · 高光 ${hlBuckets[i]} 段`
        },
      },
      xAxis: {
        type: 'category',
        data: labels,
        show: false,
        boundaryGap: true,
      },
      yAxis: [
        { type: 'value', show: false, max: maxChars * 1.15 },
        { type: 'value', show: false, max: maxHl * 1.15 + 1 },
      ],
      series: [
        {
          name: '字幕字数',
          type: 'line',
          yAxisIndex: 0,
          data: charBuckets,
          smooth: 0.35,
          symbol: 'none',
          lineStyle: { color: 'rgba(79,191,173,0.55)', width: 1 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(79,191,173,0.20)' },
                { offset: 1, color: 'rgba(79,191,173,0.01)' },
              ],
            },
          },
          z: 1,
        },
        {
          name: '高光段数',
          type: 'bar',
          yAxisIndex: 1,
          data: hlBuckets,
          barMaxWidth: 10,
          itemStyle: {
            color: '#F6A72B',
            borderRadius: [2, 2, 0, 0],
          },
          z: 2,
        },
      ],
    }
  }, [cues, highlights, duration])

  return (
    <div className="density">
      <div className="density-head">
        <span className="density-title">全片节奏与高光分布</span>
        <span className="block-hint">柱 = 该时段高光数量 · 面积 = 字幕密度</span>
      </div>
      <ReactECharts
        option={option}
        style={{ height: 78, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge
        lazyUpdate
      />
    </div>
  )
}
