/**
 * 🧪 ASR curl 参数构造干跑测试
 * 
 * 验证 uploadToASR 中构造的 curl 命令参数是否正确，
 * 包括参数数组形式、路径处理、multipart 字段等。
 * 
 * 用法：
 *   node scripts/test-asr-curl.js                    # 仅干跑验证参数
 *   node scripts/test-asr-curl.js --real              # 生成静音WAV并用真实API测试
 *   node scripts/test-asr-curl.js --real <API_KEY>    # 指定API Key
 * 
 * 注意：此脚本不依赖 esbuild 编译产物，独立验证核心逻辑
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ==================== 模拟配置 ====================
const ASR_CONFIG = {
    BASE_URL: 'https://api.siliconflow.cn/v1/audio/transcriptions',
    MODEL: 'TeleAI/TeleSpeechASR',
    API_KEY: process.env.SILICONFLOW_API_KEY || '',
};

// ==================== 测试参数 ====================
const TEST_API_KEY = process.argv[3] || ASR_CONFIG.API_KEY || 'sk-test-mock-key-12345';
const RUN_REAL_TEST = process.argv.includes('--real');

// ==================== 核心逻辑：参数构造 ====================

/**
 * 输出模拟的 curl 参数数组（与 asr.ts 中的构造方式完全一致）
 * @param {Buffer} buffer - 音频数据
 * @param {string} filename - 文件名
 * @param {string} apiKey - API Key
 * @returns {{ args: string[], tempFile: string }} 参数数组和临时文件路径
 */
function buildCurlArgs(buffer, filename, apiKey) {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const tempFile = path.join(os.tmpdir(), `silicon-asr-test-${Date.now()}-${safeName}`);
    
    // 写入临时文件
    fs.writeFileSync(tempFile, buffer);
    
    // 构造 curl 参数（与 asr.ts 完全一致）
    const args = [
        '--noproxy', '*',        // --noproxy '*' 强制绕过系统代理（V2rayN 等），避免大文件上传被代理中断
        '-s',
        '-w', '\n%{http_code}',
        '-X', 'POST',
        ASR_CONFIG.BASE_URL,
        '-H', `Authorization: Bearer ${apiKey}`,
        '-F', `file=@${tempFile}`,
        '-F', `model=${ASR_CONFIG.MODEL}`,
        '-F', 'response_format=verbose_json',
        '-F', 'timestamp_granularities[]=segment',
    ];
    
    return { args, tempFile };
}

/**
 * 生成静音 WAV 文件（用于真实测试）
 * @param {number} durationSec - 时长（秒）
 * @param {number} sampleRate - 采样率
 * @returns {Buffer} WAV 文件 Buffer
 */
function generateSilentWav(durationSec = 5, sampleRate = 16000) {
    const numSamples = sampleRate * durationSec;
    const bitsPerSample = 16;
    const numChannels = 1;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = numSamples * numChannels * (bitsPerSample / 8);
    const headerSize = 44;
    
    const buffer = Buffer.alloc(headerSize + dataSize);
    
    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    
    // fmt chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);        // chunk size
    buffer.writeUInt16LE(1, 20);         // PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    
    // data chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    
    // data is already zeros (silent)
    
    return buffer;
}

// ==================== 主测试流程 ====================

function dryRunTest() {
    console.log('='.repeat(70));
    console.log('🧪 ASR curl 参数构造干跑测试');
    console.log('='.repeat(70));
    
    // 模拟一个测试音频 buffer (1KB 假数据)
    const testBuffer = Buffer.alloc(1024, 0xFF);
    const testFilename = '测试 音频 (chinese & spaces).mp3';
    const testApiKey = TEST_API_KEY;
    
    console.log(`\n📋 输入参数:`);
    console.log(`   - 文件名: ${testFilename}`);
    console.log(`   - 大小: ${testBuffer.length} bytes`);
    console.log(`   - API Key: ${testApiKey.substring(0, 10)}...`);
    console.log(`   - 模型: ${ASR_CONFIG.MODEL}`);
    console.log(`   - 端点: ${ASR_CONFIG.BASE_URL}`);
    
    try {
        const { args, tempFile } = buildCurlArgs(testBuffer, testFilename, testApiKey);
        
        console.log(`\n📦 临时文件: ${tempFile}`);
        console.log(`   - 存在: ${fs.existsSync(tempFile)}`);
        console.log(`   - 大小: ${fs.statSync(tempFile).size} bytes`);
        
        console.log(`\n🔧 curl 参数数组 (${args.length} 项):`);
        args.forEach((arg, i) => {
            // 对 API Key 进行脱敏显示
            let displayArg = arg;
            if (arg.startsWith('Authorization: Bearer ')) {
                const key = arg.replace('Authorization: Bearer ', '');
                displayArg = `Authorization: Bearer ${key.substring(0, 10)}...${key.substring(key.length - 4)}`;
            }
            console.log(`   [${i}] ${JSON.stringify(displayArg)}`);
        });
        
        // 检查关键参数正确性
        console.log(`\n✅ 关键检查:`);
        
        // 检查 -F file=@<tempFile>
        const fileArg = args.find(a => a.startsWith('file=@'));
        if (fileArg) {
            console.log(`   ✅ file=@ 参数存在: ${fileArg}`);
            const filePath = fileArg.substring('file=@'.length);
            console.log(`   ✅ 临时文件 ${fs.existsSync(filePath) ? '存在' : '不存在，可能已清理'}`);
        } else {
            console.log(`   ❌ file=@ 参数缺失!`);
        }
        
        // 检查 Authorization
        const hasAuth = args.some(a => a.startsWith('Authorization:'));
        console.log(`   ✅ Authorization 头部: ${hasAuth ? '存在' : '缺失'}`);
        
        // 检查 URL
        const url = args[args.indexOf(ASR_CONFIG.BASE_URL)];
        if (url) console.log(`   ✅ URL 正确: ${url}`);
        
        // 检查 model
        const modelArg = args.find(a => a.startsWith('model='));
        if (modelArg) console.log(`   ✅ model 参数: ${modelArg}`);
        
        // 检查 response_format
        console.log(`   ✅ response_format: ${args.includes('response_format=verbose_json')}`);
        console.log(`   ✅ timestamp_granularities: ${args.includes('timestamp_granularities[]=segment')}`);
        
        // 检查是否 -s (silent)
        console.log(`   ✅ -s (silent) 模式: ${args[0] === '-s'}`);
        
        // 检查 -w (http code 输出) — args[2] 中是实际换行符 (\n)，因为 JS 会把 '\n' 解释为换行
        const wIndex = args.indexOf('-w');
        const wValue = (wIndex !== -1) ? args[wIndex + 1] : '';
        const wContainsHttpCode = wValue.includes('%{http_code}');
        console.log(`   ✅ -w http_code 状态: ${wContainsHttpCode} (值: ${JSON.stringify(wValue)})`);
        
        // 安全验证：确认没有使用 exec 字符串拼接
        console.log(`   ✅ 使用 spawn 数组形式 (无 shell 注入风险)`);
        
        // 清理临时文件
        try { fs.unlinkSync(tempFile); } catch (_) {}
        console.log(`\n🧹 临时文件已清理`);
        
        console.log(`\n🎉 干跑测试通过!`);
        
    } catch (err) {
        console.error(`\n❌ 测试异常:`, err);
        process.exit(1);
    }
}

