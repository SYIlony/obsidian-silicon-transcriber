/**
 * ASR 全流程耗时测试
 * 模拟插件实际流程：ffmpeg 提取音频 → 上传 ASR → 获取转写结果
 * 测试单块和 4 路并行的耗时
 */

const { execFileSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

// 从 data.json 读取配置
const dataJson = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'data.json'), 'utf8'
));
const API_KEYS = [dataJson.asrApiKey1, dataJson.asrApiKey2];
const BASE_URL = 'https://api.siliconflow.cn/v1/audio/transcriptions';
const MODEL = dataJson.asrModel || 'TeleAI/TeleSpeechASR';

const VIDEO_FILE = 'E:\\Obsidian_Hub\\Quick Mark\\Z_27政治\\01.考点串讲-马原\\01.导论.mp4';
const FFMPEG = path.join(__dirname, '..', 'ffmpeg.exe');
const CHUNK_SIZE = 600; // 10 分钟

console.log(`🎬 视频: ${VIDEO_FILE}`);
console.log(`🎵 模型: ${MODEL}`);
console.log(`🔑 Key 数: ${API_KEYS.length}`);
console.log(`⏱️ 分块大小: ${CHUNK_SIZE}s\n`);

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

function extractAudio(chunkStart, chunkDuration, label) {
    const t0 = Date.now();
    const tmpFile = path.join(__dirname, `test_chunk_${label}.mp3`);
    execFileSync(FFMPEG, [
        '-ss', String(chunkStart),
        '-t', String(chunkDuration),
        '-i', VIDEO_FILE,
        '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k',
        '-y', tmpFile
    ], { stdio: 'pipe' });
    const buffer = fs.readFileSync(tmpFile);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    console.log(`  📦 [${label}] ffmpeg 提取: ${elapsed}s | 大小: ${sizeMB}MB`);
    return { buffer, elapsed: parseFloat(elapsed), file: tmpFile };
}

function callASR(buffer, filename, apiKey, label) {
    return new Promise((resolve, reject) => {
        const boundary = generateBoundary();
        const fields = [
            { name: 'file', value: { buffer, filename } },
            { name: 'model', value: MODEL },
            { name: 'response_format', value: 'verbose_json' },
            { name: 'timestamp_granularities[]', value: 'segment' },
        ];
        const bodyBuffer = buildMultipartBody(fields, boundary);

        const parsedUrl = new URL(BASE_URL);
        const t0 = Date.now();
        const req = https.request({
            hostname: parsedUrl.hostname,
            port: 443,
            path: parsedUrl.pathname,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': bodyBuffer.length.toString(),
            },
            agent: new https.Agent({ keepAlive: true, rejectUnauthorized: true }),
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
                const bodyText = Buffer.concat(chunks).toString('utf-8');
                if (res.statusCode !== 200) {
                    console.error(`  ❌ [${label}] ASR HTTP ${res.statusCode}: ${bodyText.substring(0, 300)}`);
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                try {
                    const parsed = JSON.parse(bodyText);
                    const segCount = parsed.segments ? parsed.segments.length : 0;
                    const textLen = parsed.text ? parsed.text.length : 0;
                    console.log(`  ☁️ [${label}] ASR 转写: ${elapsed}s | segments: ${segCount} | 文本长度: ${textLen}`);
                    resolve({ elapsed: parseFloat(elapsed), result: parsed });
                } catch (e) {
                    reject(e);
                }
            });
            res.on('error', reject);
        });

        req.on('error', reject);
        req.setTimeout(1_800_000, () => req.destroy(new Error('timeout')));
        req.write(bodyBuffer);
        req.end();
    });
}

function cleanup(files) {
    for (const f of files) {
        try { fs.unlinkSync(f); } catch {}
    }
}

async function main() {
    // 计算分块
    const duration = 53 * 60 + 5; // ~3185s
    let totalChunks = Math.ceil(duration / CHUNK_SIZE);
    // 模拟插件的最后一块合并逻辑
    const lastChunkDuration = duration - (totalChunks - 1) * CHUNK_SIZE;
    if (lastChunkDuration < 180) totalChunks -= 1;
    console.log(`📊 总时长: ${duration}s | 分块数: ${totalChunks}\n`);

    // ========== 测试 1: 单块串行耗时 ==========
    console.log('========== 测试 1: 单块完整流程（提取+上传+转写）==========');
    const t1Start = Date.now();
    const { buffer: buf1, file: file1 } = extractAudio(0, CHUNK_SIZE, 'chunk1');
    const asr1 = await callASR(buf1, 'test_chunk1.mp3', API_KEYS[0], 'chunk1');
    const t1Total = ((Date.now() - t1Start) / 1000).toFixed(2);
    console.log(`  ⏱️ 单块总耗时: ${t1Total}s (ffmpeg=${buf1 ? '✅' : '❌'}, ASR=${asr1.elapsed}s)\n`);

    // ========== 测试 2: 4 路并行（模拟插件实际运行） ==========
    console.log('========== 测试 2: 4 路并行（2 Key × 2，同时提取+上传+转写）==========');
    
    // 先提取所有 4 块的音频
    console.log('  📦 正在提取 4 块音频...');
    const extractStart = Date.now();
    const audioChunks = [];
    for (let i = 0; i < 4; i++) {
        audioChunks.push(extractAudio(i * CHUNK_SIZE, CHUNK_SIZE, `p${i}`));
    }
    const extractTotal = ((Date.now() - extractStart) / 1000).toFixed(2);
    console.log(`  📦 4 块音频提取总耗时: ${extractTotal}s\n`);

    // 并行上传+转写
    console.log('  ☁️ 正在并行上传 4 块到 ASR...');
    const parStart = Date.now();
    const promises = audioChunks.map((ac, i) => 
        callASR(ac.buffer, `test_p${i}.mp3`, API_KEYS[i % API_KEYS.length], `p${i}`)
    );
    const results = await Promise.all(promises);
    const parTotal = ((Date.now() - parStart) / 1000).toFixed(2);
    
    console.log(`\n  ⏱️ 4 路并行 ASR 总耗时: ${parTotal}s`);
    console.log(`  📊 各块耗时: ${results.map((r, i) => `p${i}=${r.elapsed}s`).join(', ')}\n`);

    // ========== 结论 ==========
    console.log('========== 结论 ==========');
    console.log(`单块流程: ${t1Total}s (ffmpeg + ASR ${asr1.elapsed}s)`);
    console.log(`4 路并行 ASR: ${parTotal}s`);
    console.log(`4 块串行 ASR 预估: ${(asr1.elapsed * 4).toFixed(1)}s`);
    console.log(`加速比: ${(asr1.elapsed * 4 / parseFloat(parTotal)).toFixed(2)}x`);
    
    if (parseFloat(parTotal) < asr1.elapsed * 1.5) {
        console.log('✅ 并行有效，4 路并行耗时接近单块耗时');
    } else {
        console.log('⚠️ 并行效果有限，可能存在瓶颈');
    }

    // 清理
    cleanup([...audioChunks.map(a => a.file), file1]);
}

main().catch(console.error);
