/**
 * ASR 单块耗时详细测试
 * 测量：ffmpeg提取 → 上传 → 等待转写 的每一步耗时
 */
const { execFileSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

const dataJson = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'data.json'), 'utf8'
));
const API_KEY = dataJson.asrApiKey1;
const BASE_URL = dataJson.asrBaseUrl || 'https://api.siliconflow.cn/v1/audio/transcriptions';
const MODEL = dataJson.asrModel || 'TeleAI/TeleSpeechASR';

const VIDEO_FILE = 'E:\\Obsidian_Hub\\Quick Mark\\Z_27政治\\01.考点串讲-马原\\01.导论.mp4';
const FFMPEG = path.join(__dirname, '..', 'ffmpeg.exe');
const CHUNK_SIZE = 600; // 10 分钟

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
            parts.push(Buffer.from(
                `Content-Disposition: form-data; name="${field.name}"; filename="${field.value.filename}"${CRLF}` +
                `Content-Type: audio/mpeg${CRLF}${CRLF}`
            ));
            parts.push(field.value.buffer);
            parts.push(Buffer.from(CRLF));
        }
    }
    parts.push(Buffer.from(`--${boundary}--${CRLF}`));
    return Buffer.concat(parts);
}

function uploadASR(buffer, filename) {
    return new Promise((resolve, reject) => {
        const boundary = generateBoundary();
        const body = buildMultipartBody([
            { name: 'file', value: { buffer, filename } },
            { name: 'model', value: MODEL },
            { name: 'response_format', value: 'verbose_json' },
            { name: 'timestamp_granularities[]', value: 'segment' },
        ], boundary);

        const parsedUrl = new URL(BASE_URL);
        const t0 = Date.now();
        let tUpload = 0;
        let tResponse = 0;

        const req = https.request({
            hostname: parsedUrl.hostname,
            port: 443,
            path: parsedUrl.pathname,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length,
            },
            agent: new https.Agent({ keepAlive: true, rejectUnauthorized: true }),
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                tResponse = Date.now();
                const raw = Buffer.concat(chunks).toString('utf-8');
                try {
                    const json = JSON.parse(raw);
                    resolve({ json, t0, tUpload, tResponse, bodyLength: body.length });
                } catch (e) {
                    reject(new Error(`JSON parse failed: ${e.message}. Body: ${raw.substring(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(1_800_000, () => req.destroy(new Error('Timeout')));

        // 分块写入以测量上传时间
        const CHUNK_WRITE = 64 * 1024;
        let offset = 0;
        const writeNext = () => {
            let canContinue = true;
            while (canContinue && offset < body.length) {
                const end = Math.min(offset + CHUNK_WRITE, body.length);
                canContinue = req.write(body.subarray(offset, end));
                offset = end;
            }
            if (offset < body.length) {
                req.once('drain', writeNext);
            } else {
                tUpload = Date.now();
                req.end();
            }
        };
        writeNext();
    });
}

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('📊 ASR 单块耗时详细测试');
    console.log('═══════════════════════════════════════════');
    console.log(`🎬 视频: ${VIDEO_FILE}`);
    console.log(`🎵 模型: ${MODEL}`);
    console.log(`⏱️ 分块: 0-${CHUNK_SIZE}s (${CHUNK_SIZE/60}分钟)\n`);

    // 1. FFmpeg 提取音频
    const t0 = Date.now();
    const tmpFile = path.join(__dirname, 'test_timing_chunk.mp3');
    console.log('1️⃣  FFmpeg 提取音频...');
    execFileSync(FFMPEG, [
        '-ss', '0', '-t', String(CHUNK_SIZE),
        '-i', VIDEO_FILE,
        '-vn', '-acodec', 'libmp3lame', '-q:a', '4', '-f', 'mp3',
        '-y', tmpFile
    ], { stdio: 'pipe' });
    const t1 = Date.now();
    const fileSize = fs.statSync(tmpFile).size;
    console.log(`   ✅ 完成: ${t1 - t0}ms | 文件大小: ${(fileSize / 1024 / 1024).toFixed(1)}MB`);

    // 2. 上传到 ASR
    console.log('2️⃣  上传到 ASR + 等待转写...');
    const buffer = fs.readFileSync(tmpFile);
    const result = await uploadASR(buffer, 'test_timing.mp3');
    const t2 = Date.now();

    console.log(`   ✅ 完成: ${t2 - t1}ms (总耗时)`);
    console.log(`   📤 上传耗时: ${(result.tUpload - result.t0)}ms`);
    console.log(`   ⏳ 服务端转写耗时: ${t2 - result.tUpload}ms`);
    console.log(`   📦 上传量: ${(result.bodyLength / 1024 / 1024).toFixed(1)}MB`);
    console.log(`   📝 转写文本长度: ${result.json.text?.length || 0} 字符`);
    console.log(`   🔢 segments: ${result.json.segments?.length || 0} 段`);

    const totalTime = t2 - t0;
    console.log(`\n═══════════════════════════════════════════`);
    console.log(`📊 总耗时: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}秒)`);
    console.log(`   FFmpeg: ${t1 - t0}ms (${((t1 - t0) / totalTime * 100).toFixed(1)}%)`);
    console.log(`   上传:   ${result.tUpload - result.t0}ms (${((result.tUpload - result.t0) / totalTime * 100).toFixed(1)}%)`);
    console.log(`   转写:   ${t2 - result.tUpload}ms (${((t2 - result.tUpload) / totalTime * 100).toFixed(1)}%)`);
    console.log(`═══════════════════════════════════════════`);

    // 清理
    try { fs.unlinkSync(tmpFile); } catch {}
}

main().catch(e => console.error('❌ Error:', e));
