"use strict";
/**
 * 🛠️ 工具函数模块
 * 提供时间格式化、FFmpeg 操作等通用工具
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
exports.safeWriteWithRetry = safeWriteWithRetry;
exports.safeCreateWithRetry = safeCreateWithRetry;
exports.sleep = sleep;
exports.parseTime = parseTime;
exports.formatTime = formatTime;
exports.getVideoDuration = getVideoDuration;
exports.convertChunkToMp3 = convertChunkToMp3;
exports.isSupportedMediaExtension = isSupportedMediaExtension;
exports.calculateNotePaths = calculateNotePaths;
exports.calculateMindmapPath = calculateMindmapPath;
const obsidian_1 = require("obsidian");
const child_process_1 = require("child_process");
/**
 * 安全写入文件（带重试机制和写入验证）
 * @param vault Obsidian Vault 实例
 * @param file 目标文件
 * @param content 要写入的内容
 * @param maxRetries 最大重试次数（默认3次）
 * @returns 是否写入成功
 */
function safeWriteWithRetry(vault_1, file_1, content_1) {
    return __awaiter(this, arguments, void 0, function* (vault, file, content, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                // 执行写入
                yield vault.modify(file, content);
                // 验证写入：读取文件并比对内容
                yield new Promise(resolve => setTimeout(resolve, 100)); // 短暂延迟确保写入完成
                const verify = yield vault.read(file);
                if (verify === content) {
                    console.log(`✅ 文件写入验证成功: ${file.path}`);
                    return true;
                }
                console.warn(`⚠️ 文件写入验证失败 (尝试 ${i + 1}/${maxRetries}): ${file.path}`);
            }
            catch (e) {
                console.error(`❌ 文件写入异常 (尝试 ${i + 1}/${maxRetries}): ${file.path}`, e);
                if (i === maxRetries - 1) {
                    throw new Error(`文件写入失败，已重试 ${maxRetries} 次: ${file.path} - ${e.message}`);
                }
                // 指数退避重试
                const delay = 1000 * Math.pow(2, i);
                console.log(`⏳ 等待 ${delay}ms 后重试...`);
                yield new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        return false;
    });
}
/**
 * 安全创建文件（带重试机制）
 * @param vault Obsidian Vault 实例
 * @param path 文件路径
 * @param content 文件内容
 * @param maxRetries 最大重试次数（默认3次）
 * @returns 创建的文件对象
 */
function safeCreateWithRetry(vault_1, path_1, content_1) {
    return __awaiter(this, arguments, void 0, function* (vault, path, content, maxRetries = 3) {
        var _a;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const file = yield vault.create(path, content);
                console.log(`✅ 文件创建成功: ${path}`);
                return file;
            }
            catch (e) {
                if (i === maxRetries - 1) {
                    throw new Error(`文件创建失败，已重试 ${maxRetries} 次: ${path} - ${e.message}`);
                }
                // 如果是文件已存在错误，直接返回现有文件
                if ((_a = e.message) === null || _a === void 0 ? void 0 : _a.includes('already exists')) {
                    const existing = vault.getAbstractFileByPath(path);
                    if (existing instanceof obsidian_1.TFile) {
                        console.log(`📄 文件已存在，返回现有文件: ${path}`);
                        return existing;
                    }
                }
                const delay = 1000 * Math.pow(2, i);
                console.log(`⏳ 等待 ${delay}ms 后重试创建...`);
                yield new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw new Error(`无法创建文件: ${path}`);
    });
}
/**
 * 延迟函数
 * @param ms 毫秒数
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * 将时间字符串解析为秒数
 * @param timeStr 时间字符串，格式: "MM:SS" 或 "HH:MM:SS"
 * @returns 秒数
 */
function parseTime(timeStr) {
    if (!timeStr)
        return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3)
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2)
        return parts[0] * 60 + parts[1];
    return 0;
}
/**
 * 将秒数格式化为时间字符串
 * @param s 秒数
 * @returns 时间字符串，格式: "MM:SS" 或 "HH:MM:SS"
 */
