"use strict";
/**
 * 🌐 HTTP 直连工具模块
 *
 * 功能：使用 Node.js 内置 http/https 模块发起 HTTP 请求，
 * 绕过系统代理（V2rayN 等全局代理），直连目标服务器。
 *
 * 支持两种响应模式：
 *   1. 缓冲模式（默认）：等待整个响应结束，返回完整 text/json
 *   2. SSE 流式模式：通过 onSSEData 回调逐行实时推送，收到 [DONE] 即 resolve
 *
 * 超时保护（三层）：
 *   - 首字节超时：连接建立后多久没收到第一个字节
 *   - 无数据超时：两个 chunk 之间最长间隔
 *   - 硬性总超时：无论如何到时间就杀
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestDirect = requestDirect;
// Node.js 内置模块（延迟加载，避免 esbuild 打包）
// @ts-ignore
const http = require('http');
// @ts-ignore
const https = require('https');
// @ts-ignore
const zlib = require('zlib');
// @ts-ignore
const { URL } = require('url');
/**
 * 暂存并清空代理环境变量，执行完毕后恢复。
 * 确保在请求期间系统代理设置不会劫持连接。
 */
function withClearedProxyEnv(fn) {
    const saved = {};
    const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'];
    for (const key of proxyVars) {
        saved[key] = process.env[key];
        delete process.env[key];
    }
    try {
        return fn();
    }
    finally {
        for (const key of proxyVars) {
            if (saved[key] !== undefined) {
                process.env[key] = saved[key];
            }
        }
    }
}
/**
 * 绕过系统代理的 HTTP 请求
 * 使用 Node.js 原生 http/https 模块，不受 Electron net stack 影响
 */
async function requestDirect(options) {
    return withClearedProxyEnv(() => requestDirectInternal(options, 0));
}
/**
 * 内部递归实现（处理重定向跟踪）
 */
