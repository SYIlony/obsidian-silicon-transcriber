/**
 * 🎙️ ASR 语音识别模块
 * 处理音频上传和语音转文字
 * 
 * 实现方式：使用 Node.js 原生 https 模块直接发送 multipart/form-data 请求
 * - 绕过 XMLHttpRequest/Electron net stack（SiliconFlow ASR 会拒绝浏览器 multipart 请求 HTTP 500）
 * - 绕过系统代理（V2rayN 等），直连目标服务器
 * - 直接从内存 Buffer 构建 multipart body，无需写临时文件
 * - 支持上传进度反馈（基于已发送字节数）
 */

import { Notice } from 'obsidian';
import { ASR_CONFIG } from './config';
import { ASRResponse } from './types';

/**
 * 生成 multipart/form-data 的 boundary 字符串
 */
function generateBoundary(): string {
    return `----SiliconASR${Date.now()}${Math.random().toString(16).slice(2)}`;
}

/**
 * 构建 multipart/form-data 请求体（返回 Buffer）
 * 
 * @param fields 表单字段（键值对，值可以是字符串用于普通字段，或 { buffer, filename } 用于文件字段）
 * @param boundary multipart boundary 字符串
 * @returns 完整的 multipart body Buffer
 */
function buildMultipartBody(
    fields: Array<{ name: string; value: string | { buffer: Buffer; filename: string } }>,
    boundary: string
): Buffer {
    const parts: Buffer[] = [];
    const CRLF = '\r\n';

    for (const field of fields) {
        // 每个字段以 --boundary 开头
        parts.push(Buffer.from(`--${boundary}${CRLF}`));

        if (typeof field.value === 'string') {
            // 普通文本字段
            parts.push(Buffer.from(
                `Content-Disposition: form-data; name="${field.name}"${CRLF}${CRLF}`
            ));
            parts.push(Buffer.from(field.value));
            parts.push(Buffer.from(CRLF));
        } else {
            // 文件字段
            const { buffer, filename } = field.value;
            parts.push(Buffer.from(
                `Content-Disposition: form-data; name="${field.name}"; filename="${filename}"${CRLF}` +
                `Content-Type: audio/mpeg${CRLF}${CRLF}`
            ));
            parts.push(buffer);
            parts.push(Buffer.from(CRLF));
        }
    }

    // 结束标记
    parts.push(Buffer.from(`--${boundary}--${CRLF}`));

    return Buffer.concat(parts);
}

/**
 * 暂存并清空代理环境变量，执行完毕后恢复。
 * 确保在请求期间系统代理设置不会劫持连接。
 */
function withClearedProxyEnv<T>(fn: () => T): T {
    // @ts-ignore
    const saved: Record<string, string | undefined> = {};
    const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'];
    for (const key of proxyVars) {
        // @ts-ignore
        saved[key] = process.env[key];
        // @ts-ignore
        delete process.env[key];
    }
    try {
        return fn();
    } finally {
        for (const key of proxyVars) {
            if (saved[key] !== undefined) {
                // @ts-ignore
                process.env[key] = saved[key];
            }
        }
    }
}

/**
 * 上传音频到 SiliconFlow ASR API 进行转写
 * 
 * 使用 Node.js 原生 https 模块直接发送 multipart/form-data 请求：
 * - 不经过 XMLHttpRequest/Electron net stack（避免 SiliconFlow HTTP 500）
 * - 不经过系统代理（避免 V2rayN 等代理中断大文件上传）
 * - 直接从内存 Buffer 上传（无需写临时文件到磁盘）
 * - 实时显示上传进度百分比
 * 
 * @param buffer 音频数据 Buffer
 * @param filename 文件名
 * @param notice 进度通知对象
 * @param prefix 进度前缀
 * @param apiKey 可选的指定的 API Key，如果不传则默认第一个
 * @returns ASR 响应数据
 */
