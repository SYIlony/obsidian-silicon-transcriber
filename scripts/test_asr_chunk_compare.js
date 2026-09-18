/**
 * ASR 不同 chunk 大小耗时对比测试
 * 对同一段视频，分别提取 5min 和 10min chunk，上传 ASR 测耗时
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
        let tUploadEnd = 0;

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
                const tEnd = Date.now();
                const raw = Buffer.concat(chunks).toString('utf-8');
                try {
                    const json = JSON.parse(raw);
                    resolve({
                        json,
                        t0, tUploadEnd, tEnd,
                        uploadMs: tUploadEnd - t0,
                        serverMs: tEnd - tUploadEnd,
                        totalMs: tEnd - t0,
                        bodySize: body.length,
                    });
                } catch (e) {
                    reject(new Error(`JSON parse failed: ${e.message}. Body: ${raw.substring(0, 300)}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(1_800_000, () => req.destroy(new Error('Timeout')));

        // 分块写入
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
                tUploadEnd = Date.now();
                req.end();
            }
        };
        writeNext();
    });
}

async function testChunk(chunkStart, chunkDuration, label) {
    const tmpFile = path.join(__dirname, `test_cmp_${label}.mp3`);
    
    // 1. FFmpeg
    const t0 = Date.now();
    execFileSync(FFMPEG, [
        '-ss', String(chunkStart), '-t', String(chunkDuration),
        '-i', VIDEO_FILE,
        '-vn', '-acodec', 'libmp3lame', '-q:a', '4', '-f', 'mp3',
        '-y', tmpFile
    ], { stdio: 'pipe' });
    const tFfmpeg = Date.now() - t0;
    const fileSize = fs.statSync(tmpFile).size;
    
    // 2. ASR
    const buffer = fs.readFileSync(tmpFile);
    const result = await uploadASR(buffer, `test_${label}.mp3`);
    
    // 清理
    try { fs.unlinkSync(tmpFile); } catch {}
    
    const segments = result.json.segments || [];
    const textLen = result.json.text?.length || 0;
    
    return {
        label,
        chunkDuration,
        ffmpegMs: tFfmpeg,
        uploadMs: result.uploadMs,
        serverMs: result.serverMs,
        totalMs: result.totalMs,
        fileSize,
        textLen,
        segments: segments.length,
        // 取前3段和后3段看看质量
        firstSegs: segments.slice(0, 3).map(s => `[${s.start}s] ${s.text.substring(0, 60)}`),
        lastSegs: segments.slice(-3).map(s => `[${s.start}s] ${s.text.substring(0, 60)}`),
    };
}

async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('📊 ASR chunk 大小对比测试');
    console.log('═══════════════════════════════════════════════════\n');
    
    const results = [];
    
    // 测试 5 分钟 chunk
    console.log('🧪 测试 5min chunk (0-300s)...');
    const r5 = await testChunk(0, 300, '5min');
    results.push(r5);
    console.log(`   ✅ 总耗时: ${(r5.totalMs/1000).toFixed(1)}s | 转写: ${(r5.serverMs/1000).toFixed(1)}s | 文本: ${r5.textLen}字 | ${r5.segments}段\n`);
    
    // 测试 10 分钟 chunk
    console.log('🧪 测试 10min chunk (0-600s)...');
    const r10 = await testChunk(0, 600, '10min');
    results.push(r10);
    console.log(`   ✅ 总耗时: ${(r10.totalMs/1000).toFixed(1)}s | 转写: ${(r10.serverMs/1000).toFixed(1)}s | 文本: ${r10.textLen}字 | ${r10.segments}段\n`);
    
    // 测试 7 分钟 chunk
    console.log('🧪 测试 7min chunk (0-420s)...');
    const r7 = await testChunk(0, 420, '7min');
    results.push(r7);
    console.log(`   ✅ 总耗时: ${(r7.totalMs/1000).toFixed(1)}s | 转写: ${(r7.serverMs/1000).toFixed(1)}s | 文本: ${r7.textLen}字 | ${r7.segments}段\n`);
    
    // 汇总
    console.log('\n═══════════════════════════════════════════════════');
    console.log('📊 汇总对比');
    console.log('═══════════════════════════════════════════════════');
    console.log('Chunk   | FFmpeg  | 上传    | 服务端转写 | 总耗时  | 文件大小 | 文本长度 | 段数');
    console.log('--------|---------|---------|------------|---------|----------|----------|----');
    for (const r of results) {
        console.log(`${r.label.padEnd(7)} | ${(r.ffmpegMs/1000).toFixed(1)}s   | ${(r.uploadMs/1000).toFixed(1)}s    | ${(r.serverMs/1000).toFixed(1)}s      | ${(r.totalMs/1000).toFixed(1)}s  | ${(r.fileSize/1024/1024).toFixed(1)}MB  | ${r.textLen}字   | ${r.segments}`);
    }
    
    console.log('\n📋 质量检查（前3段）:');
    for (const r of results) {
        console.log(`\n  ${r.label}:`);
        r.firstSegs.forEach(s => console.log(`    ${s}`));
        console.log(`    ...`);
        r.lastSegs.forEach(s => console.log(`    ${s}`));
    }
    
    // 计算吞吐率
    console.log('\n📈 效率分析:');
    for (const r of results) {
        const duration = r.chunkDuration;
        const rate = duration / (r.serverMs / 1000); // 每秒处理多少秒音频
        console.log(`  ${r.label}: 处理 ${duration}s 音频花了 ${(r.serverMs/1000).toFixed(1)}s → 速率比 ${rate.toFixed(2)}x (${(rate*100).toFixed(0)}% 实时速度)`);
    }
}

main().catch(e => console.error('❌ Error:', e));