async function requestDirectInternal(options, redirectCount) {
    const MAX_REDIRECTS = 5;
    if (redirectCount > MAX_REDIRECTS) {
        throw new Error(`重定向次数过多 (最多 ${MAX_REDIRECTS} 次): ${options.url}`);
    }
    const parsedUrl = new URL(options.url);
    const isHttps = parsedUrl.protocol === 'https:';
    const mod = isHttps ? https : http;
    const timeoutMs = options.timeoutMs ?? 1800000;
    const firstByteTimeoutMs = options.firstByteTimeoutMs ?? 60000;
    const idleTimeoutMs = options.idleTimeoutMs ?? 120000;
    // 构建请求选项——不设置任何 proxy agent，使用纯 Node Agent 直连
    const requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: {
            ...(options.headers || {}),
            'Accept-Encoding': 'gzip, deflate, br',
        },
        // 创建不带代理的纯 Agent
        agent: new (isHttps ? https.Agent : http.Agent)({
            keepAlive: true,
            rejectUnauthorized: true,
        }),
    };
    // 处理请求体
    let bodyBuffer = null;
    if (options.body) {
        if (typeof options.body === 'string') {
            bodyBuffer = Buffer.from(options.body, 'utf-8');
        }
        else if (options.body instanceof ArrayBuffer) {
            bodyBuffer = Buffer.from(new Uint8Array(options.body));
        }
        else if (options.body instanceof Uint8Array) {
            bodyBuffer = Buffer.from(options.body);
        }
        if (bodyBuffer) {
            if (!requestOptions.headers['Content-Type']) {
                requestOptions.headers['Content-Type'] = 'application/octet-stream';
            }
            requestOptions.headers['Content-Length'] = bodyBuffer.length.toString();
        }
    }
    // 定时器引用
    let hardTimer = null;
    let firstByteTimer = null;
    let idleTimer = null;
    let settled = false;
    function clearAllTimers() {
        if (hardTimer) {
            clearTimeout(hardTimer);
            hardTimer = null;
        }
        if (firstByteTimer) {
            clearTimeout(firstByteTimer);
            firstByteTimer = null;
        }
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
    }
    return new Promise((resolve, reject) => {
        let req;
        function fail(err) {
            if (settled)
                return;
            settled = true;
            clearAllTimers();
            try {
                if (req)
                    req.destroy();
            }
            catch { }
            reject(err);
        }
        // 1. 硬性总超时：无论 socket 是否活跃，到时间就 destroy
        hardTimer = setTimeout(() => {
            fail(new Error(`请求硬性超时 (${timeoutMs}ms): ${options.url}`));
        }, timeoutMs);
        req = mod.request(requestOptions, (res) => {
            const statusCode = res.statusCode || 0;
            // 处理 3xx 重定向（手动跟随）
            if (statusCode >= 300 && statusCode < 400) {
                const location = res.headers['location'];
                if (location) {
                    res.resume();
                    const redirectUrl = new URL(location, options.url).href;
                    clearAllTimers();
                    settled = true;
                    resolve(requestDirectInternal({ ...options, url: redirectUrl }, redirectCount + 1));
                    return;
                }
            }
            // 检测是否为 SSE 流式响应
            const contentType = (res.headers['content-type'] || '').toLowerCase();
            const isSSE = contentType.includes('text/event-stream');
            const useSSECallback = isSSE && typeof options.onSSEData === 'function';
            if (useSSECallback) {
                // ===== SSE 流式模式：逐行实时处理 =====
                // 2. 首字节超时：连接建立后多久没收到第一个 data chunk
                firstByteTimer = setTimeout(() => {
                    fail(new Error(`首字节超时 (${firstByteTimeoutMs}ms): 服务器未返回任何数据: ${options.url}`));
                }, firstByteTimeoutMs);
                // 3. 无数据超时：两个 chunk 之间最长间隔
                function resetIdleTimer() {
                    if (idleTimer)
                        clearTimeout(idleTimer);
                    idleTimer = setTimeout(() => {
                        fail(new Error(`无数据超时 (${idleTimeoutMs}ms): 服务器停止发送数据: ${options.url}`));
                    }, idleTimeoutMs);
                }
                let sseBuffer = '';
                let fullText = ''; // 同时保留完整文本用于日志
                let gotFirstByte = false;
                let sseDone = false;
                // 用于解压的 zlib 句柄（SSE 通常不压缩，但以防万一）
                let decompressor = null;
                const contentEncoding = (res.headers['content-encoding'] || '').toLowerCase();
                if (contentEncoding.includes('gzip')) {
                    decompressor = zlib.createGunzip();
                }
                else if (contentEncoding.includes('deflate')) {
                    decompressor = zlib.createInflate();
                }
                else if (contentEncoding.includes('br')) {
                    decompressor = zlib.createBrotliDecompress();
                }
                function processChunk(chunkStr) {
                    if (sseDone)
                        return;
                    sseBuffer += chunkStr;
                    // 按换行符分割，处理完整的行
                    const lines = sseBuffer.split('\n');
                    // 最后一段可能不完整，保留在 buffer 中
                    sseBuffer = lines.pop() || '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed === '')
                            continue;
                        if (!trimmed.startsWith('data:'))
                            continue;
                        const data = trimmed.slice(5).trim();
                        fullText += line + '\n';
                        if (data === '[DONE]') {
                            // SSE 流结束
                            sseDone = true;
                            clearAllTimers();
                            settled = true;
                            // 构建响应头
                            const responseHeaders = {};
                            for (const [key, value] of Object.entries(res.headers)) {
                                if (Array.isArray(value)) {
                                    responseHeaders[key] = value.join(', ');
                                }
                                else if (value !== undefined) {
                                    responseHeaders[key] = String(value);
                                }
                            }
                            const arrayBuffer = new Uint8Array(Buffer.from(fullText, 'utf-8')).buffer;
                            resolve({
                                status: statusCode,
                                headers: responseHeaders,
                                text: fullText,
                                arrayBuffer,
                                json: null,
                            });
                            return;
                        }
                        // 推送给回调
                        try {
                            options.onSSEData(data);
                        }
                        catch (e) {
                            console.warn('[http-direct] SSE 回调异常:', e);
                        }
                    }
                }
                if (decompressor) {
                    decompressor.on('data', (data) => {
                        processChunk(data.toString('utf-8'));
                    });
                    decompressor.on('error', () => {
                        // 解压失败，忽略
                    });
                    res.on('data', (chunk) => {
                        if (settled)
                            return;
                        if (!gotFirstByte) {
                            gotFirstByte = true;
                            if (firstByteTimer) {
                                clearTimeout(firstByteTimer);
                                firstByteTimer = null;
                            }
                        }
                        resetIdleTimer();
                        try {
                            decompressor.write(chunk);
                        }
                        catch { }
                    });
                }
                else {
                    res.on('data', (chunk) => {
                        if (settled)
                            return;
                        if (!gotFirstByte) {
                            gotFirstByte = true;
                            if (firstByteTimer) {
                                clearTimeout(firstByteTimer);
                                firstByteTimer = null;
                            }
                        }
                        resetIdleTimer();
                        processChunk(chunk.toString('utf-8'));
                    });
                }
                res.on('end', () => {
                    if (settled)
                        return;
                    // 流正常结束但没收到 [DONE]，也用已收集的数据
                    settled = true;
                    clearAllTimers();
                    // 处理 buffer 中可能残留的最后一行
                    if (sseBuffer.trim().startsWith('data:')) {
                        const data = sseBuffer.trim().slice(5).trim();
                        if (data && data !== '[DONE]') {
                            fullText += sseBuffer + '\n';
                            try {
                                options.onSSEData(data);
                            }
                            catch { }
                        }
                    }
                    const responseHeaders = {};
                    for (const [key, value] of Object.entries(res.headers)) {
                        if (Array.isArray(value)) {
                            responseHeaders[key] = value.join(', ');
                        }
                        else if (value !== undefined) {
                            responseHeaders[key] = String(value);
                        }
                    }
                    const arrayBuffer = new Uint8Array(Buffer.from(fullText, 'utf-8')).buffer;
                    resolve({
                        status: statusCode,
                        headers: responseHeaders,
                        text: fullText,
                        arrayBuffer,
                        json: null,
                    });
                });
                res.on('error', (err) => {
                    fail(err);
                });
            }
            else {
                // ===== 缓冲模式：等待整个响应结束（原有逻辑）=====
                // 首字节超时也适用于缓冲模式
                firstByteTimer = setTimeout(() => {
                    fail(new Error(`首字节超时 (${firstByteTimeoutMs}ms): 服务器未返回任何数据: ${options.url}`));
                }, firstByteTimeoutMs);
                function resetIdleTimerBuf() {
                    if (idleTimer)
                        clearTimeout(idleTimer);
                    idleTimer = setTimeout(() => {
                        fail(new Error(`无数据超时 (${idleTimeoutMs}ms): 服务器停止发送数据: ${options.url}`));
                    }, idleTimeoutMs);
                }
                const chunks = [];
                let gotFirstByte = false;
                // 用于解压的 zlib 句柄
                let decompressor = null;
                const contentEncoding = (res.headers['content-encoding'] || '').toLowerCase();
                if (contentEncoding.includes('gzip')) {
                    decompressor = zlib.createGunzip();
                }
                else if (contentEncoding.includes('deflate')) {
                    decompressor = zlib.createInflate();
                }
                else if (contentEncoding.includes('br')) {
                    decompressor = zlib.createBrotliDecompress();
                }
                if (decompressor) {
                    decompressor.on('data', (data) => {
                        if (!gotFirstByte) {
                            gotFirstByte = true;
                            if (firstByteTimer) {
                                clearTimeout(firstByteTimer);
                                firstByteTimer = null;
                            }
                        }
                        resetIdleTimerBuf();
                        chunks.push(data);
                    });
                    decompressor.on('end', () => {
                        if (settled)
                            return;
                        settled = true;
                        clearAllTimers();
                        finishBufferedResponse(statusCode, res.headers, chunks, resolve, reject);
                    });
                    decompressor.on('error', () => {
                        // 解压失败则使用原始数据
                    });
                    res.on('data', (chunk) => {
                        if (settled)
                            return;
                        if (!gotFirstByte) {
                            gotFirstByte = true;
                            if (firstByteTimer) {
                                clearTimeout(firstByteTimer);
                                firstByteTimer = null;
                            }
                        }
                        resetIdleTimerBuf();
                        try {
                            decompressor.write(chunk);
                        }
                        catch { }
                    });
                    res.on('end', () => {
                        if (settled)
                            return;
                        try {
                            decompressor.end();
                        }
                        catch {
                            // 如果 decompressor 已经坏了，直接用原始 chunks
                            if (settled)
                                return;
                            settled = true;
                            clearAllTimers();
                            finishBufferedResponse(statusCode, res.headers, chunks, resolve, reject);
                        }
                    });
                }
                else {
                    res.on('data', (chunk) => {
                        if (settled)
                            return;
                        if (!gotFirstByte) {
                            gotFirstByte = true;
                            if (firstByteTimer) {
                                clearTimeout(firstByteTimer);
                                firstByteTimer = null;
                            }
                        }
                        resetIdleTimerBuf();
                        chunks.push(chunk);
                    });
                    res.on('end', () => {
                        if (settled)
                            return;
                        settled = true;
                        clearAllTimers();
                        finishBufferedResponse(statusCode, res.headers, chunks, resolve, reject);
                    });
                }
                res.on('error', (err) => {
                    fail(err);
                });
            }
        });
        req.on('error', (err) => {
            fail(err);
        });
        // 发送请求体
        if (bodyBuffer) {
            req.write(bodyBuffer);
        }
        req.end();
    });
}
/**
 * 缓冲模式：处理完整的响应数据
 */
