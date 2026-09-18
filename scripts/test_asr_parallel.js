/**
 * ASR 并行测试脚本
 * 
 * 测试目标：验证单个 Key 并行调用是否影响速度
 * 策略：
 *   1. 顺序模式：用同一个 Key 先后发两次请求，记录总耗时
 *   2. 并行模式：用同一个 Key 同时发两次请求，记录总耗时
 *   3. 对比：如果并行耗时 ≈ 顺序耗时的一半，说明并行不影响速度
 *                如果并行耗时 ≈ 顺序耗时，说明服务端有限流
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// 从 data.json 读取 Key
const dataJson = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'data.json'), 'utf8'
));
const API_KEY = dataJson.asrApiKey1;
const BASE_URL = 'https://api.siliconflow.cn/v1/audio/transcriptions';
const MODEL = dataJson.asrModel || 'TeleAI/TeleSpeechASR';

// 测试音频
const AUDIO_FILE = path.join(__dirname, '..', 'test_audio.mp3');
const audioBuffer = fs.readFileSync(AUDIO_FILE);

console.log(`🔑 使用 Key: ${API_KEY.slice(0, 10)}...${API_KEY.slice(-4)}`);
console.log(`📁 音频文件: ${AUDIO_FILE} (${(audioBuffer.length / 1024).toFixed(1)} KB)`);
console.log('');

function generateBoundary() {
    return `----SiliconASR${Date.now()}${Math.random().toString(16).slice(2)}`;
}

function buildMultipartBody(fields, boundary) {
    const parts = [];
    const CRLF = '\r\n';
    for (const field of fields) {
        parts.push(Buffer.from(`--${boundary}${CRLF}`));
        if (typeof field.value === 'string') {
            parts.push(Buffer.from(`Content-Disposition: form-data; name="${field.name}"${CRLF}${CRLF}`));
            parts.push(Buffer.from(field.value));
            parts.push(Buffer.from(CRLF));
        } else {
            const { buffer, filename } = field.value;
            parts.push(Buffer.from(
                `Content-Disposition: form-data; name="${field.name}"; filename="${filename}"${CRLF}` +
                `Content-Type: audio/mpeg${CRLF}${CRLF}`
            ));
            parts.push(buffer);
            parts.push(Buffer.from(CRLF));
        }
    }
    parts.push(Buffer.from(`--${boundary}--${CRLF}`));
    return Buffer.concat(parts);
}

function callASR(label) {
    return new Promise((resolve, reject) => {
        const boundary = generateBoundary();
        const fields = [
            { name: 'file', value: { buffer: audioBuffer, filename: 'test_audio.mp3' } },
            { name: 'model', value: MODEL },
            { name: 'response_format', value: 'verbose_json' },
            { name: 'timestamp_granularities[]', value: 'segment' },
        ];
        const bodyBuffer = buildMultipartBody(fields, boundary);

        const parsedUrl = new URL(BASE_URL);
        const requestOptions = {
            hostname: parsedUrl.hostname,
            port: 443,
            path: parsedUrl.pathname,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': bodyBuffer.length.toString(),
            },
            agent: new https.Agent({ keepAlive: true, rejectUnauthorized: true }),
        };

        const startTime = Date.now();
        const req = https.request(requestOptions, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                const bodyText = Buffer.concat(chunks).toString('utf-8');
                if (res.statusCode !== 200) {
                    console.error(`❌ [${label}] HTTP ${res.statusCode}: ${bodyText.substring(0, 300)}`);
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                try {
                    const parsed = JSON.parse(bodyText);
                    const text = parsed.text || '(no text)';
                    console.log(`✅ [${label}] 耗时: ${elapsed}s | 文本长度: ${text.length} | 前50字: ${text.substring(0, 50)}`);
                    resolve({ elapsed: parseFloat(elapsed), text });
                } catch (e) {
                    reject(e);
                }
            });
            res.on('error', reject);
        });

        req.on('error', reject);
        req.setTimeout(120_000, () => {
            req.destroy(new Error('timeout'));
        });

        req.write(bodyBuffer);
        req.end();
    });
}

async function main() {
    console.log('========== 测试 1: 顺序模式（同一个 Key，先发 A 再发 B）==========');
    const seqStart = Date.now();
    const seqA = await callASR('顺序-A');
    const seqB = await callASR('顺序-B');
    const seqTotal = ((Date.now() - seqStart) / 1000).toFixed(2);
    console.log(`📊 顺序总耗时: ${seqTotal}s (A=${seqA.elapsed}s, B=${seqB.elapsed}s)\n`);

    console.log('========== 测试 2: 并行模式（同一个 Key，同时发 A 和 B）==========');
    const parStart = Date.now();
    const [parA, parB] = await Promise.all([callASR('并行-A'), callASR('并行-B')]);
    const parTotal = ((Date.now() - parStart) / 1000).toFixed(2);
    console.log(`📊 并行总耗时: ${parTotal}s (A=${parA.elapsed}s, B=${parB.elapsed}s)\n`);

    console.log('========== 结论 ==========');
    const seqNum = parseFloat(seqTotal);
    const parNum = parseFloat(parTotal);
    const ratio = parNum / seqNum;
    console.log(`顺序: ${seqTotal}s | 并行: ${parTotal}s | 比值: ${ratio.toFixed(2)}`);
    if (ratio < 0.7) {
        console.log('✅ 并行有效！单个 Key 并行不影响速度，可以放心使用多路并行。');
    } else if (ratio < 0.9) {
        console.log('⚠️ 并行有一定效果，但存在轻微限流。建议谨慎增加并发。');
    } else {
        console.log('❌ 并行无效。服务端可能对单个 Key 有限流，并行耗时与顺序接近。');
    }
}

main().catch(console.error);
