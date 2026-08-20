/**
 * 🛠️ 工具函数模块
 * 提供时间格式化、FFmpeg 操作等通用工具
 */

import { Notice, TFile, Vault } from 'obsidian';
import { spawn } from 'child_process';

/**
 * 安全写入文件（带重试机制和写入验证）
 * @param vault Obsidian Vault 实例
 * @param file 目标文件
 * @param content 要写入的内容
 * @param maxRetries 最大重试次数（默认3次）
 * @returns 是否写入成功
 */
export async function safeWriteWithRetry(
    vault: Vault,
    file: TFile,
    content: string,
    maxRetries = 3
): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            // 执行写入
            await vault.modify(file, content);
            
            // 验证写入：读取文件并比对内容
            await new Promise(resolve => setTimeout(resolve, 100)); // 短暂延迟确保写入完成
            const verify = await vault.read(file);
            
            if (verify === content) {
                console.log(`✅ 文件写入验证成功: ${file.path}`);
                return true;
            }
            
            console.warn(`⚠️ 文件写入验证失败 (尝试 ${i + 1}/${maxRetries}): ${file.path}`);
            
        } catch (e) {
            console.error(`❌ 文件写入异常 (尝试 ${i + 1}/${maxRetries}): ${file.path}`, e);
            
            if (i === maxRetries - 1) {
                throw new Error(`文件写入失败，已重试 ${maxRetries} 次: ${file.path} - ${e.message}`);
            }
            
            // 指数退避重试
            const delay = 1000 * Math.pow(2, i);
            console.log(`⏳ 等待 ${delay}ms 后重试...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    return false;
}

/**
 * 安全创建文件（带重试机制）
 * @param vault Obsidian Vault 实例
 * @param path 文件路径
 * @param content 文件内容
 * @param maxRetries 最大重试次数（默认3次）
 * @returns 创建的文件对象
 */
export async function safeCreateWithRetry(
    vault: Vault,
    path: string,
    content: string,
    maxRetries = 3
): Promise<TFile> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const file = await vault.create(path, content);
            console.log(`✅ 文件创建成功: ${path}`);
            return file;
        } catch (e) {
            if (i === maxRetries - 1) {
                throw new Error(`文件创建失败，已重试 ${maxRetries} 次: ${path} - ${e.message}`);
            }
            
            // 如果是文件已存在错误，直接返回现有文件
            if (e.message?.includes('already exists')) {
                const existing = vault.getAbstractFileByPath(path);
                if (existing instanceof TFile) {
                    console.log(`📄 文件已存在，返回现有文件: ${path}`);
                    return existing;
                }
            }
            
            const delay = 1000 * Math.pow(2, i);
            console.log(`⏳ 等待 ${delay}ms 后重试创建...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw new Error(`无法创建文件: ${path}`);
}

/**
 * 延迟函数
 * @param ms 毫秒数
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 将时间字符串解析为秒数
 * @param timeStr 时间字符串，格式: "MM:SS" 或 "HH:MM:SS"
 * @returns 秒数
 */
export function parseTime(timeStr: string): number {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

/**
 * 将秒数格式化为时间字符串
 * @param s 秒数
 * @returns 时间字符串，格式: "MM:SS" 或 "HH:MM:SS"
 */
export function formatTime(s: number): string {
    if (!s && s !== 0) return "00:00";
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
export function getVideoDuration(ffmpegPath: string, inputPath: string): Promise<number> {
    return new Promise((resolve) => {
        const process = spawn(ffmpegPath, ['-i', inputPath]);
        let stderr = '';
        process.stderr.on('data', d => stderr += d.toString());
        process.on('close', () => {
            const match = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
            if (match) {
                resolve(parseFloat(match[1]) * 3600 + parseFloat(match[2]) * 60 + parseFloat(match[3]));
            } else {
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
export function convertChunkToMp3(
    ffmpegPath: string,
    inputPath: string,
    start: number,
    duration: number,
    notice: Notice,
    prefix: string
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: any[] = [];
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
        
        const ffmpeg = spawn(ffmpegPath, args);
        
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
            } else {
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
export function isSupportedMediaExtension(extension: string): boolean {
    const ext = extension.toLowerCase();
    return ['mp4', 'mp3', 'wav', 'm4a', 'mov'].includes(ext);
}

/**
 * 计算笔记路径
 * @param videoDir 视频所在目录
 * @param videoBasename 视频文件名（不含扩展名）
 * @returns { noteFolder, notePath, noteFileName }
 */
export function calculateNotePaths(videoDir: string, videoBasename: string) {
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
export function calculateMindmapPath(videoDir: string, videoBasename: string): string {
    return videoDir 
        ? `${videoDir}/${videoBasename}🧠.md`
        : `${videoBasename}🧠.md`;
}