function finishBufferedResponse(statusCode, rawHeaders, chunks, resolve, reject) {
    try {
        const rawBuffer = Buffer.concat(chunks);
        const text = rawBuffer.toString('utf-8');
        // 构建响应头（扁平化）
        const responseHeaders = {};
        for (const [key, value] of Object.entries(rawHeaders)) {
            if (Array.isArray(value)) {
                responseHeaders[key] = value.join(', ');
            }
            else if (value !== undefined) {
                responseHeaders[key] = String(value);
            }
        }
        const arrayBuffer = new Uint8Array(rawBuffer).buffer;
        // 预解析 JSON
        let json = undefined;
        try {
            json = JSON.parse(text);
        }
        catch {
            json = null;
        }
        resolve({
            status: statusCode,
            headers: responseHeaders,
            text,
            arrayBuffer,
            json,
        });
    }
    catch (err) {
        reject(err);
    }
}
// ===== 自测代码（仅当直接通过 node 运行时执行） =====
if (require.main === module) {
    const testUrl = process.argv[2] || 'https://httpbin.org/ip';
    console.log(`🌐 HTTP 直连自测: ${testUrl}`);
    console.log(`📋 代理环境变量:`);
    console.log(`   HTTP_PROXY=${process.env.HTTP_PROXY || '(无)'}`);
    console.log(`   HTTPS_PROXY=${process.env.HTTPS_PROXY || '(无)'}`);
    console.log(`   ALL_PROXY=${process.env.ALL_PROXY || '(无)'}`);
    requestDirect({ url: testUrl })
        .then(res => {
        console.log(`\n📊 状态码: ${res.status}`);
        console.log(`📦 响应体:`);
        console.log(JSON.stringify(res.json, null, 2));
        console.log(`\n✅ 直连成功！请求已绕过系统代理。`);
        process.exit(0);
    })
        .catch(err => {
        console.error(`\n❌ 直连失败: ${err.message}`);
        process.exit(1);
    });
}
