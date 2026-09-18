/**
 * 测试 OpenCode 网关对 Qwen 思考模式参数的实际支持情况
 * 使用 data.json 中的新 API key
 */

const https = require('https');

const BASE_URL = 'https://opencode.ai/zen/go/v1/chat/completions';
const API_KEY = 'sk-sEOKsXToaRzOMw9CfphithKCVPuVYfBj94t83EReUtfrBfysReGo5CWOdy8lj6ws';

const PROMPT = '用一句话回答：1+1=?';

function postJSON(body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body), 'utf8');
    const req = https.request(
      BASE_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Length': data.length,
        },
        timeout: 60000,
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: chunks });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout 60s')));
    req.write(data);
    req.end();
  });
}

async function tryCase(label, body) {
  console.log(`\n========== ${label} ==========`);
  console.log('REQUEST BODY:', JSON.stringify(body, null, 2));
  try {
    const t0 = Date.now();
    const r = await postJSON(body);
    const dt = Date.now() - t0;
    console.log(`HTTP ${r.status} (${dt}ms)`);
    console.log('RESPONSE:', r.body.slice(0, 1000));
    return { success: r.status >= 200 && r.status < 300, status: r.status };
  } catch (e) {
    console.log('ERROR:', e.message);
    return { success: false, status: 0 };
  }
}

(async () => {
  const results = {};

  // 测试 1: reasoning_effort 枚举值 (OpenAI 风格)
  results['1_reasoning_effort_high'] = await tryCase('测试1: reasoning_effort="high" (OpenAI风格)', {
    model: 'qwen3.7-plus',
    messages: [{ role: 'user', content: PROMPT }],
    stream: false,
    reasoning_effort: 'high',
  });

  // 测试 2: enable_thinking + thinking_budget (DashScope 风格)
  results['2_enable_thinking_budget'] = await tryCase('测试2: enable_thinking=true + thinking_budget=81920 (DashScope风格)', {
    model: 'qwen3.7-plus',
    messages: [{ role: 'user', content: PROMPT }],
    stream: false,
    enable_thinking: true,
    thinking_budget: 81920,
  });

  // 测试 3: thinking 对象 (Anthropic 风格)
  results['3_thinking_object'] = await tryCase('测试3: thinking={type:"enabled"} (Anthropic风格)', {
    model: 'qwen3.7-plus',
    messages: [{ role: 'user', content: PROMPT }],
    stream: false,
    thinking: { type: 'enabled' },
  });

  // 测试 4: reasoning 对象 (OpenAI Responses API 风格)
  results['4_reasoning_object'] = await tryCase('测试4: reasoning={effort:"high"} (Responses API风格)', {
    model: 'qwen3.7-plus',
    messages: [{ role: 'user', content: PROMPT }],
    stream: false,
    reasoning: { effort: 'high' },
  });

  // 测试 5: 无思考参数 (基线)
  results['5_no_thinking'] = await tryCase('测试5: 无思考参数 (基线)', {
    model: 'qwen3.7-plus',
    messages: [{ role: 'user', content: PROMPT }],
    stream: false,
  });

  // 测试 6: reasoning_effort="max" (DeepSeek 扩展)
  results['6_reasoning_effort_max'] = await tryCase('测试6: reasoning_effort="max" (DeepSeek扩展)', {
    model: 'qwen3.7-plus',
    messages: [{ role: 'user', content: PROMPT }],
    stream: false,
    reasoning_effort: 'max',
  });

  console.log('\n========== 汇总 ==========');
  for (const [k, v] of Object.entries(results)) {
    console.log(`${k}: ${v.success ? '✅ 成功' : '❌ 失败'} (HTTP ${v.status})`);
  }
  const anyOk = Object.values(results).some(r => r.success);
  process.exit(anyOk ? 0 : 1);
})();