export function uploadToASR(
    buffer: Buffer,
    filename: string,
    notice: Notice,
    prefix: string,
    apiKey?: string
): Promise<ASRResponse> {
    return withClearedProxyEnv(() => new Promise<ASRResponse>((resolve, reject) => {
        // 延迟加载 Node.js 内置模块，避免 esbuild 尝试打包它们
        // @ts-ignore - Node.js modules not available in browser type context
        const https = require('https');
        // @ts-ignore
        const http = require('http');
        // @ts-ignore
        const zlib = require('zlib');
        // @ts-ignore
        const { URL } = require('url');

        // 1. 获取 API Key
        const token = apiKey || ASR_CONFIG.API_KEY || (ASR_CONFIG.API_KEYS && ASR_CONFIG.API_KEYS[0]);
        if (!token) {
            reject(new Error('No API key configured for ASR'));
            return;
        }

        // 2. 构建 multipart/form-data 请求体
        const boundary = generateBoundary();
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

        const fields: Array<{ name: string; value: string | { buffer: Buffer; filename: string } }> = [
            { name: 'file', value: { buffer, filename: safeName } },
            { name: 'model', value: ASR_CONFIG.MODEL },
            { name: 'response_format', value: 'verbose_json' },
            { name: 'timestamp_granularities[]', value: 'segment' },
        ];

        const bodyBuffer = buildMultipartBody(fields, boundary);
        const totalBytes = bodyBuffer.length;

        // 3. 解析 URL 构建请求选项
        const parsedUrl = new URL(ASR_CONFIG.BASE_URL);
        const isHttps = parsedUrl.protocol === 'https:';
        const mod = isHttps ? https : http;

        const requestOptions: any = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': totalBytes.toString(),
                'Accept-Encoding': 'gzip, deflate, br',
            },
            // 创建不带代理的纯 Agent，直连目标服务器
            agent: new (isHttps ? https.Agent : http.Agent)({
                keepAlive: true,
                rejectUnauthorized: true,
            }),
        };

        // 4. 启动请求
        const req = mod.request(requestOptions, (res: any) => {
            const statusCode = res.statusCode || 0;

            // 收集响应数据
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));

            res.on('end', () => {
                try {
                    const rawBuffer = Buffer.concat(chunks);

                    // 根据 Content-Encoding 解压
                    const contentEncoding: string = (res.headers['content-encoding'] || '') as string;
                    let decompressed: Buffer;
                    try {
                        if (contentEncoding.includes('gzip')) {
                            decompressed = zlib.gunzipSync(rawBuffer);
                        } else if (contentEncoding.includes('deflate')) {
                            decompressed = zlib.inflateSync(rawBuffer);
                        } else if (contentEncoding.includes('br')) {
                            decompressed = zlib.brotliDecompressSync(rawBuffer);
                        } else {
                            decompressed = rawBuffer;
                        }
                    } catch {
                        decompressed = rawBuffer;
                    }

                    const bodyText = decompressed.toString('utf-8');

                    if (statusCode !== 200) {
                        reject(new Error(`API Error: HTTP ${statusCode} - ${bodyText.substring(0, 500) || '(empty response)'}`));
                        return;
                    }

                    if (!bodyText.trim()) {
                        reject(new Error('API returned empty response with HTTP 200'));
                        return;
                    }

                    // 解析 JSON 响应
                    try {
                        const parsed: ASRResponse = JSON.parse(bodyText);
                        resolve(parsed);
                    } catch (e: any) {
                        reject(new Error(`Failed to parse ASR response JSON: ${e.message}. Body preview: ${bodyText.substring(0, 200)}`));
                    }
                } catch (err) {
                    reject(err);
                }
            });

            res.on('error', (err: Error) => reject(err));
        });

        req.on('error', (err: Error) => reject(err));

        // 超时处理（30 分钟，与 LLM 保持一致）
        req.setTimeout(1_800_000, () => {
            req.destroy(new Error(`ASR 上传超时 (30min): ${ASR_CONFIG.BASE_URL}`));
        });

        // 5. 分块写入请求体，实现上传进度反馈
        //    Node.js 的 req.write() 是异步的，背压通过 'drain' 事件处理
        const CHUNK_WRITE_SIZE = 64 * 1024; // 64KB per write
        let offset = 0;
        let lastProgressPercent = -1;

        const writeNextChunk = () => {
            let canContinue = true;

            while (canContinue && offset < totalBytes) {
                const end = Math.min(offset + CHUNK_WRITE_SIZE, totalBytes);
                const chunk = bodyBuffer.subarray(offset, end);
                canContinue = req.write(chunk);
                offset = end;

                // 更新进度（每 5% 更新一次 UI）
                const percent = Math.floor((offset / totalBytes) * 100);
                if (percent > lastProgressPercent && (percent % 5 === 0 || offset === totalBytes)) {
                    lastProgressPercent = percent;
                    notice.setMessage(`${prefix} ☁️ 上传中 ${percent}% (${(totalBytes / 1024 / 1024).toFixed(1)}MB)`);
                }
            }

            if (offset < totalBytes) {
                // 缓冲区满，等待 drain 事件后继续
                req.once('drain', writeNextChunk);
            } else {
                // 全部写入完成，结束请求
                notice.setMessage(`${prefix} ☁️ 上传完成，等待转写...`);
                req.end();
            }
        };

        // 开始写入
        writeNextChunk();
    }));
}