function formatTime(s) {
    if (!s && s !== 0)
        return "00:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sc = Math.floor(s % 60);
    return h > 0
        ? `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sc.toString().padStart(2, '0')}`
        : `${m.toString().padStart(2, '0')}:${sc.toString().padStart(2, '0')}`;
}
/**
 * 使用 FFmpeg 获取视频时长
 * @param ffmpegPath FFmpeg 可执行文件路径
 * @param inputPath 视频文件路径
 * @returns 视频时长（秒）
 */
function getVideoDuration(ffmpegPath, inputPath) {
    return new Promise((resolve) => {
        const process = (0, child_process_1.spawn)(ffmpegPath, ['-i', inputPath]);
        let stderr = '';
        process.stderr.on('data', d => stderr += d.toString());
        process.on('close', () => {
            const match = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
            if (match) {
                resolve(parseFloat(match[1]) * 3600 + parseFloat(match[2]) * 60 + parseFloat(match[3]));
            }
            else {
                resolve(3600); // 默认 1 小时
            }
        });
    });
}
/**
 * 使用 FFmpeg 将视频片段转换为 MP3
 * @param ffmpegPath FFmpeg 可执行文件路径
 * @param inputPath 输入视频路径
 * @param start 起始时间（秒）
 * @param duration 持续时间（秒）
 * @param notice 进度通知对象
 * @param prefix 进度前缀
 * @returns MP3 数据 Buffer
 */
function convertChunkToMp3(ffmpegPath, inputPath, start, duration, notice, prefix) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const args = [
            '-ss', start.toString(),
            '-t', duration.toString(),
            '-i', inputPath,
            '-vn',
            '-acodec', 'libmp3lame',
            '-q:a', '4',
            '-f', 'mp3',
            '-'
        ];
        const ffmpeg = (0, child_process_1.spawn)(ffmpegPath, args);
        ffmpeg.stderr.on('data', (data) => {
            const str = data.toString();
            const match = str.match(/time=(\d+):(\d+):(\d+\.\d+)/);
            if (match) {
                const h = parseFloat(match[1]);
                const m = parseFloat(match[2]);
                const s = parseFloat(match[3]);
                const percent = Math.min(100, Math.round(((h * 3600 + m * 60 + s) / duration) * 100));
                if (percent % 10 === 0) {
                    notice.setMessage(`${prefix} ⏳ 提取音频: ${percent}%`);
                }
            }
        });
        ffmpeg.stdout.on('data', c => chunks.push(c));
        ffmpeg.on('close', code => {
            if (code === 0) {
                resolve(Buffer.concat(chunks));
            }
            else {
                reject(new Error(`FFmpeg code ${code}`));
            }
        });
    });
}
/**
 * 检查文件扩展名是否为支持的媒体格式
 * @param extension 文件扩展名
 * @returns 是否支持
 */
function isSupportedMediaExtension(extension) {
    const ext = extension.toLowerCase();
    return ['mp4', 'mp3', 'wav', 'm4a', 'mov'].includes(ext);
}
/**
 * 计算笔记路径
 * @param videoDir 视频所在目录
 * @param videoBasename 视频文件名（不含扩展名）
 * @returns { noteFolder, notePath, noteFileName }
 */
function calculateNotePaths(videoDir, videoBasename) {
    const noteFolder = videoDir ? `${videoDir}/📝智能笔记` : '📝智能笔记';
    const notePath = `${noteFolder}/📝${videoBasename}.md`;
    const noteFileName = `📝${videoBasename}`;
    return { noteFolder, notePath, noteFileName };
}
/**
 * 计算思维导图路径
 * @param videoDir 视频所在目录
 * @param videoBasename 视频文件名（不含扩展名）
 * @returns 思维导图文件路径
 */