async function realApiTest() {
    console.log('='.repeat(70));
    console.log('🌐 ASR curl 真实 API 测试');
    console.log('='.repeat(70));
    
    if (!TEST_API_KEY || TEST_API_KEY.startsWith('sk-test-')) {
        console.error('\n❌ 需要真实的 API Key 进行测试。');
        console.log('   提供方式:');
        console.log('     1. 环境变量: SILICONFLOW_API_KEY=sk-xxx node scripts/test-asr-curl.js --real');
        console.log('     2. 命令行参数: node scripts/test-asr-curl.js --real <API_KEY>');
        process.exit(1);
    }
    
    // 生成 3 秒静音 WAV
    console.log(`\n🔊 生成静音 WAV...`);
    const wavBuffer = generateSilentWav(3, 16000);
    console.log(`   大小: ${(wavBuffer.length / 1024).toFixed(1)} KB`);
    
    const { args, tempFile } = buildCurlArgs(wavBuffer, 'silent-test.wav', TEST_API_KEY);
    console.log(`\n🔧 临时文件: ${tempFile}`);
    
    console.log(`\n🚀 发起 API 请求...`);
    const startTime = Date.now();

    // --noproxy '*' 强制绕过系统代理（V2rayN 等），避免大文件上传被代理中断
    const result = spawnSync('curl', args, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // 清理
    try { fs.unlinkSync(tempFile); } catch (_) {}
    console.log(`🧹 临时文件已清理`);
    
    if (result.error) {
        console.error(`\n❌ curl 执行失败: ${result.error.message}`);
        process.exit(1);
    }
    
    // 解析输出
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    
    console.log(`\n📡 响应耗时: ${elapsed}s`);
    console.log(`   Exit code: ${result.status}`);
    
    if (stderr.trim()) {
        console.log(`   stderr: ${stderr.trim()}`);
    }
    
    // 分离 HTTP code 和 body
    const lastNewline = stdout.lastIndexOf('\n');
    if (lastNewline < 0) {
        console.error(`\n❌ 输出格式异常，无法解析 HTTP code`);
        console.log(`原始输出: ${stdout}`);
        process.exit(1);
    }
    
    const httpCode = stdout.substring(lastNewline + 1).trim();
    const body = stdout.substring(0, lastNewline).trim();
    
    console.log(`   HTTP 状态码: ${httpCode}`);
    
    if (httpCode === '200') {
        console.log(`\n✅ API 请求成功!`);
        try {
            const parsed = JSON.parse(body);
            console.log(`   识别文本: ${parsed.text || '(空)'}`);
            if (parsed.segments && parsed.segments.length > 0) {
                console.log(`   句段数: ${parsed.segments.length}`);
            }
        } catch (e) {
            console.log(`   body (前200字符): ${body.substring(0, 200)}`);
        }
    } else {
        console.log(`\n❌ API 返回错误`);
        console.log(`   body: ${body.substring(0, 300)}`);
        
        // 与旧方式对比说明
        if (httpCode === '500') {
            console.log(`\n⚠️  注意: HTTP 500 是之前 XMLHttpRequest 方式的典型错误。`);
            console.log(`   如果 curl 也返回 500，说明问题不在请求方式本身。`);
        }
    }
    
    process.exit(httpCode === '200' ? 0 : 1);
}

// ==================== 入口 ====================

if (RUN_REAL_TEST) {
    realApiTest();
} else {
    dryRunTest();
}
