// 主办方 API 冒烟测试：SSE 流式 + JSON 结构化 + 多模态模型可用性
import { readFileSync } from 'node:fs';

const BASE = 'https://discovery-api.intern-ai.org.cn/v1';
const KEY = readFileSync('tools/content-forge/.env', 'utf8').match(/ATRIA_KEY=(\S+)/)[1];

async function testStream(model = 'Atria-Dawn-Preview') {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: '你是明代史官，只用文言短句作答，不超过30字。' },
        { role: 'user', content: '简评张居正' },
      ],
      max_tokens: 120,
    }),
  });
  if (!res.ok) { console.log(`STREAM [${model}] FAIL`, res.status, (await res.text()).slice(0, 200)); return; }
  process.stdout.write(`STREAM [${model}] OK: `);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', chunks = 0, text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      try { const j = JSON.parse(payload); const t = j.choices?.[0]?.delta?.content; if (t) { text += t; chunks++; } } catch { /* 忽略残行 */ }
    }
  }
  console.log(`${chunks} chunks | "${text}"`);
}

async function testStructured() {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: 'Atria-Dawn-Preview',
      messages: [{ role: 'user', content: '输出JSON对象：{"branch":"分支名","narrative":"一句话推演"}，内容关于"若土木堡无此败"的一层推演，简短。' }],
      max_tokens: 200,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) { console.log('STRUCTURED FAIL', res.status, (await res.text()).slice(0, 200)); return; }
  const j = await res.json();
  console.log('STRUCTURED OK:', j.choices?.[0]?.message?.content?.slice(0, 160));
}

async function testVision(model = 'kimi-k2.6') {
  // 用一张 1x1 红色像素 PNG 验证多模态输入链路
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '这张图主色是什么？答一个词。' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' } },
        ],
      }],
      max_tokens: 20,
    }),
  });
  if (!res.ok) { console.log(`VISION [${model}] FAIL`, res.status, (await res.text()).slice(0, 200)); return; }
  const j = await res.json();
  console.log(`VISION [${model}] OK:`, j.choices?.[0]?.message?.content?.slice(0, 60));
}

const which = process.argv[2] ?? 'all';
if (which === 'all' || which === 'stream') await testStream();
if (which === 'all' || which === 'json') await testStructured();
if (which === 'all' || which === 'vision') await testVision();
