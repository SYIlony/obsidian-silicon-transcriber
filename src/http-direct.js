"use strict";
/**
 * 🌐 HTTP 直连工具模块
 *
 * 功能：使用 Node.js 内置 http/https 模块发起 HTTP 请求，
 * 绕过系统代理（V2rayN 等全局代理），直连目标服务器。
 *
 * 完全兼容 Obsidian requestUrl 的返回结构，可无缝替换。
 *
 * 使用方式：
 *   import { requestDirect } from './http-direct';
 *   const resp = await requestDirect({ url: 'https://api.example.com', ... });
 *   console.log(resp.json.choices?.[0]?.message?.content);
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
function requestDirect(options) {
    return __awaiter(this, void 0, void 0, function* () {
        return withClearedProxyEnv(() => requestDirectInternal(options, 0));
    });
}
/**
 * 内部递归实现（处理重定向跟踪）
 */
function requestDirectInternal(options, redirectCount) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const MAX_REDIRECTS = 5;
        if (redirectCount > MAX_REDIRECTS) {
            throw new Error(`重定向次数过多 (最多 ${MAX_REDIRECTS} 次): ${options.url}`);
        }
        const parsedUrl = new URL(options.url);
        const isHttps = parsedUrl.protocol === 'https:';
        const mod = isHttps ? https : http;
        const timeoutMs = (_a = options.timeoutMs) !== null && _a !== void 0 ? _a : 1800000;
        // 构建请求选项——不设置任何 proxy agent，使用纯 Node Agent 直连
        const requestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: Object.assign(Object.assign({}, (options.headers || {})), { 'Accept-Encoding': 'gzip, deflate, br' }),
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
        return new Promise((resolve, reject) => {
            const req = mod.request(requestOptions, (res) => {
                const statusCode = res.statusCode || 0;
                // 处理 3xx 重定向（手动跟随）
                if (statusCode >= 300 && statusCode < 400) {
                    const location = res.headers['location'];
                    if (location) {
                        res.resume(); // 释放响应资源，避免内存泄漏
                        const redirectUrl = new URL(location, options.url).href;
                        resolve(requestDirectInternal(Object.assign(Object.assign({}, options), { url: redirectUrl }), redirectCount + 1));
                        return;
                    }
                }
                // 收集响应数据块
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    try {
                        const rawBuffer = Buffer.concat(chunks);
                        // 根据 Content-Encoding 解压（gzip / deflate / brotli）
                        const contentEncoding = (res.headers['content-encoding'] || '');
                        let decompressed;
                        try {
                            if (contentEncoding.includes('gzip')) {
                                decompressed = zlib.gunzipSync(rawBuffer);
                            }
                            else if (contentEncoding.includes('deflate')) {
                                decompressed = zlib.inflateSync(rawBuffer);
                            }
                            else if (contentEncoding.includes('br')) {
                                decompressed = zlib.brotliDecompressSync(rawBuffer);
                            }
                            else {
                                decompressed = rawBuffer;
                            }
                        }
                        catch (_a) {
                            // 解压失败则使用原始数据（不阻塞请求）
                            decompressed = rawBuffer;
                        }
                        // 构建响应头（扁平化）
                        const responseHeaders = {};
                        for (const [key, value] of Object.entries(res.headers)) {
                            if (Array.isArray(value)) {
                                responseHeaders[key] = value.join(', ');
                            }
                            else if (value !== undefined) {
                                responseHeaders[key] = String(value);
                            }
                        }
                        // 文本内容
                        const text = decompressed.toString('utf-8');
                        // ArrayBuffer（与 response 生命周期绑定）
                        const arrayBuffer = new Uint8Array(decompressed).buffer;
                        // 预解析 JSON（兼容 Obsidian requestUrl 的 .json 属性）
                        let json = undefined;
                        try {
                            json = JSON.parse(text);
                        }
                        catch (_b) {
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
                });
                res.on('error', (err) => reject(err));
            });
            req.on('error', (err) => reject(err));
            // 超时处理
            req.setTimeout(timeoutMs, () => {
                req.destroy(new Error(`请求超时 (${timeoutMs}ms): ${options.url}`));
            });
            // 发送请求体
            if (bodyBuffer) {
                req.write(bodyBuffer);
            }
            req.end();
        });
    });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC1kaXJlY3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJodHRwLWRpcmVjdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7OztHQVlHOzs7Ozs7Ozs7OztBQXdESCxzQ0FFQztBQXhERCxtQ0FBbUM7QUFDbkMsYUFBYTtBQUNiLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUM3QixhQUFhO0FBQ2IsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQy9CLGFBQWE7QUFDYixNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDN0IsYUFBYTtBQUNiLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7QUFvQi9COzs7R0FHRztBQUNILFNBQVMsbUJBQW1CLENBQUksRUFBVztJQUN6QyxNQUFNLEtBQUssR0FBdUMsRUFBRSxDQUFDO0lBQ3JELE1BQU0sU0FBUyxHQUFHLENBQUMsWUFBWSxFQUFFLGFBQWEsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLGFBQWEsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUN2RyxLQUFLLE1BQU0sR0FBRyxJQUFJLFNBQVMsRUFBRSxDQUFDO1FBQzVCLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzlCLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUMxQixDQUFDO0lBQ0QsSUFBSSxDQUFDO1FBQ0gsT0FBTyxFQUFFLEVBQUUsQ0FBQztJQUNkLENBQUM7WUFBUyxDQUFDO1FBQ1QsS0FBSyxNQUFNLEdBQUcsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUM1QixJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDN0IsT0FBTyxDQUFDLEdBQUcsQ0FB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Q0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDdkIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBQ25DLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEIsQ0FBQyxDQUFDO1NBQ0QsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1FBQ1gsT0FBTyxDQUFDLEtBQUssQ0FBQyxhQUFhLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQzFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7QUFDUCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIPCfjJAgSFRUUCDnm7Tov57lt6XlhbfmqKHlnZdcclxuICpcclxuICog5Yqf6IO977ya5L2/55SoIE5vZGUuanMg5YaF572uIGh0dHAvaHR0cHMg5qih5Z2X5Y+R6LW3IEhUVFAg6K+35rGC77yMXHJcbiAqIOe7lei/h+ezu+e7n+S7o+eQhu+8iFYycmF5TiDnrYnlhajlsYDku6PnkIbvvInvvIznm7Tov57nm67moIfmnI3liqHlmajjgIJcclxuICpcclxuICog5a6M5YWo5YW85a65IE9ic2lkaWFuIHJlcXVlc3RVcmwg55qE6L+U5Zue57uT5p6E77yM5Y+v5peg57yd5pu/5o2i44CCXHJcbiAqXHJcbiAqIOS9v+eUqOaWueW8j++8mlxyXG4gKiAgIGltcG9ydCB7IHJlcXVlc3REaXJlY3QgfSBmcm9tICcuL2h0dHAtZGlyZWN0JztcclxuICogICBjb25zdCByZXNwID0gYXdhaXQgcmVxdWVzdERpcmVjdCh7IHVybDogJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJywgLi4uIH0pO1xyXG4gKiAgIGNvbnNvbGUubG9nKHJlc3AuanNvbi5jaG9pY2VzPy5bMF0/Lm1lc3NhZ2U/LmNvbnRlbnQpO1xyXG4gKi9cclxuXHJcbi8vIE5vZGUuanMg5YaF572u5qih5Z2X77yI5bu26L+f5Yqg6L2977yM6YG/5YWNIGVzYnVpbGQg5omT5YyF77yJXHJcbi8vIEB0cy1pZ25vcmVcclxuY29uc3QgaHR0cCA9IHJlcXVpcmUoJ2h0dHAnKTtcclxuLy8gQHRzLWlnbm9yZVxyXG5jb25zdCBodHRwcyA9IHJlcXVpcmUoJ2h0dHBzJyk7XHJcbi8vIEB0cy1pZ25vcmVcclxuY29uc3QgemxpYiA9IHJlcXVpcmUoJ3psaWInKTtcclxuLy8gQHRzLWlnbm9yZVxyXG5jb25zdCB7IFVSTCB9ID0gcmVxdWlyZSgndXJsJyk7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIERpcmVjdFJlcXVlc3RPcHRpb25zIHtcclxuICB1cmw6IHN0cmluZztcclxuICBtZXRob2Q/OiAnR0VUJyB8ICdQT1NUJyB8ICdQVVQnIHwgJ0RFTEVURSc7XHJcbiAgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XHJcbiAgYm9keT86IHN0cmluZyB8IEFycmF5QnVmZmVyIHwgVWludDhBcnJheTtcclxuICAvKiog6LaF5pe25q+r56eS5pWw77yM6buY6K6kIDE4MDAwMDAgKDMwIOWIhumSnykgKi9cclxuICB0aW1lb3V0TXM/OiBudW1iZXI7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRGlyZWN0UmVzcG9uc2Uge1xyXG4gIHN0YXR1czogbnVtYmVyO1xyXG4gIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XHJcbiAgdGV4dDogc3RyaW5nO1xyXG4gIGFycmF5QnVmZmVyOiBBcnJheUJ1ZmZlcjtcclxuICAvKiog6aKE6Kej5p6Q55qEIEpTT04g5a+56LGh77yM5a6M5YWo5YW85a65IHJlcXVlc3RVcmwg55qEIC5qc29uIOWxnuaApyAqL1xyXG4gIGpzb246IGFueTtcclxufVxyXG5cclxuLyoqXHJcbiAqIOaaguWtmOW5tua4heepuuS7o+eQhueOr+Wig+WPmOmHj++8jOaJp+ihjOWujOavleWQjuaBouWkjeOAglxyXG4gKiDnoa7kv53lnKjor7fmsYLmnJ/pl7Tns7vnu5/ku6PnkIborr7nva7kuI3kvJrliqvmjIHov57mjqXjgIJcclxuICovXHJcbmZ1bmN0aW9uIHdpdGhDbGVhcmVkUHJveHlFbnY8VD4oZm46ICgpID0+IFQpOiBUIHtcclxuICBjb25zdCBzYXZlZDogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiA9IHt9O1xyXG4gIGNvbnN0IHByb3h5VmFycyA9IFsnSFRUUF9QUk9YWScsICdIVFRQU19QUk9YWScsICdBTExfUFJPWFknLCAnaHR0cF9wcm94eScsICdodHRwc19wcm94eScsICdhbGxfcHJveHknXTtcclxuICBmb3IgKGNvbnN0IGtleSBvZiBwcm94eVZhcnMpIHtcclxuICAgIHNhdmVkW2tleV0gPSBwcm9jZXNzLmVudltrZXldO1xyXG4gICAgZGVsZXRlIHByb2Nlc3MuZW52W2tleV07XHJcbiAgfVxyXG4gIHRyeSB7XHJcbiAgICByZXR1cm4gZm4oKTtcclxuICB9IGZpbmFsbHkge1xyXG4gICAgZm9yIChjb25zdCBrZXkgb2YgcHJveHlWYXJzKSB7XHJcbiAgICAgIGlmIChzYXZlZFtrZXldICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBwcm9jZXNzLmVudltrZXldID0gc2F2ZWRba2V5XTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIOe7lei/h+ezu+e7n+S7o+eQhueahCBIVFRQIOivt+axglxyXG4gKiDkvb/nlKggTm9kZS5qcyDljp/nlJ8gaHR0cC9odHRwcyDmqKHlnZfvvIzkuI3lj5cgRWxlY3Ryb24gbmV0IHN0YWNrIOW9seWTjVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlcXVlc3REaXJlY3Qob3B0aW9uczogRGlyZWN0UmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPERpcmVjdFJlc3BvbnNlPiB7XHJcbiAgcmV0dXJuIHdpdGhDbGVhcmVkUHJveHlFbnYoKCkgPT4gcmVxdWVzdERpcmVjdEludGVybmFsKG9wdGlvbnMsIDApKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIOWGhemDqOmAkuW9kuWunueOsO+8iOWkhOeQhumHjeWumuWQkei3n+i4qu+8iVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gcmVxdWVzdERpcmVjdEludGVybmFsKFxyXG4gIG9wdGlvbnM6IERpcmVjdFJlcXVlc3RPcHRpb25zLFxyXG4gIHJlZGlyZWN0Q291bnQ6IG51bWJlclxyXG4pOiBQcm9taXNlPERpcmVjdFJlc3BvbnNlPiB7XHJcbiAgY29uc3QgTUFYX1JFRElSRUNUUyA9IDU7XHJcblxyXG4gIGlmIChyZWRpcmVjdENvdW50ID4gTUFYX1JFRElSRUNUUykge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKGDph43lrprlkJHmrKHmlbDov4flpJogKOacgOWkmiAke01BWF9SRURJUkVDVFN9IOasoSk6ICR7b3B0aW9ucy51cmx9YCk7XHJcbiAgfVxyXG5cclxuICBjb25zdCBwYXJzZWRVcmwgPSBuZXcgVVJMKG9wdGlvbnMudXJsKTtcclxuICBjb25zdCBpc0h0dHBzID0gcGFyc2VkVXJsLnByb3RvY29sID09PSAnaHR0cHM6JztcclxuICBjb25zdCBtb2QgPSBpc0h0dHBzID8gaHR0cHMgOiBodHRwO1xyXG4gIGNvbnN0IHRpbWVvdXRNcyA9IG9wdGlvbnMudGltZW91dE1zID8/IDFfODAwXzAwMDtcclxuXHJcbiAgLy8g5p6E5bu66K+35rGC6YCJ6aG54oCU4oCU5LiN6K6+572u5Lu75L2VIHByb3h5IGFnZW5077yM5L2/55So57qvIE5vZGUgQWdlbnQg55u06L+eXHJcbiAgY29uc3QgcmVxdWVzdE9wdGlvbnM6IGFueSA9IHtcclxuICAgIGhvc3RuYW1lOiBwYXJzZWRVcmwuaG9zdG5hbWUsXHJcbiAgICBwb3J0OiBwYXJzZWRVcmwucG9ydCB8fCAoaXNIdHRwcyA/IDQ0MyA6IDgwKSxcclxuICAgIHBhdGg6IHBhcnNlZFVybC5wYXRobmFtZSArIHBhcnNlZFVybC5zZWFyY2gsXHJcbiAgICBtZXRob2Q6IG9wdGlvbnMubWV0aG9kIHx8ICdHRVQnLFxyXG4gICAgaGVhZGVyczoge1xyXG4gICAgICAuLi4ob3B0aW9ucy5oZWFkZXJzIHx8IHt9KSxcclxuICAgICAgJ0FjY2VwdC1FbmNvZGluZyc6ICdnemlwLCBkZWZsYXRlLCBicicsXHJcbiAgICB9LFxyXG4gICAgLy8g5Yib5bu65LiN5bim5Luj55CG55qE57qvIEFnZW50XHJcbiAgICBhZ2VudDogbmV3IChpc0h0dHBzID8gaHR0cHMuQWdlbnQgOiBodHRwLkFnZW50KSh7XHJcbiAgICAgIGtlZXBBbGl2ZTogdHJ1ZSxcclxuICAgICAgcmVqZWN0VW5hdXRob3JpemVkOiB0cnVlLFxyXG4gICAgfSksXHJcbiAgfTtcclxuXHJcbiAgLy8g5aSE55CG6K+35rGC5L2TXHJcbiAgbGV0IGJvZHlCdWZmZXI6IEJ1ZmZlciB8IG51bGwgPSBudWxsO1xyXG4gIGlmIChvcHRpb25zLmJvZHkpIHtcclxuICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5ib2R5ID09PSAnc3RyaW5nJykge1xyXG4gICAgICBib2R5QnVmZmVyID0gQnVmZmVyLmZyb20ob3B0aW9ucy5ib2R5LCAndXRmLTgnKTtcclxuICAgIH0gZWxzZSBpZiAob3B0aW9ucy5ib2R5IGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHtcclxuICAgICAgYm9keUJ1ZmZlciA9IEJ1ZmZlci5mcm9tKG5ldyBVaW50OEFycmF5KG9wdGlvbnMuYm9keSkpO1xyXG4gICAgfSBlbHNlIGlmIChvcHRpb25zLmJvZHkgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XHJcbiAgICAgIGJvZHlCdWZmZXIgPSBCdWZmZXIuZnJvbShvcHRpb25zLmJvZHkpO1xyXG4gICAgfVxyXG4gICAgaWYgKGJvZHlCdWZmZXIpIHtcclxuICAgICAgaWYgKCFyZXF1ZXN0T3B0aW9ucy5oZWFkZXJzWydDb250ZW50LVR5cGUnXSkge1xyXG4gICAgICAgIHJlcXVlc3RPcHRpb25zLmhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddID0gJ2FwcGxpY2F0aW9uL29jdGV0LXN0cmVhbSc7XHJcbiAgICAgIH1cclxuICAgICAgcmVxdWVzdE9wdGlvbnMuaGVhZGVyc1snQ29udGVudC1MZW5ndGgnXSA9IGJvZHlCdWZmZXIubGVuZ3RoLnRvU3RyaW5nKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgY29uc3QgcmVxID0gbW9kLnJlcXVlc3QocmVxdWVzdE9wdGlvbnMsIChyZXM6IGFueSkgPT4ge1xyXG4gICAgICBjb25zdCBzdGF0dXNDb2RlID0gcmVzLnN0YXR1c0NvZGUgfHwgMDtcclxuXHJcbiAgICAgIC8vIOWkhOeQhiAzeHgg6YeN5a6a5ZCR77yI5omL5Yqo6Lef6ZqP77yJXHJcbiAgICAgIGlmIChzdGF0dXNDb2RlID49IDMwMCAmJiBzdGF0dXNDb2RlIDwgNDAwKSB7XHJcbiAgICAgICAgY29uc3QgbG9jYXRpb24gPSByZXMuaGVhZGVyc1snbG9jYXRpb24nXTtcclxuICAgICAgICBpZiAobG9jYXRpb24pIHtcclxuICAgICAgICAgIHJlcy5yZXN1bWUoKTsgLy8g6YeK5pS+5ZON5bqU6LWE5rqQ77yM6YG/5YWN5YaF5a2Y5rOE5ryPXHJcbiAgICAgICAgICBjb25zdCByZWRpcmVjdFVybCA9IG5ldyBVUkwobG9jYXRpb24sIG9wdGlvbnMudXJsKS5ocmVmO1xyXG4gICAgICAgICAgcmVzb2x2ZShcclxuICAgICAgICAgICAgcmVxdWVzdERpcmVjdEludGVybmFsKFxyXG4gICAgICAgICAgICAgIHsgLi4ub3B0aW9ucywgdXJsOiByZWRpcmVjdFVybCB9LFxyXG4gICAgICAgICAgICAgIHJlZGlyZWN0Q291bnQgKyAxXHJcbiAgICAgICAgICAgIClcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyDmlLbpm4blk43lupTmlbDmja7lnZdcclxuICAgICAgY29uc3QgY2h1bmtzOiBCdWZmZXJbXSA9IFtdO1xyXG4gICAgICByZXMub24oJ2RhdGEnLCAoY2h1bms6IEJ1ZmZlcikgPT4gY2h1bmtzLnB1c2goY2h1bmspKTtcclxuICAgICAgcmVzLm9uKCdlbmQnLCAoKSA9PiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGNvbnN0IHJhd0J1ZmZlciA9IEJ1ZmZlci5jb25jYXQoY2h1bmtzKTtcclxuXHJcbiAgICAgICAgICAvLyDmoLnmja4gQ29udGVudC1FbmNvZGluZyDop6PljovvvIhnemlwIC8gZGVmbGF0ZSAvIGJyb3Rsae+8iVxyXG4gICAgICAgICAgY29uc3QgY29udGVudEVuY29kaW5nOiBzdHJpbmcgPSAocmVzLmhlYWRlcnNbJ2NvbnRlbnQtZW5jb2RpbmcnXSB8fCAnJykgYXMgc3RyaW5nO1xyXG4gICAgICAgICAgbGV0IGRlY29tcHJlc3NlZDogQnVmZmVyO1xyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgaWYgKGNvbnRlbnRFbmNvZGluZy5pbmNsdWRlcygnZ3ppcCcpKSB7XHJcbiAgICAgICAgICAgICAgZGVjb21wcmVzc2VkID0gemxpYi5ndW56aXBTeW5jKHJhd0J1ZmZlcik7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY29udGVudEVuY29kaW5nLmluY2x1ZGVzKCdkZWZsYXRlJykpIHtcclxuICAgICAgICAgICAgICBkZWNvbXByZXNzZWQgPSB6bGliLmluZmxhdGVTeW5jKHJhd0J1ZmZlcik7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY29udGVudEVuY29kaW5nLmluY2x1ZGVzKCdicicpKSB7XHJcbiAgICAgICAgICAgICAgZGVjb21wcmVzc2VkID0gemxpYi5icm90bGlEZWNvbXByZXNzU3luYyhyYXdCdWZmZXIpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIGRlY29tcHJlc3NlZCA9IHJhd0J1ZmZlcjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAgIC8vIOino+WOi+Wksei0peWImeS9v+eUqOWOn+Wni+aVsOaNru+8iOS4jemYu+Whnuivt+axgu+8iVxyXG4gICAgICAgICAgICBkZWNvbXByZXNzZWQgPSByYXdCdWZmZXI7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8g5p6E5bu65ZON5bqU5aS077yI5omB5bmz5YyW77yJXHJcbiAgICAgICAgICBjb25zdCByZXNwb25zZUhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcclxuICAgICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHJlcy5oZWFkZXJzKSkge1xyXG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcclxuICAgICAgICAgICAgICByZXNwb25zZUhlYWRlcnNba2V5XSA9IHZhbHVlLmpvaW4oJywgJyk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgIHJlc3BvbnNlSGVhZGVyc1trZXldID0gU3RyaW5nKHZhbHVlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIOaWh+acrOWGheWuuVxyXG4gICAgICAgICAgY29uc3QgdGV4dCA9IGRlY29tcHJlc3NlZC50b1N0cmluZygndXRmLTgnKTtcclxuXHJcbiAgICAgICAgICAvLyBBcnJheUJ1ZmZlcu+8iOS4jiByZXNwb25zZSDnlJ/lkb3lkajmnJ/nu5HlrprvvIlcclxuICAgICAgICAgIGNvbnN0IGFycmF5QnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoZGVjb21wcmVzc2VkKS5idWZmZXIgYXMgQXJyYXlCdWZmZXI7XHJcblxyXG4gICAgICAgICAgLy8g6aKE6Kej5p6QIEpTT07vvIjlhbzlrrkgT2JzaWRpYW4gcmVxdWVzdFVybCDnmoQgLmpzb24g5bGe5oCn77yJXHJcbiAgICAgICAgICBsZXQganNvbjogYW55ID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAganNvbiA9IEpTT04ucGFyc2UodGV4dCk7XHJcbiAgICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgICAganNvbiA9IG51bGw7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgcmVzb2x2ZSh7XHJcbiAgICAgICAgICAgIHN0YXR1czogc3RhdHVzQ29kZSxcclxuICAgICAgICAgICAgaGVhZGVyczogcmVzcG9uc2VIZWFkZXJzLFxyXG4gICAgICAgICAgICB0ZXh0LFxyXG4gICAgICAgICAgICBhcnJheUJ1ZmZlcixcclxuICAgICAgICAgICAganNvbixcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgcmVqZWN0KGVycik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHJlcy5vbignZXJyb3InLCAoZXJyOiBFcnJvcikgPT4gcmVqZWN0KGVycikpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgcmVxLm9uKCdlcnJvcicsIChlcnI6IEVycm9yKSA9PiByZWplY3QoZXJyKSk7XHJcblxyXG4gICAgLy8g6LaF5pe25aSE55CGXHJcbiAgICByZXEuc2V0VGltZW91dCh0aW1lb3V0TXMsICgpID0+IHtcclxuICAgICAgcmVxLmRlc3Ryb3kobmV3IEVycm9yKGDor7fmsYLotoXml7YgKCR7dGltZW91dE1zfW1zKTogJHtvcHRpb25zLnVybH1gKSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyDlj5HpgIHor7fmsYLkvZNcclxuICAgIGlmIChib2R5QnVmZmVyKSB7XHJcbiAgICAgIHJlcS53cml0ZShib2R5QnVmZmVyKTtcclxuICAgIH1cclxuICAgIHJlcS5lbmQoKTtcclxuICB9KTtcclxufVxyXG5cclxuLy8gPT09PT0g6Ieq5rWL5Luj56CB77yI5LuF5b2T55u05o6l6YCa6L+HIG5vZGUg6L+Q6KGM5pe25omn6KGM77yJID09PT09XHJcbmlmIChyZXF1aXJlLm1haW4gPT09IG1vZHVsZSkge1xyXG4gIGNvbnN0IHRlc3RVcmwgPSBwcm9jZXNzLmFyZ3ZbMl0gfHwgJ2h0dHBzOi8vaHR0cGJpbi5vcmcvaXAnO1xyXG4gIGNvbnNvbGUubG9nKGDwn4yQIEhUVFAg55u06L+e6Ieq5rWLOiAke3Rlc3RVcmx9YCk7XHJcbiAgY29uc29sZS5sb2coYPCfk4sg5Luj55CG546v5aKD5Y+Y6YePOmApO1xyXG4gIGNvbnNvbGUubG9nKGAgICBIVFRQX1BST1hZPSR7cHJvY2Vzcy5lbnYuSFRUUF9QUk9YWSB8fCAnKOaXoCknfWApO1xyXG4gIGNvbnNvbGUubG9nKGAgICBIVFRQU19QUk9YWT0ke3Byb2Nlc3MuZW52LkhUVFBTX1BST1hZIHx8ICco5pegKSd9YCk7XHJcbiAgY29uc29sZS5sb2coYCAgIEFMTF9QUk9YWT0ke3Byb2Nlc3MuZW52LkFMTF9QUk9YWSB8fCAnKOaXoCknfWApO1xyXG5cclxuICByZXF1ZXN0RGlyZWN0KHsgdXJsOiB0ZXN0VXJsIH0pXHJcbiAgICAudGhlbihyZXMgPT4ge1xyXG4gICAgICBjb25zb2xlLmxvZyhgXFxu8J+TiiDnirbmgIHnoIE6ICR7cmVzLnN0YXR1c31gKTtcclxuICAgICAgY29uc29sZS5sb2coYPCfk6Yg5ZON5bqU5L2TOmApO1xyXG4gICAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShyZXMuanNvbiwgbnVsbCwgMikpO1xyXG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pyFIOebtOi/nuaIkOWKn++8geivt+axguW3sue7lei/h+ezu+e7n+S7o+eQhuOAgmApO1xyXG4gICAgICBwcm9jZXNzLmV4aXQoMCk7XHJcbiAgICB9KVxyXG4gICAgLmNhdGNoKGVyciA9PiB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCDnm7Tov57lpLHotKU6ICR7ZXJyLm1lc3NhZ2V9YCk7XHJcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcclxuICAgIH0pO1xyXG59XHJcbiJdfQ==