/**
 * 转写文本后处理
 *
 * Whisper 中文模型（tiny/base/small 均如此）默认输出繁体、半角逗号，
 * 在不确定的词上还可能回退成拼音（拉丁字母）。这里做确定性收敛：
 *
 * 1. 繁转简：OpenCC（台湾正体 → 大陆简体），繁→简是收敛映射，单字/词组可靠；
 * 2. 标点与空白规范化：中文语境下的半角标点转全角、折叠多余空格；
 * 3. 拉丁字母检测：找出疑似拼音/外文片段，交 UI 提示人工核对，不做无依据的硬转。
 */

let converterPromise = null
function getConverter() {
  if (!converterPromise) {
    converterPromise = import('opencc-js/t2cn').then((mod) =>
      // Whisper 的繁体更接近台湾正体，tw 入口含 TW 变体与词组转换
      mod.Converter({ from: 'tw', to: 'cn' }),
    )
  }
  return converterPromise
}

// 半角 → 全角标点（句点避开数字小数点）
function normalizePunctuation(text) {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*,\s*/g, '，')
    .replace(/\s*!\s*/g, '！')
    .replace(/\s*\?\s*/g, '？')
    .replace(/\s*;\s*/g, '；')
    .replace(/\s*:\s*/g, '：')
    .replace(/(?<![0-9])\.(?![0-9])/g, '。')
    .replace(/\s+([，。！？；：、）】》])/g, '$1')
    .replace(/([（【《])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 提取一段文本里的连续拉丁字母串（疑似拼音/外文） */
export function findLatinSegments(text) {
  return text.match(/[A-Za-z]+/g) || []
}

/**
 * 规范化单条片段文本。
 * @param {string} text 原始识别文本
 * @param {{language?: string|null}} options language 为 'english' 时不做中文处理
 */
export async function normalizeChunkText(text, { language = null } = {}) {
  const source = String(text || '')
  if (language === 'english') {
    return source.replace(/\s+/g, ' ').trim()
  }
  const converter = await getConverter()
  return normalizePunctuation(converter(source))
}

/**
 * 规范化整份转写结果，返回新的 chunks 与告警信息。
 * chunks 元素形如 { timestamp:[start,end], text }。
 */
export async function normalizeChunks(chunks, { language = null } = {}) {
  const latinHits = []
  const normalized = await Promise.all(
    (chunks || []).map(async (chunk, index) => {
      const text = await normalizeChunkText(chunk.text, { language })
      findLatinSegments(text).forEach((word) =>
        latinHits.push({ index, word }),
      )
      return { ...chunk, text }
    }),
  )

  // 合并后的整段文本同样过一遍，保证 text 与 chunks 一致
  const joinedText = normalized.map((c) => c.text).join('')
  const fullText =
    language === 'english'
      ? normalized.map((c) => c.text).join(' ')
      : await normalizeChunkText((chunks || []).map((c) => c.text).join(''), {
          language,
        })

  return {
    chunks: normalized,
    text: fullText || joinedText,
    latinHits,
    hasLatin: latinHits.length > 0,
  }
}
