// 技术验证：本地 Whisper 能否从镜像加载并识别中文音频（带时间戳）
import fs from 'node:fs'
import wavefilePkg from 'wavefile'
import { pipeline, env } from '@huggingface/transformers'

const { WaveFile } = wavefilePkg

// 大陆环境改用 hf-mirror，避免直连 huggingface.co 超时
env.remoteHost = 'https://hf-mirror.com/'
env.allowLocalModels = false

const modelId = 'Xenova/whisper-tiny'
console.log('加载模型（首次会从镜像下载，之后缓存）：', modelId)
const tLoad0 = Date.now()
const transcriber = await pipeline('automatic-speech-recognition', modelId)
console.log('模型就绪，加载耗时(ms)：', Date.now() - tLoad0)

// Node 无 AudioContext，手动把 wav 解码成 16kHz 单声道 Float32Array
const wavPath = new URL('./sample-zh.wav', import.meta.url)
const wav = new WaveFile(fs.readFileSync(wavPath))
wav.toBitDepth('32f')
wav.toSampleRate(16000)
let samples = wav.getSamples(false)
if (Array.isArray(samples)) samples = samples[0]
console.log('音频采样数：', samples.length, '| 时长约(秒)：', (samples.length / 16000).toFixed(1))

console.log('开始识别…')
const t0 = Date.now()
const output = await transcriber(samples, {
  chunk_length_s: 30,
  stride_length_s: 5,
  language: 'chinese',
  task: 'transcribe',
  return_timestamps: true,
})
console.log('识别耗时(ms)：', Date.now() - t0)
console.log('全文：', output.text)
console.log('分段数：', (output.chunks || []).length)
for (const c of output.chunks || []) {
  console.log(JSON.stringify(c.timestamp), c.text)
}
console.log('SPIKE_OK')
