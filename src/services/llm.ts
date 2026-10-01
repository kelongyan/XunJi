/**
 * 大模型接入层（唯一出口，零 SDK）
 *
 * 架构（方案书 §0.4）：
 * - 原生 fetch + SSE 手写解析，OpenAI 兼容协议
 * - 供应商/模型全部读环境变量（.env.local），改一行即切换
 * - 统一封装 reasoning:false（主力 Atria 为推理模型，思考链会先于正文
 *   输出并耗尽 max_tokens——实测踩坑，见方案书 §0.3）
 * - 演示回放模式：VITE_LLM_REPLAY=1 时全部端点走预录响应逐字回放，
 *   断网演示与真流式 UI 完全一致
 * - "墨尽"错误态：统一错误类型，界面层渲染风格化报错，技术文案不露脸
 *
 * 安全边界：key 只进 .env.local（gitignore *.local），仅本地演示用；
 * 严禁把 key 写进任何 src/ 文件或提交任何凭据文件。
 */

/* ── 配置（构建期注入，缺省走主办方服务） ── */

const BASE = import.meta.env.VITE_LLM_BASE ?? 'https://discovery-api.intern-ai.org.cn/v1'
const KEY = import.meta.env.VITE_LLM_KEY ?? ''
/** 主力（深度文本） */
export const MODEL_MAIN = import.meta.env.VITE_LLM_MODEL ?? 'Atria-Dawn-Preview'
/** 多模态（看图） */
export const MODEL_VISION = import.meta.env.VITE_LLM_VISION_MODEL ?? 'kimi-k2.6'
/** 快速档（交互问答，响应优先） */
export const MODEL_FAST = import.meta.env.VITE_LLM_FAST_MODEL ?? 'deepseek-v4-flash-0731'

/** 演示回放模式（构建期常量；=1 全端点走预录响应） */
export const REPLAY_MODE = String(import.meta.env.VITE_LLM_REPLAY ?? '') === '1'

/** 服务是否配置了 key（未配置时界面显示"翰墨未启"态而非报错） */
export const llmEnabled = (): boolean => REPLAY_MODE || !!KEY

/* ── 类型 ── */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  /** 文本，或多模态内容块数组（text / image_url） */
  content: string | Array<{ type: 'text'; text: string } | ImageBlock>
}

/** 多模态消息内容块（图片走 base64 data URL） */
export interface ImageBlock {
  type: 'image_url'
  image_url: { url: string }
}
export type UserContent = string | Array<{ type: 'text'; text: string } | ImageBlock>
/** "墨尽"错误：接入层所有失败统一抛此型，界面层据此渲染风格化报错 */
export class InkOutError extends Error {
  constructor(reason: 'network' | 'http' | 'empty' | 'nokey') {
    super(`llm:${reason}`)
    this.name = 'InkOutError'
  }
}

export interface StreamOptions {
  /** 模型（缺省主力） */
  model?: string
  /** 采样温度（默认 0.7） */
  temperature?: number
  /** 输出预算（推理模型思考链会占用，默认 1600 起步） */
  maxTokens?: number
  /** 强制 JSON 输出（json_object，结构化场景用） */
  json?: boolean
  /** 回放模式的预录文本（REPLAY_MODE=1 时生效；也用于单测/离线开发） */
  replayText?: string
  /** 中止信号 */
  signal?: AbortSignal
}

/* ── 回放模式 ── */

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

/** 预录文本逐字回放（每 tick 吐 2-4 字，模拟流式节奏；reduced 节奏约 24ms/tick） */
async function replayStream(
  text: string,
  onDelta: (s: string) => void,
  opts: StreamOptions
): Promise<string> {
  let i = 0
  while (i < text.length) {
    const step = 2 + Math.floor(Math.random() * 3)
    onDelta(text.slice(i, i + step))
    i += step
    await sleep(24, opts.signal)
  }
  return text
}

/* ── SSE 解析 ── */

/**
 * 解析一行 SSE data 负载，提取增量文本。
 * 兼容三类 delta：content（正文）/ reasoning_content（推理链，忽略）。
 */
function extractDelta(payload: string): string {
  try {
    const j = JSON.parse(payload)
    return j.choices?.[0]?.delta?.content ?? ''
  } catch {
    return ''
  }
}

/* ── 核心流式接口 ── */

/**
 * 流式对话。onDelta 逐段回调增量文本；resolve 值为完整文本。
 * 失败统一抛 InkOutError（network/http/empty）。
 */
export async function createChatStream(
  messages: ChatMessage[],
  onDelta: (s: string) => void,
  opts: StreamOptions = {}
): Promise<string> {
  const {
    model = MODEL_MAIN,
    temperature = 0.7,
    maxTokens = 1600,
    json = false,
    signal
  } = opts

  // 回放模式：本地逐字回放，零网络
  if (REPLAY_MODE && opts.replayText) {
    return replayStream(opts.replayText, onDelta, opts)
  }

  if (!KEY) throw new InkOutError('nokey')

  let res: Response
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature,
        max_tokens: maxTokens,
        // 主力为 reasoning 模型：关闭思考链，否则正文被推理预算挤占（实测 §0.3）
        reasoning: false,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        messages
      })
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new InkOutError('network')
  }

  if (!res.ok) throw new InkOutError('http')

  const reader = res.body?.getReader()
  if (!reader) throw new InkOutError('network')

  const decoder = new TextDecoder()
  let buf = ''
  let full = ''
  while (true) {
    let done: boolean
    let chunk: Uint8Array
    try {
      const r = await reader.read()
      done = r.done
      chunk = r.value ?? new Uint8Array()
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      throw new InkOutError('network')
    }
    if (done) break
    buf += decoder.decode(chunk, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') continue
      const delta = extractDelta(payload)
      if (delta) {
        full += delta
        onDelta(delta)
      }
    }
  }
  if (!full.trim()) throw new InkOutError('empty')
  return full
}

/** 非流式便捷封装（结构化输出场景：推演树、出题等） */
export async function chatJson<T>(messages: ChatMessage[], opts: StreamOptions = {}): Promise<T> {
  const text = await createChatStream(messages, () => {}, { ...opts, json: true })
  try {
    return JSON.parse(text) as T
  } catch {
    // 容忍模型在 JSON 外包了 markdown 代码栏
    const m = text.match(/\{[\s\S]*\}/)
    if (m) return JSON.parse(m[0]) as T
    throw new InkOutError('empty')
  }
}

/** 多模态消息构造（图片 base64 data URL） */
export function userWithImage(text: string, imageDataUrl: string): ChatMessage {
  return {
    role: 'user',
    content: [
      { type: 'text', text },
      { type: 'image_url', image_url: { url: imageDataUrl } }
    ]
  }
}