function calculateMindmapPath(videoDir, videoBasename) {
    return videoDir
        ? `${videoDir}/${videoBasename}🧠.md`
        : `${videoBasename}🧠.md`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ1dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOzs7Ozs7Ozs7OztBQWFILGdEQXFDQztBQVVELGtEQWdDQztBQU1ELHNCQUVDO0FBT0QsOEJBTUM7QUFPRCxnQ0FRQztBQVFELDRDQWNDO0FBWUQsOENBOENDO0FBT0QsOERBR0M7QUFRRCxnREFLQztBQVFELG9EQUlDO0FBalBELHVDQUFnRDtBQUNoRCxpREFBc0M7QUFFdEM7Ozs7Ozs7R0FPRztBQUNILFNBQXNCLGtCQUFrQjt5REFDcEMsS0FBWSxFQUNaLElBQVcsRUFDWCxPQUFlLEVBQ2YsVUFBVSxHQUFHLENBQUM7UUFFZCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsVUFBVSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDbEMsSUFBSSxDQUFDO2dCQUNELE9BQU87Z0JBQ1AsTUFBTSxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFFbEMsaUJBQWlCO2dCQUNqQixNQUFNLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYTtnQkFDckUsTUFBTSxNQUFNLEdBQUcsTUFBTSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUV0QyxJQUFJLE1BQU0sS0FBSyxPQUFPLEVBQUUsQ0FBQztvQkFDckIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO29CQUN4QyxPQUFPLElBQUksQ0FBQztnQkFDaEIsQ0FBQztnQkFFRCxPQUFPLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxJQUFJLFVBQVUsTUFBTSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztZ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LENBQUM7QUFFRDs7Ozs7R0FLRztBQUNILFNBQWdCLGtCQUFrQixDQUFDLFFBQWdCLEVBQUUsYUFBcUI7SUFDdEUsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLFFBQVEsU0FBUyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7SUFDOUQsTUFBTSxRQUFRLEdBQUcsR0FBRyxVQUFVLE1BQU0sYUFBYSxLQUFLLENBQUM7SUFDdkQsTUFBTSxZQUFZLEdBQUcsS0FBSyxhQUFhLEVBQUUsQ0FBQztJQUMxQyxPQUFPLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsQ0FBQztBQUNsRCxDQUFDO0FBRUQ7Ozs7O0dBS0c7QUFDSCxTQUFnQixvQkFBb0IsQ0FBQyxRQUFnQixFQUFFLGFBQXFCO0lBQ3hFLE9BQU8sUUFBUTtRQUNYLENBQUMsQ0FBQyxHQUFHLFFBQVEsSUFBSSxhQUFhLE9BQU87UUFDckMsQ0FBQyxDQUFDLEdBQUcsYUFBYSxPQUFPLENBQUM7QUFDbEMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiDwn5ug77iPIOW3peWFt+WHveaVsOaooeWdl1xyXG4gKiDmj5Dkvpvml7bpl7TmoLzlvI/ljJbjgIFGRm1wZWcg5pON5L2c562J6YCa55So5bel5YW3XHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgTm90aWNlLCBURmlsZSwgVmF1bHQgfSBmcm9tICdvYnNpZGlhbic7XHJcbmltcG9ydCB7IHNwYXduIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XHJcblxyXG4vKipcclxuICog5a6J5YWo5YaZ5YWl5paH5Lu277yI5bim6YeN6K+V5py65Yi25ZKM5YaZ5YWl6aqM6K+B77yJXHJcbiAqIEBwYXJhbSB2YXVsdCBPYnNpZGlhbiBWYXVsdCDlrp7kvotcclxuICogQHBhcmFtIGZpbGUg55uu5qCH5paH5Lu2XHJcbiAqIEBwYXJhbSBjb250ZW50IOimgeWGmeWFpeeahOWGheWuuVxyXG4gKiBAcGFyYW0gbWF4UmV0cmllcyDmnIDlpKfph43or5XmrKHmlbDvvIjpu5jorqQz5qyh77yJXHJcbiAqIEByZXR1cm5zIOaYr+WQpuWGmeWFpeaIkOWKn1xyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNhZmVXcml0ZVdpdGhSZXRyeShcclxuICAgIHZhdWx0OiBWYXVsdCxcclxuICAgIGZpbGU6IFRGaWxlLFxyXG4gICAgY29udGVudDogc3RyaW5nLFxyXG4gICAgbWF4UmV0cmllcyA9IDNcclxuKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1heFJldHJpZXM7IGkrKykge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIC8vIOaJp+ihjOWGmeWFpVxyXG4gICAgICAgICAgICBhd2FpdCB2YXVsdC5tb2RpZnkoZmlsZSwgY29udGVudCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyDpqozor4HlhpnlhaXvvJror7vlj5bmlofku7blubbmr5Tlr7nlhoXlrrlcclxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMCkpOyAvLyDnn63mmoLlu7bov5/noa7kv53lhpnlhaXlrozmiJBcclxuICAgICAgICAgICAgY29uc3QgdmVyaWZ5ID0gYXdhaXQgdmF1bHQucmVhZChmaWxlKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICh2ZXJpZnkgPT09IGNvbnRlbnQpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUg5paH5Lu25YaZ5YWl6aqM6K+B5oiQ5YqfOiAke2ZpbGUucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyDmlofku7blhpnlhaXpqozor4HlpLHotKUgKOWwneivlSAke2kgKyAxfS8ke21heFJldHJpZXN9KTogJHtmaWxlLnBhdGh9YCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIOaWh+S7tuWGmeWFpeW8guW4uCAo5bCd6K+VICR7aSArIDF9LyR7bWF4UmV0cmllc30pOiAke2ZpbGUucGF0aH1gLCBlKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChpID09PSBtYXhSZXRyaWVzIC0gMSkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmlofku7blhpnlhaXlpLHotKXvvIzlt7Lph43or5UgJHttYXhSZXRyaWVzfSDmrKE6ICR7ZmlsZS5wYXRofSAtICR7ZS5tZXNzYWdlfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyDmjIfmlbDpgIDpgb/ph43or5VcclxuICAgICAgICAgICAgY29uc3QgZGVsYXkgPSAxMDAwICogTWF0aC5wb3coMiwgaSk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDij7Mg562J5b6FICR7ZGVsYXl9bXMg5ZCO6YeN6K+VLi4uYCk7XHJcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBkZWxheSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG4vKipcclxuICog5a6J5YWo5Yib5bu65paH5Lu277yI5bim6YeN6K+V5py65Yi277yJXHJcbiAqIEBwYXJhbSB2YXVsdCBPYnNpZGlhbiBWYXVsdCDlrp7kvotcclxuICogQHBhcmFtIHBhdGgg5paH5Lu26Lev5b6EXHJcbiAqIEBwYXJhbSBjb250ZW50IOaWh+S7tuWGheWuuVxyXG4gKiBAcGFyYW0gbWF4UmV0cmllcyDmnIDlpKfph43or5XmrKHmlbDvvIjpu5jorqQz5qyh77yJXHJcbiAqIEByZXR1cm5zIOWIm+W7uueahOaWh+S7tuWvueixoVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNhZmVDcmVhdGVXaXRoUmV0cnkoXHJcbiAgICB2YXVsdDogVmF1bHQsXHJcbiAgICBwYXRoOiBzdHJpbmcsXHJcbiAgICBjb250ZW50OiBzdHJpbmcsXHJcbiAgICBtYXhSZXRyaWVzID0gM1xyXG4pOiBQcm9taXNlPFRGaWxlPiB7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1heFJldHJpZXM7IGkrKykge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZpbGUgPSBhd2FpdCB2YXVsdC5jcmVhdGUocGF0aCwgY29udGVudCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUg5paH5Lu25Yib5bu65oiQ5YqfOiAke3BhdGh9YCk7XHJcbiAgICAgICAgICAgIHJldHVybiBmaWxlO1xyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgaWYgKGkgPT09IG1heFJldHJpZXMgLSAxKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOaWh+S7tuWIm+W7uuWksei0pe+8jOW3sumHjeivlSAke21heFJldHJpZXN9IOasoTogJHtwYXRofSAtICR7ZS5tZXNzYWdlfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyDlpoLmnpzmmK/mlofku7blt7LlrZjlnKjplJnor6/vvIznm7TmjqXov5Tlm57njrDmnInmlofku7ZcclxuICAgICAgICAgICAgaWYgKGUubWVzc2FnZT8uaW5jbHVkZXMoJ2FscmVhZHkgZXhpc3RzJykpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nID0gdmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHBhdGgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nIGluc3RhbmNlb2YgVEZpbGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+ThCDmlofku7blt7LlrZjlnKjvvIzov5Tlm57njrDmnInmlofku7Y6ICR7cGF0aH1gKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXhpc3Rpbmc7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGRlbGF5ID0gMTAwMCAqIE1hdGgucG93KDIsIGkpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg4o+zIOetieW+hSAke2RlbGF5fW1zIOWQjumHjeivleWIm+W7ui4uLmApO1xyXG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgZGVsYXkpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRocm93IG5ldyBFcnJvcihg5peg5rOV5Yib5bu65paH5Lu2OiAke3BhdGh9YCk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDlu7bov5/lh73mlbBcclxuICogQHBhcmFtIG1zIOavq+enkuaVsFxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNsZWVwKG1zOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgbXMpKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIOWwhuaXtumXtOWtl+espuS4suino+aekOS4uuenkuaVsFxyXG4gKiBAcGFyYW0gdGltZVN0ciDml7bpl7TlrZfnrKbkuLLvvIzmoLzlvI86IFwiTU06U1NcIiDmiJYgXCJISDpNTTpTU1wiXHJcbiAqIEByZXR1cm5zIOenkuaVsFxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlVGltZSh0aW1lU3RyOiBzdHJpbmcpOiBudW1iZXIge1xyXG4gICAgaWYgKCF0aW1lU3RyKSByZXR1cm4gMDtcclxuICAgIGNvbnN0IHBhcnRzID0gdGltZVN0ci5zcGxpdCgnOicpLm1hcChOdW1iZXIpO1xyXG4gICAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMykgcmV0dXJuIHBhcnRzWzBdICogMzYwMCArIHBhcnRzWzFdICogNjAgKyBwYXJ0c1syXTtcclxuICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDIpIHJldHVybiBwYXJ0c1swXSAqIDYwICsgcGFydHNbMV07XHJcbiAgICByZXR1cm4gMDtcclxufVxyXG5cclxuLyoqXHJcbiAqIOWwhuenkuaVsOagvOW8j+WMluS4uuaXtumXtOWtl+espuS4slxyXG4gKiBAcGFyYW0gcyDnp5LmlbBcclxuICogQHJldHVybnMg5pe26Ze05a2X56ym5Liy77yM5qC85byPOiBcIk1NOlNTXCIg5oiWIFwiSEg6TU06U1NcIlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdFRpbWUoczogbnVtYmVyKTogc3RyaW5nIHtcclxuICAgIGlmICghcyAmJiBzICE9PSAwKSByZXR1cm4gXCIwMDowMFwiO1xyXG4gICAgY29uc3QgaCA9IE1hdGguZmxvb3IocyAvIDM2MDApO1xyXG4gICAgY29uc3QgbSA9IE1hdGguZmxvb3IoKHMgJSAzNjAwKSAvIDYwKTtcclxuICAgIGNvbnN0IHNjID0gTWF0aC5mbG9vcihzICUgNjApO1xyXG4gICAgcmV0dXJuIGggPiAwIFxyXG4gICAgICAgID8gYCR7aC50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyl9OiR7bS50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyl9OiR7c2MudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpfWBcclxuICAgICAgICA6IGAke20udG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpfToke3NjLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKX1gO1xyXG59XHJcblxyXG4vKipcclxuICog5L2/55SoIEZGbXBlZyDojrflj5bop4bpopHml7bplb9cclxuICogQHBhcmFtIGZmbXBlZ1BhdGggRkZtcGVnIOWPr+aJp+ihjOaWh+S7tui3r+W+hFxyXG4gKiBAcGFyYW0gaW5wdXRQYXRoIOinhumikeaWh+S7tui3r+W+hFxyXG4gKiBAcmV0dXJucyDop4bpopHml7bplb/vvIjnp5LvvIlcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRWaWRlb0R1cmF0aW9uKGZmbXBlZ1BhdGg6IHN0cmluZywgaW5wdXRQYXRoOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XHJcbiAgICAgICAgY29uc3QgcHJvY2VzcyA9IHNwYXduKGZmbXBlZ1BhdGgsIFsnLWknLCBpbnB1dFBhdGhdKTtcclxuICAgICAgICBsZXQgc3RkZXJyID0gJyc7XHJcbiAgICAgICAgcHJvY2Vzcy5zdGRlcnIub24oJ2RhdGEnLCBkID0+IHN0ZGVyciArPSBkLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgIHByb2Nlc3Mub24oJ2Nsb3NlJywgKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBtYXRjaCA9IHN0ZGVyci5tYXRjaCgvRHVyYXRpb246IChcXGQrKTooXFxkKyk6KFxcZCtcXC5cXGQrKS8pO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUocGFyc2VGbG9hdChtYXRjaFsxXSkgKiAzNjAwICsgcGFyc2VGbG9hdChtYXRjaFsyXSkgKiA2MCArIHBhcnNlRmxvYXQobWF0Y2hbM10pKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoMzYwMCk7IC8vIOm7mOiupCAxIOWwj+aXtlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIOS9v+eUqCBGRm1wZWcg5bCG6KeG6aKR54mH5q616L2s5o2i5Li6IE1QM1xyXG4gKiBAcGFyYW0gZmZtcGVnUGF0aCBGRm1wZWcg5Y+v5omn6KGM5paH5Lu26Lev5b6EXHJcbiAqIEBwYXJhbSBpbnB1dFBhdGgg6L6T5YWl6KeG6aKR6Lev5b6EXHJcbiAqIEBwYXJhbSBzdGFydCDotbflp4vml7bpl7TvvIjnp5LvvIlcclxuICogQHBhcmFtIGR1cmF0aW9uIOaMgee7reaXtumXtO+8iOenku+8iVxyXG4gKiBAcGFyYW0gbm90aWNlIOi/m+W6pumAmuefpeWvueixoVxyXG4gKiBAcGFyYW0gcHJlZml4IOi/m+W6puWJjee8gFxyXG4gKiBAcmV0dXJucyBNUDMg5pWw5o2uIEJ1ZmZlclxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbnZlcnRDaHVua1RvTXAzKFxyXG4gICAgZmZtcGVnUGF0aDogc3RyaW5nLFxyXG4gICAgaW5wdXRQYXRoOiBzdHJpbmcsXHJcbiAgICBzdGFydDogbnVtYmVyLFxyXG4gICAgZHVyYXRpb246IG51bWJlcixcclxuICAgIG5vdGljZTogTm90aWNlLFxyXG4gICAgcHJlZml4OiBzdHJpbmdcclxuKTogUHJvbWlzZTxCdWZmZXI+IHtcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgY29uc3QgY2h1bmtzOiBhbnlbXSA9IFtdO1xyXG4gICAgICAgIGNvbnN0IGFyZ3MgPSBbXHJcbiAgICAgICAgICAgICctc3MnLCBzdGFydC50b1N0cmluZygpLFxyXG4gICAgICAgICAgICAnLXQnLCBkdXJhdGlvbi50b1N0cmluZygpLFxyXG4gICAgICAgICAgICAnLWknLCBpbnB1dFBhdGgsXHJcbiAgICAgICAgICAgICctdm4nLFxyXG4gICAgICAgICAgICAnLWFjb2RlYycsICdsaWJtcDNsYW1lJyxcclxuICAgICAgICAgICAgJy1xOmEnLCAnNCcsXHJcbiAgICAgICAgICAgICctZicsICdtcDMnLFxyXG4gICAgICAgICAgICAnLSdcclxuICAgICAgICBdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGZmbXBlZyA9IHNwYXduKGZmbXBlZ1BhdGgsIGFyZ3MpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZmbXBlZy5zdGRlcnIub24oJ2RhdGEnLCAoZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBzdHIgPSBkYXRhLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gc3RyLm1hdGNoKC90aW1lPShcXGQrKTooXFxkKyk6KFxcZCtcXC5cXGQrKS8pO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGggPSBwYXJzZUZsb2F0KG1hdGNoWzFdKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG0gPSBwYXJzZUZsb2F0KG1hdGNoWzJdKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBwYXJzZUZsb2F0KG1hdGNoWzNdKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBlcmNlbnQgPSBNYXRoLm1pbigxMDAsIE1hdGgucm91bmQoKChoICogMzYwMCArIG0gKiA2MCArIHMpIC8gZHVyYXRpb24pICogMTAwKSk7XHJcbiAgICAgICAgICAgICAgICBpZiAocGVyY2VudCAlIDEwID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbm90aWNlLnNldE1lc3NhZ2UoYCR7cHJlZml4fSDij7Mg5o+Q5Y+W6Z+z6aKROiAke3BlcmNlbnR9JWApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZmZtcGVnLnN0ZG91dC5vbignZGF0YScsIGMgPT4gY2h1bmtzLnB1c2goYykpO1xyXG4gICAgICAgIGZmbXBlZy5vbignY2xvc2UnLCBjb2RlID0+IHtcclxuICAgICAgICAgICAgaWYgKGNvZGUgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoQnVmZmVyLmNvbmNhdChjaHVua3MpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZGbXBlZyBjb2RlICR7Y29kZX1gKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG59XHJcblxyXG4vKipcclxuICog5qOA5p+l5paH5Lu25omp5bGV5ZCN5piv5ZCm5Li65pSv5oyB55qE5aqS5L2T5qC85byPXHJcbiAqIEBwYXJhbSBleHRlbnNpb24g5paH5Lu25omp5bGV5ZCNXHJcbiAqIEByZXR1cm5zIOaYr+WQpuaUr+aMgVxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGlzU3VwcG9ydGVkTWVkaWFFeHRlbnNpb24oZXh0ZW5zaW9uOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IGV4dCA9IGV4dGVuc2lvbi50b0xvd2VyQ2FzZSgpO1xyXG4gICAgcmV0dXJuIFsnbXA0JywgJ21wMycsICd3YXYnLCAnbTRhJywgJ21vdiddLmluY2x1ZGVzKGV4dCk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDorqHnrpfnrJTorrDot6/lvoRcclxuICogQHBhcmFtIHZpZGVvRGlyIOinhumikeaJgOWcqOebruW9lVxyXG4gKiBAcGFyYW0gdmlkZW9CYXNlbmFtZSDop4bpopHmlofku7blkI3vvIjkuI3lkKvmianlsZXlkI3vvIlcclxuICogQHJldHVybnMgeyBub3RlRm9sZGVyLCBub3RlUGF0aCwgbm90ZUZpbGVOYW1lIH1cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBjYWxjdWxhdGVOb3RlUGF0aHModmlkZW9EaXI6IHN0cmluZywgdmlkZW9CYXNlbmFtZTogc3RyaW5nKSB7XHJcbiAgICBjb25zdCBub3RlRm9sZGVyID0gdmlkZW9EaXIgPyBgJHt2aWRlb0Rpcn0v8J+TneaZuuiDveeslOiusGAgOiAn8J+TneaZuuiDveeslOiusCc7XHJcbiAgICBjb25zdCBub3RlUGF0aCA9IGAke25vdGVGb2xkZXJ9L/Cfk50ke3ZpZGVvQmFzZW5hbWV9Lm1kYDtcclxuICAgIGNvbnN0IG5vdGVGaWxlTmFtZSA9IGDwn5OdJHt2aWRlb0Jhc2VuYW1lfWA7XHJcbiAgICByZXR1cm4geyBub3RlRm9sZGVyLCBub3RlUGF0aCwgbm90ZUZpbGVOYW1lIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDorqHnrpfmgJ3nu7Tlr7zlm77ot6/lvoRcclxuICogQHBhcmFtIHZpZGVvRGlyIOinhumikeaJgOWcqOebruW9lVxyXG4gKiBAcGFyYW0gdmlkZW9CYXNlbmFtZSDop4bpopHmlofku7blkI3vvIjkuI3lkKvmianlsZXlkI3vvIlcclxuICogQHJldHVybnMg5oCd57u05a+85Zu+5paH5Lu26Lev5b6EXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gY2FsY3VsYXRlTWluZG1hcFBhdGgodmlkZW9EaXI6IHN0cmluZywgdmlkZW9CYXNlbmFtZTogc3RyaW5nKTogc3RyaW5nIHtcclxuICAgIHJldHVybiB2aWRlb0RpciBcclxuICAgICAgICA/IGAke3ZpZGVvRGlyfS8ke3ZpZGVvQmFzZW5hbWV98J+noC5tZGBcclxuICAgICAgICA6IGAke3ZpZGVvQmFzZW5hbWV98J+noC5tZGA7XHJcbn1cclxuIl19