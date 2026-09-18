/**
 * 🎬 Silicon Transcriber - Obsidian 智能转写插件
 * 主入口文件
 * 
 * 功能：视频/音频智能转写 + AI 章节总结 + 思维导图生成
 */

import { Plugin, Notice, MarkdownView, TFile, TFolder, Editor, FileSystemAdapter, WorkspaceLeaf } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';

// 从 src 目录导入模块
import {
    // 类型
    Segment,
    BatchJob,
    ChapterSummary,
    NoteMetaData,
    // 配置
    updateConfigs,
    updateConfigsFromSettings,
    PROCESSING_CONFIG,
    LLM_CONFIG,
    LLM_PROVIDERS,
    ASR_CONFIG,
    SUPPORTED_MEDIA_EXTENSIONS,
    // 设置
    SiliconTranscriberSettings,
    DEFAULT_SETTINGS,
    SiliconTranscriberSettingTab,
    // 工具函数
    formatTime,
    parseTime,
    getVideoDuration,
    convertChunkToMp3,
    isSupportedMediaExtension,
    calculateNotePaths,
    calculateMindmapPath,
    safeWriteWithRetry,
    safeCreateWithRetry,
    sleep,
    // ASR
    uploadToASR,
    // LLM
    getBatchSummary,
    getGlobalCorrectionSummary,
    generateMindmapContent,
    generateTaskReport,
    TaskReportData,
    // 批量转写模态框
    BatchTranscribeModal
} from './src';

/**
 * 转写任务队列项
 */
interface TranscribeTask {
    videoFile: TFile;
    noteFile: TFile;
}

/**
 * 单次 LLM 调用记录
 */
interface LLMCallRecord {
    batchIndex: number;      // 批次索引 (-1 表示全局分析/思维导图)
    phase: 'batch' | 'global' | 'mindmap' | 'report';  // 调用阶段
    provider: string;        // Provider 名称
    model: string;           // 模型名称
    attempt: number;         // 尝试次数
    success: boolean;        // 是否成功
    error?: string;          // 错误信息
    durationMs?: number;     // 耗时（毫秒）
}

/**
 * LLM 使用统计摘要
 */
interface LLMUsageStats {
    totalCalls: number;           // 总调用次数
    successCalls: number;         // 成功次数
    failedCalls: number;          // 失败次数
    providersUsed: string[];      // 使用的 Provider 列表
    modelsUsed: string[];         // 使用的模型列表
    totalDurationMs: number;      // 总耗时（毫秒）
    errorSummary: string[];       // 错误摘要
}

/**
 * 任务执行报告（用于最终报告生成）
 */
interface TaskReport {
    videoFileName: string;
    totalDuration: number;
    totalBatches: number;
    successBatches: number;
    failedBatches: number;
    apiUsageLog: string[];        // API 使用日志（保留兼容）
    errorLog: string[];           // 错误日志（保留兼容）
    llmCallRecords: LLMCallRecord[];  // 结构化 LLM 调用记录
    globalAnalysisSuccess: boolean;
    mindmapSuccess: boolean;
    startTime: Date;
    endTime: Date;
}

/**
 * 主插件类
 */
export default class TranscribePlugin extends Plugin {
    /** FFmpeg 可执行文件路径 */
    ffmpegPath: string = "";
    /** 历史摘要（用于 AI 上下文传递） */
    historySummaries: string = "";
    /** 所有章节摘要数据（用于思维导图生成） */
    allChapterSummaries: ChapterSummary[] = [];
    /** 当前转写任务的所有批次 job 引用（供 runBatchAnalysis 写入 leftover 到下一个 job） */
    private allBatchJobsRef: BatchJob[] | null = null;
    /** 跨批次截断的原文 */
    pendingLeftoverRawText: string = "";
    /** AI 任务队列 */
    aiQueue: Promise<void> = Promise.resolve();
    /** 当前活跃的 AI 任务数 */
    activeAiCount: number = 0;
    /** 全局处理锁，防止重复执行 */
    isProcessing: boolean = false;

    /** 插件设置 */
    settings: SiliconTranscriberSettings = DEFAULT_SETTINGS;

    /** 任务队列 */
    transcriptionQueue: TranscribeTask[] = [];
    /** 队列状态提示框 */
    queueStatusNotice: Notice | null = null;

    /** 当前正在转写的笔记文件路径（用于侧边栏保护） */
    private currentTranscribingNotePath: string | null = null;
    /** 锚点状态缓存（用于写入失败恢复） */
    private anchorStateCache: Map<string, { content: string; timestamp: number }> = new Map();
    /** 批次写入状态跟踪 */
    private batchWriteStatus: Map<number, { success: boolean; retryCount: number; lastError?: string }> = new Map();
    /** 🛡️ 分块内容内存缓存：anchorId -> 最近一次 AI 生成的章节内容。供写入后即时补写与绘图前兜底巡检使用，避免丢失后需要重新生成 */
    private batchContentCache: Map<string, string> = new Map();
    /** 当前任务执行报告 */
    private currentTaskReport: TaskReport | null = null;
    /** 🔒 文件写入互斥锁：确保同一时间只有一个写入操作，防止并发 read-modify-write 竞争 */
    private fileWriteLock: Promise<void> = Promise.resolve();

    /**
     * 🔒 获取文件写入锁：串行化所有文件级写入操作
     * 用法：await this.acquireFileLock(async () => { ... vault.modify ... })
     */
    async withFileLock<T>(fn: () => Promise<T>): Promise<T> {
        const prev = this.fileWriteLock;
        let resolve!: () => void;
        this.fileWriteLock = new Promise<void>(r => { resolve = r; });
        await prev;
        try {
            return await fn();
        } finally {
            resolve();
        }
    }

    /**
     * 加载插件设置（使用 Obsidian 标准 loadData）
     */
    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * 保存插件设置并立即刷新运行时配置
     */
    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        updateConfigsFromSettings(this.settings);
    }

    /**
     * 从 secrets.json 导入 API Key 到设置（迁移兼容层）
     * @returns 是否成功导入
     */
    async loadSecrets(): Promise<boolean> {
        try {
            const pluginDir = this.manifest.dir;
            if (!pluginDir) {
                console.warn("无法获取插件目录路径，尝试默认路径");
            }
            const pathToCheck = pluginDir ? `${pluginDir}/secrets.json` : `.obsidian/plugins/${this.manifest.id}/secrets.json`;
            
            const exists = await this.app.vault.adapter.exists(pathToCheck);
            if (!exists) {
                console.warn("⚠️ 未找到 secrets.json");
                return false;
            }

            const content = await this.app.vault.adapter.read(pathToCheck);
            const secrets = JSON.parse(content);

            // 迁移 secrets 到 settings（仅覆盖非空值）
            if (secrets?.ASR_API_KEY1) this.settings.asrApiKey1 = secrets.ASR_API_KEY1;
            if (secrets?.ASR_API_KEY2) this.settings.asrApiKey2 = secrets.ASR_API_KEY2;
            if (secrets?.LLM_API_KEY) {
                this.settings.llmApiKey = secrets.LLM_API_KEY;
                // 向下兼容：如果没有单独配置报告/全局 Key，使用主 Key
                if (!this.settings.reportLlmApiKey) this.settings.reportLlmApiKey = secrets.LLM_API_KEY;
                if (!this.settings.globalLlmApiKey) this.settings.globalLlmApiKey = secrets.LLM_API_KEY;
            }

            await this.saveSettings();
            console.log("✅ secrets.json 已迁移到设置");
            return true;
        } catch (e) {
            console.error("❌ 加载 secrets.json 失败", e);
            new Notice("Silicon Transcriber: ❌ 加载 secrets.json 失败");
            return false;
        }
    }

    async onload() {
        // 1. 加载插件设置
        await this.loadSettings();

        // 2. 如果设置中没有 API Key，尝试从 secrets.json 自动迁移
        const hasApiKeys = this.settings.asrApiKey1 || this.settings.llmApiKey;
        if (!hasApiKeys) {
            const migrated = await this.loadSecrets();
            if (migrated) {
                new Notice('Silicon Transcriber: ✅ 已从 secrets.json 自动导入 API Key', 5000);
            }
        }

        // 3. 应用设置到运行时配置
        updateConfigsFromSettings(this.settings);

        // 4. 注册设置界面
        this.addSettingTab(new SiliconTranscriberSettingTab(this.app, this));

        // 🌐 启用 HTTP 直连模式，所有 API 请求绕过系统代理
        console.log('🌐 [silicon-transcriber] HTTP 直连模式已启用，所有 API 请求绕过系统代理');
        console.log('🌐 [silicon-transcriber] HTTP 直连模式已启用（LLM + ASR），所有 API 请求绕过系统代理');

        // 🔗 注册自定义协议处理器：实现思维导图链接跳转到右侧边栏
        this.registerObsidianProtocolHandler('silicon-jump', async (params) => {
            await this.handleSiliconJump(params);
        });
        // 🔗 注册主从视图联动：左边切视频，右边自动切笔记
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', async (leaf) => {
                await this.handleLeafChange(leaf);
            })
        );

        // 📝 注册"智能转写"命令
        this.addCommand({
            id: 'transcribe-v37-stable-fix',
            name: '📝 智能转写',
            callback: async () => {
                await this.handleTranscribeCommand();
            }
        });

        // 🧠 注册"重生成思维导图"命令 (从现有笔记)
        this.addCommand({
            id: 'regenerate-mindmap-from-note',
            name: '🧠 重生成思维导图',
            callback: async () => {
                await this.regenerateMindmapFromNote();
            }
        });

        // 📋 注册"批量转写"命令
        this.addCommand({
            id: 'batch-transcribe',
            name: '📦 批量转写',
            callback: async () => {
                await this.openBatchTranscribeModal();
            }
        });
    }

    /**
     * 打开批量转写选择窗口
     */
    private async openBatchTranscribeModal() {
        const modal = new BatchTranscribeModal(this.app, async (files) => {
            await this.queueBatchTranscription(files);
        });
        modal.open();
    }

    /**
     * 将选中的多个文件加入转写队列
     */
    private async queueBatchTranscription(videoFiles: TFile[]) {
        let added = 0;
        let skipped = 0;

        for (const videoFile of videoFiles) {
            const videoDir = videoFile.parent?.path === '/' ? '' : videoFile.parent?.path || '';
            const { noteFolder, notePath } = calculateNotePaths(videoDir, videoFile.basename);

            // 确保文件夹存在
            const existingFolder = this.app.vault.getAbstractFileByPath(noteFolder);
            if (!existingFolder) {
                try {
                    await this.app.vault.createFolder(noteFolder);
                } catch (err) {
                    if (!err.message?.includes('already exists')) {
                        console.error('创建笔记文件夹失败:', err);
                        skipped++;
                        continue;
                    }
                }
            }

            // 确保笔记文件存在
            let noteFile = this.app.vault.getAbstractFileByPath(notePath);
            if (!(noteFile instanceof TFile)) {
                try {
                    // 使用 resourcePath 兼容代理 TFile（如果 getResourcePath 失败则回退到路径拼接）
                    let resourceUrl: string;
                    try {
                        resourceUrl = this.app.vault.getResourcePath(videoFile);
                        if (!resourceUrl || resourceUrl.includes('[object') || resourceUrl.includes('undefined')) {
                            throw new Error('getResourcePath returned invalid URL');
                        }
                    } catch {
                        // 回退：直接用文件名作为相对路径
                        resourceUrl = videoFile.path;
                    }
                    noteFile = await safeCreateWithRetry(
                        this.app.vault,
                        notePath,
                        `![](${resourceUrl.replace(/ /g, '%20')})\n\n`,
                        3
                    );
                } catch (err) {
                    console.error(`创建笔记文件失败: ${notePath}`, err);
                    skipped++;
                    continue;
                }
            }

            // 检查是否已在队列中
            const alreadyInQueue = this.transcriptionQueue.some(
                t => t.videoFile.path === videoFile.path
            );
            if (alreadyInQueue) {
                console.log(`⏭️ 已在队列中，跳过: ${videoFile.basename}`);
                skipped++;
                continue;
            }

            this.transcriptionQueue.push({ videoFile, noteFile: noteFile as TFile });
            added++;
        }

        if (added > 0) {
            new Notice(`✅ 已添加 ${added} 个文件到转写队列${skipped > 0 ? `（跳过 ${skipped} 个）` : ''}`, 3000);
            if (!this.isProcessing) {
                this.processQueue();
            } else {
                this.updateQueueStatus();
            }
        } else {
            new Notice(`⚠️ 没有添加任何文件${skipped > 0 ? `（跳过 ${skipped} 个）` : ''}`, 3000);
        }
    }

    async onunload() {
    }

    // ==================== 事件处理 ====================

    /**
     * 处理自定义协议 silicon-jump（思维导图链接跳转到右侧边栏）
     */
    private async handleSiliconJump(params: Record<string, string>) {
        const file = params.file;
        const heading = params.heading;
        if (!file) return;

        const decodedFile = decodeURIComponent(file);
        const decodedHeading = heading ? decodeURIComponent(heading) : undefined;

        console.log("Silicon Jump Params:", { decodedFile, decodedHeading });

        // 尝试解析目标文件 (Handle full path or just filename)
        let targetTFile = this.app.vault.getAbstractFileByPath(decodedFile);
        
        // 增强的文件查找逻辑
        if (!targetTFile) {
             const files = this.app.vault.getFiles();
             
             // 1. 如果包含路径分隔符，尝试匹配路径结尾（应对相对路径问题）
             if (decodedFile.includes('/')) {
                 targetTFile = files.find(f => f.path.endsWith(decodedFile)) || null;
             }

             // 2. 如果还是没找到，尝试匹配文件名 (basename or name)
             if (!targetTFile) {
                 const targetName = decodedFile.split('/').pop() || decodedFile;
                 targetTFile = files.find(f => f.name === targetName || f.basename === targetName || f.name === targetName + ".md") || null;
             }
        }
        
        console.log("Target File resolved:", targetTFile instanceof TFile ? targetTFile.path : "null", "from input:", decodedFile);

        // 1. 查找右侧边栏中已打开的目标文件
        const rightLeaves = this.app.workspace.getLeavesOfType('markdown')
            .filter(l => l.getRoot() === this.app.workspace.rightSplit);

        let targetLeaf: WorkspaceLeaf | null = null;
        for (const leaf of rightLeaves) {
            const leafFile = (leaf.view as any).file as TFile;
            if (!leafFile) continue;

            const isPathMatch = leafFile.path === decodedFile;
            const isFileMatch = targetTFile instanceof TFile && leafFile.path === targetTFile.path;

            if (isPathMatch || isFileMatch) {
                targetLeaf = leaf;
                break;
            }
        }

        console.log("Found leaf in right sidebar:", !!targetLeaf);

        if (!targetLeaf) {
            // 调试日志：如果找不到，列出当前右侧所有文件的路径
            console.log("Available right leaves:", rightLeaves.map(l => (l.view as any).file?.path));
        }

        // 2. 如果右侧边栏没有打开该文件，尝试打开
        if (!targetLeaf) {
            if (targetTFile instanceof TFile) {
                // getRightLeaf(false) 尝试复用现有窗口
                targetLeaf = this.app.workspace.getRightLeaf(false);
                if (targetLeaf) {
                    await targetLeaf.openFile(targetTFile as TFile);
                    // 给一点时间让文件加载，虽然 openFile 是 async 的
                    await new Promise(r => setTimeout(r, 200));
                }
            } else {
                console.log("❌ Cannot resolve file to open:", decodedFile);
            }
        }

        // 3. 跳转到指定标题
        if (targetLeaf && decodedHeading) {
            const view = targetLeaf.view as MarkdownView;
            const targetFile = (view as any).file as TFile;
            
            if (targetFile) {
                // 读取文件内容查找标题
                const fileContent = await this.app.vault.read(targetFile);
                const lines = fileContent.split('\n');
                
                // 转换 heading 格式：[02:54] -> ⏱️ 02:54
                // 支持多种格式匹配
                const normalizedHeading = decodedHeading
                    .replace(/^\[(\d{2}:\d{2})\]\s*/, '⏱️ $1 ');
        
                // 创建更宽松的匹配版本：忽略全角/半角冒号差异
                const looseHeading = normalizedHeading.replace(/[:：]/g, '[:：]');
                const looseDecodedHeading = decodedHeading.replace(/[:：]/g, '[:：]');
        
                console.log("Looking for heading:", normalizedHeading, "or", decodedHeading);
        
                // 查找匹配的标题行
                let targetLine = -1;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const lineContent = line.replace(/^#+\s*/, '').trim();
        
                    // 多种匹配方式（精确匹配 + 包含匹配 + 宽松匹配）
                    if (lineContent === normalizedHeading ||
                        lineContent === decodedHeading ||
                        line.includes(normalizedHeading) ||
                        line.includes(decodedHeading) ||
                        new RegExp(looseHeading).test(lineContent) ||
                        new RegExp(looseDecodedHeading).test(lineContent)) {
                        targetLine = i;
                        console.log("Found heading at line:", i, "content:", line);
                        break;
                    }
                }
                
                if (targetLine >= 0) {
                    // 使用 Obsidian 的内置跳转方法（支持阅读模式和编辑模式）
                    const state = { line: targetLine };
                    await targetLeaf.openFile(targetFile, { eState: state });
                }
            }
        }

        // 4. 激活右侧边栏
        if (targetLeaf) {
            this.app.workspace.revealLeaf(targetLeaf);
        }
    }

    /**
     * 处理窗口切换事件（主从视图联动）
     */
    private async handleLeafChange(leaf: WorkspaceLeaf | null) {
        if (!leaf || !leaf.view || !(leaf.view as any).file) return;

        const leafRoot = leaf.getRoot();
        if (leafRoot === this.app.workspace.rightSplit || leafRoot === this.app.workspace.leftSplit) return;

        const currentFile = (leaf.view as any).file as TFile;
        if (!currentFile || !isSupportedMediaExtension(currentFile.extension)) return;

        const videoDir = currentFile.parent?.path === '/' ? '' : currentFile.parent?.path || '';
        const { notePath } = calculateNotePaths(videoDir, currentFile.basename);
        const noteFile = this.app.vault.getAbstractFileByPath(notePath);

        if (noteFile instanceof TFile) {
            // 直接调用新的、更强大的打开函数
            await this.openNoteInRightSidebar(noteFile);
        }
    }

    /**
     * 在右侧边栏打开笔记（重写后的版本）
     * 逻辑：复用已有的智能笔记窗口，或者创建新窗口，最后清理其他智能笔记
     * 保护机制：如果原来的智能笔记正在进行转写或在队列中等待，则不关闭该笔记
     */
    private async openNoteInRightSidebar(noteFile: TFile) {
        // 1. 获取右侧所有 Markdown 窗口
        const rightLeaves = this.app.workspace.getLeavesOfType('markdown')
            .filter(l => l.getRoot() === this.app.workspace.rightSplit);

        // 1.5 优先查找是否已经有窗口打开了目标文件（精确匹配）
        // 这样可以实现"跳转"而不是"覆盖"或"新建"
        let targetLeaf: WorkspaceLeaf | null | undefined = rightLeaves.find(leaf => {
            const file = (leaf.view as any).file as TFile;
            return file && file.path === noteFile.path;
        });

        if (targetLeaf) {
            // 如果找到了已打开的目标文件窗口，直接激活它
            this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
        } else {
            // 2. 如果没找到目标文件，尝试找到一个已经打开了"智能笔记"的窗口进行复用
            targetLeaf = rightLeaves.find(leaf => {
                const file = (leaf.view as any).file as TFile;
                // 只要是智能笔记系列的文件，都可以复用
                return file && file.basename.startsWith('📝');
            });
        }

        // 🚨 保护逻辑：检查哪些智能笔记需要被保护（正在处理或在队列中）
        // 收集所有需要保护的笔记文件路径
        const protectedNotePaths = new Set<string>();
        
        // 🔒 添加当前正在转写的笔记（状态锁保护）
        if (this.currentTranscribingNotePath) {
            protectedNotePaths.add(this.currentTranscribingNotePath);
            console.log(`🔒 保护正在转写的笔记: ${this.currentTranscribingNotePath}`);
        }
        
        // 添加队列中所有任务对应的笔记
        for (const task of this.transcriptionQueue) {
            protectedNotePaths.add(task.noteFile.path);
        }
        
        // 检查是否需要启用保护模式
        // 如果需要复用的窗口对应的笔记是被保护的，则不使用该窗口
        const isExactMatch = targetLeaf && (targetLeaf.view as any).file?.path === noteFile.path;
        const isTargetProtected = targetLeaf && protectedNotePaths.has((targetLeaf.view as any).file?.path);
        
        let shouldForceSingleton = true;
        
        if (!isExactMatch && isTargetProtected) {
            console.log("🔒 目标窗口对应的笔记正在处理或排队中，启用保护模式");
            // 不复用被保护的窗口，直接新建
            targetLeaf = null;
            shouldForceSingleton = false; // 不执行清理操作
        }

        // 3. 如果没找到智能笔记窗口（或者因为保护模式没去用），尝试使用 Obsidian API 获取右侧窗口
        if (!targetLeaf) {
            // getRightLeaf(false) 尝试复用现有窗口，避免创建多余的分裂窗口
            targetLeaf = this.app.workspace.getRightLeaf(false);
        }

        if (!targetLeaf) {
             console.log("❌ 无法获取右侧窗口");
             return;
        }

        // 4. 打开目标文件（只有文件不同时才操作）
        const currentFile = (targetLeaf.view as any).file as TFile;
        // 使用 type assertion 确保 view 是 any 以访问 file
        if (!currentFile || currentFile.path !== noteFile.path) {
            console.log("📝 在右侧打开笔记:", noteFile.basename);
            await targetLeaf.openFile(noteFile);
        }

        // 5. 再次清理：关闭右侧所有 **其他** 的智能笔记（确保单例）
        // 但要跳过被保护的笔记
        if (shouldForceSingleton) {
            // 此时我们有了确定的 targetLeaf，其他的旧智能笔记都可以关掉了
            const allRightLeaves = this.app.workspace.getLeavesOfType('markdown')
                .filter(l => l.getRoot() === this.app.workspace.rightSplit);
                
            for (const leaf of allRightLeaves) {
                // 跳过我们刚刚操作的目标窗口
                if (leaf === targetLeaf) continue;

                const leafFile = (leaf.view as any).file as TFile;
                if (leafFile && leafFile.basename.startsWith('📝')) {
                    // 检查是否是被保护的笔记
                    if (protectedNotePaths.has(leafFile.path)) {
                        console.log("🔒 跳过受保护的笔记:", leafFile.basename);
                        continue;
                    }
                    console.log("🗑️ 关闭多余笔记:", leafFile.basename);
                    leaf.detach();
                }
            }
        }
    }


    /**
     * 更新队列状态显示
     */
    updateQueueStatus(currentTaskName?: string) {
        // 如果队列为空且没有正在处理的任务，关闭 Notice
        if (this.transcriptionQueue.length === 0 && !this.isProcessing) {
            if (this.queueStatusNotice) {
                this.queueStatusNotice.setMessage("🎉 所有转写任务已完成！");
                setTimeout(() => {
                    this.queueStatusNotice?.hide();
                    this.queueStatusNotice = null;
                }, 5000);
            }
            return;
        }

        // 创建或更新 Notice
        if (!this.queueStatusNotice) {
            this.queueStatusNotice = new Notice("📋 任务队列已启动", 0);
        }

        let msg = "";
        if (currentTaskName) {
            msg += `🚀 正在转写: ${currentTaskName}\n\n`;
        } else if (this.isProcessing) {
             msg += `🚀 正在处理任务...\n\n`;
        } else {
             msg += `💤 等待任务...\n\n`;
        }

        if (this.transcriptionQueue.length > 0) {
            const nextTasks = this.transcriptionQueue.slice(0, 5).map((t, i) => `   ${i + 1}. ${t.videoFile.basename}`).join('\n');
            msg += `📋 队列等待中 (${this.transcriptionQueue.length}):\n${nextTasks}`;
            if (this.transcriptionQueue.length > 5) msg += `\n   ...等共 ${this.transcriptionQueue.length} 个任务`;
        }
        
        this.queueStatusNotice.setMessage(msg);
    }

    /**
     * 处理队列中的下一个任务
     */
    async processQueue() {
        if (this.transcriptionQueue.length === 0) {
            this.isProcessing = false;
            this.currentTranscribingNotePath = null;
            this.updateQueueStatus();
            return;
        }

        this.isProcessing = true;
        const task = this.transcriptionQueue.shift(); // 取出第一个任务
        
        if (!task) {
            this.isProcessing = false;
            this.currentTranscribingNotePath = null;
            return;
        }

        // 🔒 设置当前转写状态锁
        this.currentTranscribingNotePath = task.noteFile.path;
        console.log(`🔒 转写状态锁已设置: ${task.noteFile.path}`);

        try {
            this.updateQueueStatus(task.videoFile.basename);

            // 1. 打开或激活目标笔记窗口
            await this.openNoteInRightSidebar(task.noteFile);

            // 2. 获取 Editor 和 Leaf (需要等待一点时间让 UI 渲染)
            await sleep(500);
            
            // 查找正确的 leaf（在所有叶子中查找，不限于右侧边栏）
            // 因为 openNoteInRightSidebar 可能会在右侧打开，也可能已存在
            let targetLeaf: WorkspaceLeaf | null = null;
            this.app.workspace.iterateAllLeaves((leaf) => {
                const file = (leaf.view as any).file as TFile;
                if (file && file.path === task.noteFile.path && leaf.view instanceof MarkdownView) {
                    targetLeaf = leaf;
                }
            });

            // 🔒 如果仍然找不到 leaf（可能被意外关闭），尝试重新打开
            if (!targetLeaf) {
                console.warn(`⚠️ 目标笔记 leaf 丢失，尝试重新打开: ${task.noteFile.basename}`);
                const { leaf: newLeaf } = await this.openTranscriptNote(task.videoFile);
                targetLeaf = newLeaf;
                await sleep(300);
            }

            // 再次确认 leaf 存活且是 MarkdownView
            if (targetLeaf && targetLeaf.view instanceof MarkdownView) {
                // 执行转写
                await this.processTranscription(task.videoFile, targetLeaf.view.editor, targetLeaf);
            } else {
                new Notice(`❌ 无法打开笔记文件: ${task.noteFile.basename}，跳过此任务`);
            }

        } catch (error) {
            console.error("Task failed:", error);
            new Notice(`❌ 任务失败: ${task.videoFile.basename} - ${error.message}`);
        } finally {
            // 🔓 清除转写状态锁
            console.log(`🔓 转写状态锁已清除: ${task.noteFile.path}`);
            this.currentTranscribingNotePath = null;
            
            // 无论成功还是失败，都继续下一个
            // 🚀 使用 Promise.then 而非 setTimeout，避免后台 Chromium 节流
            // setTimeout 在后台会被节流到最小 1000ms 甚至更久
            Promise.resolve().then(() => sleep(1000)).then(() => this.processQueue());
        }
    }

    /**
     * 处理"智能转写"命令
     */
    private async handleTranscribeCommand() {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (!activeLeaf) return;

        const view = activeLeaf.view as any;
        const viewType = view.getViewType();
        const currentFile = view.file as TFile;
        
        let videoFile: TFile | null = null;
        let noteFile: TFile | null = null;

        // 1. 确定视频文件和目标笔记文件
        if (viewType === 'markdown') {
            const mdView = view as MarkdownView;
            videoFile = this.findAudioFileInNote(mdView);
            if (videoFile) {
                // 如果是 markdown 触发，笔记本身就是目标
                noteFile = currentFile; 
            } else {
                new Notice('❌ 没找到视频/音频附件');
                return;
            }
        } else if (this.isVideoView(view) && currentFile) {
             videoFile = currentFile;
             // 计算目标笔记路径
             const videoDir = currentFile.parent?.path === '/' ? '' : currentFile.parent?.path || '';
             const { notePath, noteFolder } = calculateNotePaths(videoDir, currentFile.basename);
             
             // 确保文件夹存在
             const existingFolder = this.app.vault.getAbstractFileByPath(noteFolder);
             if (!existingFolder) {
                 try { await this.app.vault.createFolder(noteFolder); } catch (err) {
                     if (!err.message?.includes('already exists')) {
                         console.error('创建笔记文件夹失败:', err);
                     }
                 }
             }

             // 获取或创建笔记文件（不打开窗口，避免干扰正在进行的转写）
             noteFile = this.app.vault.getAbstractFileByPath(notePath) as TFile;
             if (!(noteFile instanceof TFile)) {
                 try {
                     let resourceUrl: string;
                     try {
                         resourceUrl = this.app.vault.getResourcePath(currentFile);
                         if (!resourceUrl || resourceUrl.includes('[object') || resourceUrl.includes('undefined')) {
                             throw new Error('getResourcePath returned invalid URL');
                         }
                     } catch {
                         resourceUrl = currentFile.path;
                     }
                     noteFile = await safeCreateWithRetry(
                         this.app.vault,
                         notePath,
                         `![](${resourceUrl.replace(/ /g, '%20')})\n\n`,
                         3
                     );
                 } catch (err) {
                     console.error(`创建笔记文件失败: ${notePath}`, err);
                     new Notice(`❌ 无法创建笔记文件: ${err.message}`);
                     return;
                 }
             }
        }

        if (videoFile && noteFile) {
            // 检查是否已在队列中或正在处理
            const alreadyInQueue = this.transcriptionQueue.some(
                t => t.videoFile.path === videoFile!.path
            );
            const isCurrentlyProcessing = this.currentTranscribingNotePath === noteFile.path;
            
            if (alreadyInQueue || isCurrentlyProcessing) {
                new Notice(`⏭️ 已在队列中或正在处理: ${videoFile.basename}`, 3000);
                return;
            }

            // 2. 加入队列
            this.transcriptionQueue.push({ videoFile, noteFile });
            
            // 3. 尝试启动队列
            if (!this.isProcessing) {
                this.processQueue();
            } else {
                new Notice(`📋 已添加到队列: ${videoFile.basename}（当前转写完成后自动开始）`, 3000);
                this.updateQueueStatus();
            }
        } else {
            console.warn("无法确定转写任务的源文件或目标笔记");
        }
    }

    // ==================== 核心处理流程 ====================

    /**
     * 主处理流程：转写 + AI 分析 + 思维导图
     */
    async processTranscription(file: TFile, editor: Editor, targetLeaf: WorkspaceLeaf) {
        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter)) {
            new Notice("非桌面环境不可用");
            return;
        }

        const inputPath = path.join(adapter.getBasePath(), file.path);
        const pluginDir = path.join(adapter.getBasePath(), this.manifest.dir ?? "");
        this.ffmpegPath = path.join(pluginDir, 'ffmpeg.exe');

        // 环境检查
        if (!fs.existsSync(this.ffmpegPath)) {
            new Notice(`找不到 ffmpeg.exe`);
            return;
        }
        if (LLM_CONFIG.API_KEY.includes('你的')) {
            new Notice('⚠️ 请配置火山引擎 API Key');
            return;
        }

        // 🔒 侧边栏保护：在转写开始前，确保 targetLeaf 存活
        // 如果 leaf 已被意外关闭，尝试重新打开
        const ensureEditorAlive = (): { editor: Editor; leaf: WorkspaceLeaf } | null => {
            try {
                // 检查 leaf 是否仍然存活
                if (!targetLeaf || !targetLeaf.view || !(targetLeaf.view instanceof MarkdownView)) {
                    return null;
                }
                // 尝试调用 editor 方法，如果 editor 已失效会抛异常
                editor.getValue();
                return { editor, leaf: targetLeaf };
            } catch (e) {
                console.warn('⚠️ Editor 已失效，尝试重新获取...', e);
                return null;
            }
        };

        // 初始检查
        let editorCheck = ensureEditorAlive();
        if (!editorCheck) {
            console.warn('⚠️ 目标 leaf 已关闭，尝试重新打开笔记');
            try {
                const { leaf: newLeaf } = await this.openTranscriptNote(file);
                targetLeaf = newLeaf;
                editor = newLeaf.view instanceof MarkdownView ? newLeaf.view.editor : editor;
                await sleep(300);
                editorCheck = ensureEditorAlive();
                if (!editorCheck) {
                    new Notice(`❌ 无法恢复笔记窗口，跳过: ${file.basename}`);
                    return;
                }
            } catch (e) {
                console.error('重新打开笔记失败:', e);
                new Notice(`❌ 重新打开笔记失败: ${file.basename}`);
                return;
            }
        }

        // 🔒 所有写入操作已改为文件级（vault.read + vault.modify），不依赖编辑器模式
        // 保持用户的阅读模式/实时预览模式不变，无需切换到源码模式

        // 初始化状态
        this.historySummaries = "";
        this.pendingLeftoverRawText = "";
        this.allChapterSummaries = [];
        this.batchContentCache.clear();
        this.aiQueue = Promise.resolve();
        this.activeAiCount = 0;
        
        // 初始化任务报告
        this.currentTaskReport = {
            videoFileName: file.name,
            totalDuration: 0,
            totalBatches: 0,
            successBatches: 0,
            failedBatches: 0,
            apiUsageLog: [],
            errorLog: [],
            llmCallRecords: [],  // 初始化 LLM 调用记录
            globalAnalysisSuccess: false,
            mindmapSuccess: false,
            startTime: new Date(),
            endTime: new Date()
        };

        new Notice(`🚀 启动转写: ${file.name}`);

        try {
            const duration = await getVideoDuration(this.ffmpegPath, inputPath);
            let totalChunks = Math.ceil(duration / PROCESSING_CONFIG.CHUNK_SIZE);
            
            // 🎯 尾部阈值：最后一块不足 3 分钟时合并到倒数第二块；≥ 3 分钟则单独成块（即使不足 7 分钟）
            const MIN_LAST_CHUNK_DURATION = 180; // 3分钟 = 180秒
            if (totalChunks > 1) {
                const lastChunkStart = (totalChunks - 1) * PROCESSING_CONFIG.CHUNK_SIZE;
                const lastChunkDuration = duration - lastChunkStart;
                
                if (lastChunkDuration < MIN_LAST_CHUNK_DURATION) {
                    console.log(`🔗 最后分块时长 ${lastChunkDuration.toFixed(0)}秒 < 3分钟，合并到倒数第二个分块`);
                    totalChunks -= 1;
                }
            }

            // 写入笔记头部和各个批次的初始占位符，以保证顺序绝对正确
            // 保留原始视频链接，确保后续能找到视频文件
            let resourceUrl: string;
            try {
                resourceUrl = this.app.vault.getResourcePath(file);
                if (!resourceUrl || resourceUrl.includes('[object') || resourceUrl.includes('undefined')) {
                    throw new Error('invalid');
                }
            } catch {
                resourceUrl = file.path;
            }
            let initialContent = `![](${resourceUrl.replace(/ /g, '%20')})\n\n> [!info] [[${file.name}]] (${formatTime(duration)})\n>   🧩 视频已拆分为 ${totalChunks} 个部分\n\n`;
            for (let i = 0; i < totalChunks; i++) {
                const anchorId = `BATCH_${i}`;
                initialContent += `\n%%${anchorId}_START%%\n> [!quote]- ⏳ 第 ${i + 1} 部分正在提取音频并转写...\n%%${anchorId}_END%%\n`;
            }
            
            // 更新任务报告
            this.currentTaskReport.totalDuration = duration;
            this.currentTaskReport.totalBatches = totalChunks;
            
            // 🔒 稳定写入策略：直接写入磁盘文件，而非仅修改编辑器内存
            // editor.setValue() 只修改 CodeMirror 内存缓冲区，可能被 Obsidian 的文件同步机制覆盖
            // 使用 vault.modify() 确保内容直接持久化到磁盘
            const initialNoteFile = (targetLeaf.view as any).file as TFile;
            if (initialNoteFile instanceof TFile) {
                await this.app.vault.modify(initialNoteFile, initialContent);
                console.log('✅ 初始内容已通过 vault.modify 写入磁盘');
            } else {
                // 回退：使用 editor.setValue
                editor.setValue(initialContent);
                console.warn('⚠️ noteFile 不可用，回退到 editor.setValue');
            }
            
            // 等待编辑器从磁盘同步内容
            await sleep(300);
            
            // 验证初始内容写入（双重验证：编辑器内存 + 磁盘文件）
            const verifyEditorContent = editor.getValue();
            let verifyDiskContent = '';
            try {
                verifyDiskContent = await this.app.vault.read(initialNoteFile);
            } catch (e) {
                console.warn('⚠️ 无法读取磁盘文件进行验证:', e);
            }
            
            if (!verifyEditorContent.includes('BATCH_0_START') && !verifyDiskContent.includes('BATCH_0_START')) {
                throw new Error('初始内容写入验证失败：编辑器和磁盘均未找到锚点');
            }
            
            if (verifyDiskContent.includes('BATCH_0_START')) {
                console.log('✅ 初始内容写入验证通过（磁盘确认）');
            } else if (verifyEditorContent.includes('BATCH_0_START')) {
                console.log('✅ 初始内容写入验证通过（编辑器确认，磁盘同步可能延迟）');
                // 编辑器有但磁盘没有，强制保存
                if (initialNoteFile instanceof TFile) {
                    await this.app.vault.modify(initialNoteFile, editor.getValue());
                    console.log('✅ 已强制同步编辑器内容到磁盘');
                }
            }

            // 存储所有批次信息以便一次性总结。因为多线程乱序完成，先预分配好数组
            const allBatchJobs: BatchJob[] = new Array(totalChunks);
            this.allBatchJobsRef = allBatchJobs;  // 供 runBatchAnalysis 写入 leftover 到下一个 job

            // 准备并行任务
            // 获取所有可用的 API keys，如果没有则回退
            const apiKeys = (ASR_CONFIG.API_KEYS && ASR_CONFIG.API_KEYS.length > 0) 
                ? ASR_CONFIG.API_KEYS 
                : [ASR_CONFIG.API_KEY];
            
            // ASR 并发数 = Key 数 × 2（同一 Key 可并行，测试验证不限流）
            const maxConcurrent = Math.max(1, apiKeys.length * 2);
            let currentChunkIndex = 0;

            // ==================== LLM 双轨串行任务池 ====================
            // 机制：谁闲着谁就去队列里取总结任务，都没闲着就等着 (Worker Queue Pattern)
            const llmQueue: number[] = [];
            let llmTasksAdded = 0;
            let llmCompletedCount = 0;
            let llmFailedCount = 0;
            let llmCriticalError = false;
            const MAX_LLM_FAILURES = 3; // 连续失败阈值
            let llmResolvers: (() => void)[] = [];

            const wakeUpLlmWorker = () => {
                const resolve = llmResolvers.shift();
                if (resolve) resolve();
            };

            const llmWorker = async (providerIdx: number) => {
                const provider = LLM_PROVIDERS[providerIdx];
                while (llmCompletedCount < totalChunks && !llmCriticalError) {
                    if (llmQueue.length === 0) {
                        if (llmTasksAdded >= totalChunks) break; // 如果所有 ASR 任务都已进入队列则退出
                        // 等待新任务被加入队列
                        await new Promise<void>(resolve => llmResolvers.push(resolve));
                        continue;
                    }

                    // 取出队列中最早完成 ASR 的批次索引
                    const batchIdx = llmQueue.shift();
                    if (batchIdx === undefined) continue;

                    const job = allBatchJobs[batchIdx];
                    if (job && job.segments.length > 0) {
                        try {
                            const result = await this.runBatchAnalysis(job, file.name, editor, targetLeaf, providerIdx);
                            if (result === false) {
                                llmFailedCount++;
                                console.error(`⚠️ LLM 批次 ${batchIdx} 失败，累计失败: ${llmFailedCount}/${MAX_LLM_FAILURES}`);
                                if (llmFailedCount >= MAX_LLM_FAILURES) {
                                    llmCriticalError = true;
                                    console.error(`❌ LLM 连续失败达到阈值，终止剩余分析`);
                                    new Notice(`❌ LLM 连续失败 ${MAX_LLM_FAILURES} 次，已终止分析`, 8000);
                                }
                            } else {
                                llmFailedCount = 0; // 成功后重置计数
                            }
                        } catch (e) {
                            console.error(`LLM 总结批次 ${batchIdx} 遭遇异常:`, e);
                            llmFailedCount++;
                            if (llmFailedCount >= MAX_LLM_FAILURES) {
                                llmCriticalError = true;
                                console.error(`❌ LLM 连续失败达到阈值，终止剩余分析`);
                                new Notice(`❌ LLM 连续失败 ${MAX_LLM_FAILURES} 次，已终止分析`, 8000);
                            }
                        }
                    }

                    llmCompletedCount++;
                    // 如果全部完成或遇到致命错误，唤醒所有可能在等待的 worker，让它们结束循环
                    if (llmCompletedCount >= totalChunks || llmCriticalError) {
                        llmResolvers.forEach(r => r());
                        llmResolvers = [];
                    }
                }
            };

            // 启动所有的 LLM Worker（全部使用 OpenCode DeepSeek V4 Pro idx=0）
            // LLM Worker 数量与 ASR 并发数匹配（4 路）
            const llmWorkers: Promise<void>[] = [];
            for (let i = 0; i < maxConcurrent; i++) { llmWorkers.push(llmWorker(0)); }
            // ============================================================

            const processChunk = async (workerId: number, apiKey: string) => {
                while (currentChunkIndex < totalChunks) {
                    const i = currentChunkIndex++;
                    const chunkStart = i * PROCESSING_CONFIG.CHUNK_SIZE;
                    // 最后一块必须覆盖到视频真实结尾：短尾合并后剩余可达 7+3=10 分钟，
                    // 固定 CHUNK_SIZE 会把被合并的尾巴整个丢掉；+5s 余量防时长估计偏短（ffmpeg 会在 EOF 截停）
                    const isLastChunk = i === totalChunks - 1;
                    const chunkDuration = isLastChunk
                        ? (duration - chunkStart) + 5
                        : PROCESSING_CONFIG.CHUNK_SIZE;
                    const prefix = `[${i + 1}/${totalChunks}]`;
                    const keyLabel = `Key${(workerId % apiKeys.length) + 1}-W${Math.floor(workerId / apiKeys.length) + 1}`;
                    const progressNotice = new Notice(`${prefix} ⏳ [${keyLabel}] 提取音频...`, 0);

                    try {
                        // 1. FFmpeg 提取音频
                        const mp3Buffer = await convertChunkToMp3(
                            this.ffmpegPath,
                            inputPath,
                            chunkStart,
                            chunkDuration,
                            progressNotice,
                            prefix
                        );

                        // 2. 上传到 ASR
                        progressNotice.setMessage(`${prefix} ☁️ [${keyLabel}] 上传云端...`);
                        const asrJson = await uploadToASR(
                            mp3Buffer,
                            `${file.basename}_p${i}.mp3`,
                            progressNotice,
                            prefix,
                            apiKey
                        );
                        progressNotice.hide();

                        const anchorId = `BATCH_${i}`;
                        let pendingSegments: Segment[] = [];

                        // 3. 处理 ASR 返回的 segments
                        if (asrJson.segments) {
                            let chunkTextForEditor = "";
                            asrJson.segments.forEach((seg: any) => {
                                const absStart = seg.start + chunkStart;
                                const absEnd = seg.end + chunkStart;
                                const cleanText = seg.text.trim();
                                const tStr = formatTime(absStart);

                                pendingSegments.push({ start: absStart, end: absEnd, text: cleanText });
                                chunkTextForEditor += `> **[[${file.name}#t=${tStr}|${tStr}]]** ${cleanText}\n`;
                            });

                            // 替换原有的占位说明为已获取到的等待分析文本
                            // 🔒 使用文件级写入，避免编辑器模式问题
                            try {
                                const startMarker = `%%${anchorId}_START%%`;
                                const endMarker = `%%${anchorId}_END%%`;
                                // 🔒 使用文件写入锁，防止并发写入竞争
                                await this.withFileLock(async () => {
                                    const noteFile = (targetLeaf.view as any).file as TFile;
                                    if (noteFile instanceof TFile) {
                                        const fileContent = await this.app.vault.read(noteFile);
                                        const sIdx = fileContent.indexOf(startMarker);
                                        const eIdx = fileContent.indexOf(endMarker);
                                        if (sIdx !== -1 && eIdx !== -1) {
                                            const newBlock = `\n> [!quote]- ⏳ 第 ${i + 1} 部分已转写完成，正在等待 AI 分析...\n`;
                                            const newFileContent =
                                                fileContent.substring(0, sIdx + startMarker.length) +
                                                newBlock +
                                                fileContent.substring(eIdx);
                                            await this.app.vault.modify(noteFile, newFileContent);
                                        }
                                    } else {
                                        // 回退到 editor
                                        const docContent = editor.getValue();
                                        const startIndex = docContent.indexOf(startMarker);
                                        const endIndex = docContent.indexOf(endMarker);
                                        if (startIndex !== -1 && endIndex !== -1) {
                                            const newContent = `\n> [!quote]- ⏳ 第 ${i + 1} 部分已转写完成，正在等待 AI 分析...\n`;
                                            editor.replaceRange(
                                                newContent,
                                                editor.offsetToPos(startIndex + startMarker.length),
                                                editor.offsetToPos(endIndex)
                                            );
                                        }
                                    }
                                });
                            } catch (e) {
                                console.warn(`[批次 ${i}] 中间状态更新失败，不影响后续流程:`, e);
                            }
                        }

                        allBatchJobs[i] = {
                            segments: pendingSegments,
                            batchIndex: i,
                            anchorId: anchorId
                        };

                    } catch (e) {
                        progressNotice.hide();
                        new Notice(`❌ ${prefix} 转写失败: ${e.message}`);
                        allBatchJobs[i] = { segments: [], batchIndex: i, anchorId: `BATCH_${i}` };
                    } finally {
                        // ASR 已结束（无论成功失败），将当前批次推入 LLM 队列中等待空闲的 LLM 车道接手
                        llmQueue.push(i);
                        llmTasksAdded++;
                        wakeUpLlmWorker();
                    }
                }
            };

            // 启动 worker 并发执行（4 路 = 2 Key × 2 并行）
            const workers = [];
            for (let i = 0; i < maxConcurrent; i++) {
                workers.push(processChunk(i, apiKeys[i % apiKeys.length]));
            }

            // 等待所有 ASR 以及伴随的实时 LLM 分析完成
            this.activeAiCount++; // 这里借用 activeAiCount 作为整体分析的一个标志
            await Promise.all(workers);      // 等待 ASR 全部完成
            await Promise.all(llmWorkers);   // 等待所有双轨串行的 LLM 任务完成

            // 全部批次分析完毕后，进行整体审查与修正
            new Notice(`✨ 分块分析完毕，开始全局校验与修正`);
            await this.runGlobalCorrectionAnalysis(allBatchJobs, file.name, editor, targetLeaf, duration);
            this.currentTaskReport.globalAnalysisSuccess = this.allChapterSummaries.length > 0;

            this.activeAiCount--;

            // 🛡️ 绘图前兜底巡检：用内存缓存补写缺失分块（无需重新生成 AI 内容），确保笔记完整再开始绘图
            await this.ensureAllSectionsWritten(editor, targetLeaf, totalChunks, file.name);

            // 🎉 完成通知
            new Notice("🎉 智能转写及章节分析完成！", 0);

            // 切换到阅读模式
            const viewState = targetLeaf.getViewState();
            if (viewState.type === 'markdown') {
                viewState.state = { ...viewState.state, mode: 'preview' };
                await targetLeaf.setViewState(viewState);
            }

            // 🧠 生成思维导图
            await this.generateMindMap(file);
            this.currentTaskReport.mindmapSuccess = true;

            // 📋 生成任务完成报告（直接写入文件，避免 editor 问题）
            const videoDir = file.parent?.path === '/' ? '' : file.parent?.path || '';
            const { notePath } = calculateNotePaths(videoDir, file.basename);
            const noteFile = this.app.vault.getAbstractFileByPath(notePath);
            if (noteFile instanceof TFile) {
                await this.generateAndAppendReportToFile(noteFile);
            }

        } catch (error) {
            console.error(error);
            new Notice(`❌ 错误: ${error.message}`);
            // 记录错误到报告
            if (this.currentTaskReport) {
                this.currentTaskReport.errorLog.push(`系统错误: ${error.message}`);
            }
        }
    }

    /**
     * 运行全局的最终检查与修正
     */
    async runGlobalCorrectionAnalysis(jobs: BatchJob[], fileName: string, editor: Editor, targetLeaf: WorkspaceLeaf, totalDuration: number) {
        if (jobs.length === 0) return;

        const notice = new Notice(`⏳ 正在准备全局校验数据...`, 0);

        try {
            notice.setMessage(`📤 正在组装提示词...`);
            // let allRawText = "";
            let allSegments: Segment[] = [];
            jobs.forEach(job => {
                job.segments.forEach(s => {
                    allSegments.push(s);
                    // allRawText += `[${formatTime(s.start)}] ${s.text}\n`; // 不再将全文传给AI，提升精度
                });
            });

            // 获取前面所有批次的初步总结内容作为参考（传入 key_points 详情）
            const preliminarySummaries = this.allChapterSummaries.map(c => {
                const kps = (c.key_points || []).map(kp => `- ${kp}`).join('\n');
                return `[${c.timestamp}] ${c.title}\n${kps}`;
            }).join('\n\n');

            let topics: ChapterSummary[] = [];
            let globalMetaData: NoteMetaData | null = null;
            const aiStartTime = Date.now();
            const MAX_RETRIES = 2; 

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                let seconds = 0;
                const timer = setInterval(() => {
                    seconds++;
                    // 显示 attempt 信息和已用时间，帮助理解超时链路
                    const attemptMsg = attempt > 1 ? ` (重试 ${attempt - 1}/${MAX_RETRIES - 1})` : "";
                    notice.setMessage(`🧠 全局深度校验思考中${attemptMsg}... 请耐心等待 (${seconds}s)`);
                    // 每 30 秒打印一次进度日志
                    if (seconds % 30 === 0) {
                        console.log(`⏱️ [全局校验] 计时器 | attempt=${attempt}/${MAX_RETRIES} | elapsed=${seconds}s`);
                    }
                }, 1000);

                const callStartTime = Date.now();
                let callSuccess = false;
                let callError: string | undefined;

                try {
                    // 🛡️ 超时链路说明：
                    // - HTTP 层（llm.ts requestOpenCodeV4WithRetry）：每次尝试 600s + 最多重试 2 次（10s+20s 间隔）= ~31 分钟
                    // - Promise.race 兜底：35 分钟，确保不被 HTTP 重试打断
                    // - 注意：Notice 计时器在 Promise.race 完成/出错前不会停止，所以你看到 300s 后还在数是正常的
                    const GLOBAL_TIMEOUT_MS = 2100000; // 35 分钟
                    console.log(`🚀 [全局校验] 第 ${attempt} 次尝试 | preliminarySummaries 长度: ${preliminarySummaries.length} 字符 | 兜底超时: ${GLOBAL_TIMEOUT_MS / 1000}s`);
                    const timeoutPromise = new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error(`全局校验 Promise.race 超时 (${GLOBAL_TIMEOUT_MS}ms)`)), GLOBAL_TIMEOUT_MS)
                    );
                    const result = await Promise.race([
                        getGlobalCorrectionSummary(preliminarySummaries),
                        timeoutPromise
                    ]);
                    topics = result.chapters;
                    globalMetaData = result.metaData;
                    callSuccess = true;
                } catch (err) {
                    console.error(`❌ [全局校验] AI调用异常:`, err);
                    console.error(`❌ [全局校验] 错误堆栈:`, (err as Error).stack || '(无堆栈)');
                    callError = (err as Error).message || String(err);
                } finally {
                    clearInterval(timer);
                    // 记录全局分析的 LLM 调用
                    if (this.currentTaskReport) {
                        this.currentTaskReport.llmCallRecords.push({
                            batchIndex: -1,
                            phase: 'global',
                            provider: 'OpenCode-V4',
                            model: 'deepseek-v4-pro',
                            attempt,
                            success: callSuccess,
                            error: callError,
                            durationMs: Date.now() - callStartTime
                        });
                    }
                }

                if (topics && topics.length > 0) break;
                if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            if (!topics || topics.length === 0) {
                console.error("❌ 全局校验返回空数据，将保留初步结果");
                notice.setMessage("❌ 全局校验失败，保留初步结果");
                setTimeout(() => notice.hide(), 3000);
                return; // 这里直接返回，既然是修正为主，修正失败就保留之前的结果
            }

            const aiDuration = ((Date.now() - aiStartTime) / 1000).toFixed(1);
            notice.setMessage(`⚙️ 校验耗时 ${aiDuration}s，正在分发最终更新...`);
            
            topics.sort((a, b) => parseTime(a.timestamp) - parseTime(b.timestamp));
            // 更新全局的摘要用于接下来的脑图生成
            this.allChapterSummaries = topics;

            let currentTopicIndex = 0;

            for (let i = 0; i < jobs.length; i++) {
                const job = jobs[i];
                if (job.segments.length === 0) continue;
                
                const jobStartTime = job.segments[0].start;
                // 安全计算 jobEndTime：查找下一个有 segments 的批次
                let jobEndTime = totalDuration + 1000;
                for (let j = i + 1; j < jobs.length; j++) {
                    if (jobs[j].segments.length > 0) {
                        jobEndTime = jobs[j].segments[0].start;
                        break;
                    }
                }

                let finalContent = "";

                while (currentTopicIndex < topics.length) {
                    const topic = topics[currentTopicIndex];
                    const topicSec = parseTime(topic.timestamp);

                    if (topicSec >= jobEndTime && currentTopicIndex > 0) break;

                    const nextTopic = topics[currentTopicIndex + 1];
                    const endSec = nextTopic ? parseTime(nextTopic.timestamp) : totalDuration + 1000;

                    const isTopicInThisBatch = (i === 0 && topicSec < jobEndTime) || (topicSec >= jobStartTime && topicSec < jobEndTime);
                    
                    if (isTopicInThisBatch) {
                        // 构建知识点内容（去掉原文嵌入，改用 key_points）
                        finalContent += `#### ⏱️ ${topic.timestamp} ${topic.title}  🎬 [[${fileName}#t=${topic.timestamp}|${topic.timestamp}]]\n`;
                        if (topic.key_points && topic.key_points.length > 0) {
                            topic.key_points.forEach(kp => {
                                // 以 # 开头的行是子标题，不加 - 前缀
                                if (kp.startsWith('#')) {
                                    finalContent += `${kp}\n`;
                                } else {
                                    finalContent += `- ${kp}\n`;
                                }
                            });
                        } else if (topic.summary) {
                            // 向后兼容：如果没有 key_points，用 summary
                            finalContent += `${topic.summary}\n`;
                        }
                        finalContent += `\n`;
                    }

                    if (endSec > jobEndTime) break;
                    else currentTopicIndex++;
                }

                // 不再需要 fallbackRaw，由于我们在话题起始批次里把连续的原文全部聚合了
                // 如果本批次没有自己的新话题起点，它将被静默清理并且什么都不输出，以此来保证纯净排版

                // 统一替换文档，替换掉占位符里的内容（使用安全写入）
                if (finalContent.trim()) {
                    const writeSuccess = await this.safeEditorReplace(
                        editor,
                        targetLeaf,
                        job.anchorId,
                        finalContent,
                        job.batchIndex + 1,
                        notice
                    );

                    if (writeSuccess) {
                        // 🛡️ 即时校验：趁内容还在内存，确认写入确实落盘，被覆盖立即补写
                        await this.verifyAndRepairInsertion(editor, targetLeaf, job.anchorId, finalContent, job.batchIndex + 1, notice);
                    } else {
                        // 写入失败也缓存内容，留给绘图前兜底巡检补写
                        this.batchContentCache.set(job.anchorId, finalContent);
                        console.error(`[全局校验] 批次 ${job.batchIndex} 写入失败`);
                    }
                }
            }

            notice.hide();

            // 📝 全局校验完成后，插入考试核心总览（头部）和老师强调/例题方法（尾部）
            if (globalMetaData) {
                await this.insertMetaSections(editor, targetLeaf, globalMetaData, fileName);
            }

        } catch (error) {
            console.error(error);
            notice.setMessage(`❌ 全局分析遭遇系统错误`);
            setTimeout(() => notice.hide(), 5000);
        }
    }

    /**
     * 在笔记中插入考试核心总览（头部）和老师强调/例题方法（尾部）
     */
    async insertMetaSections(editor: Editor, targetLeaf: WorkspaceLeaf, metaData: NoteMetaData, fileName: string) {
        try {
            // 🔒 纯文件级读写，不依赖编辑器模式
            const noteFile = (targetLeaf.view as any).file as TFile;
            let docContent = '';
            let useFileIO = false;

            if (noteFile instanceof TFile) {
                try {
                    docContent = await this.app.vault.read(noteFile);
                    useFileIO = true;
                } catch {
                    docContent = editor.getValue();
                }
            } else {
                docContent = editor.getValue();
            }

            let modified = false;

            // === 头部：考试核心总览 ===
            if (metaData.exam_focus) {
                const examFocusSection = `### 课程核心总览\n\n${metaData.exam_focus}\n\n---\n\n### 内容转写\n\n`;

                // 在第一个 BATCH 锚点之前插入
                const firstAnchor = docContent.indexOf('%%BATCH_0_START%%');
                if (firstAnchor !== -1) {
                    docContent = docContent.substring(0, firstAnchor) + examFocusSection + docContent.substring(firstAnchor);
                    modified = true;
                    console.log('[META] 已在头部插入考试核心总览');
                }
            }

            // === 尾部：老师强调的注意点 + 例题与方法 ===
            let footerContent = '\n---\n\n';

            if (metaData.emphasis && metaData.emphasis.length > 0) {
                footerContent += `### 老师强调的注意点\n\n`;
                metaData.emphasis.forEach(e => footerContent += `- ${e}\n`);
                footerContent += '\n';
            }

            if (metaData.examples && metaData.examples.length > 0) {
                footerContent += `### 例题与方法\n\n`;
                metaData.examples.forEach(ex => {
                    footerContent += `#### ⏱️ ${ex.timestamp} ${ex.topic}  🎬 [[${fileName}#t=${ex.timestamp}|${ex.timestamp}]]\n`;
                    footerContent += `- **方法**：${ex.method}\n\n`;
                });
            }

            // 在文档末尾追加
            docContent += footerContent;
            modified = true;
            console.log('[META] 已在尾部插入老师强调和例题方法');

            // 🔒 写回磁盘 + 同步编辑器
            if (modified) {
                if (useFileIO && noteFile instanceof TFile) {
                    await this.app.vault.modify(noteFile, docContent);
                    await sleep(50);
                    // 同步编辑器
                    try {
                        const editorAfter = editor.getValue();
                        if (!editorAfter.includes(footerContent.substring(0, Math.min(20, footerContent.length)))) {
                            editor.setValue(docContent);
                        }
                    } catch {}
                } else {
                    editor.setValue(docContent);
                }
            }

        } catch (e) {
            console.error('[META] 插入元数据区块失败:', e);
        }
    }

    /**
     * 生成并追加任务完成报告（直接写入文件版本）
     */
    async generateAndAppendReportToFile(noteFile: TFile) {
        if (!this.currentTaskReport) return;
        
        const report = this.currentTaskReport;
        report.endTime = new Date();
        const durationSeconds = Math.floor((report.endTime.getTime() - report.startTime.getTime()) / 1000);
        
        // 统计成功和失败批次
        report.successBatches = report.totalBatches - report.failedBatches;
        
        const loadingNotice = new Notice("📋 正在生成任务完成报告...", 0);
        
        try {
            // 直接从 vault 读取文件内容
            const currentContent = await this.app.vault.read(noteFile);
            
            const reportContent = await generateTaskReport({
                videoFileName: report.videoFileName,
                totalDuration: report.totalDuration,
                totalBatches: report.totalBatches,
                successBatches: report.successBatches,
                failedBatches: report.failedBatches,
                apiUsageLog: report.apiUsageLog,
                errorLog: report.errorLog,
                globalAnalysisSuccess: report.globalAnalysisSuccess,
                mindmapSuccess: report.mindmapSuccess,
                durationSeconds,
                llmCallRecords: report.llmCallRecords,  // 传递 LLM 调用记录
                generatedNoteContent: currentContent  // 传递笔记内容用于检查 LaTeX 问题
            });
            
            // 先关闭加载中的 Notice
            loadingNotice.hide();
            
            // 直接使用 vault.modify 写入文件，确保持久化
            await this.app.vault.modify(noteFile, currentContent + reportContent);
            
            console.log('✅ 任务完成报告已生成');
            console.log(`📊 报告长度: ${reportContent.length} 字符`);
            new Notice("✅ 任务完成报告已追加到笔记末尾", 5000);
        } catch (e) {
            loadingNotice.hide();
            console.error('生成任务报告失败:', e);
            new Notice("❌ 任务报告生成失败", 3000);
        }
    }

    /**
     * 运行单个批次的 AI 分析
     */
    async runBatchAnalysis(job: BatchJob, fileName: string, editor: Editor, targetLeaf: WorkspaceLeaf, providerIdx: number): Promise<boolean> {
        const provider = LLM_PROVIDERS[providerIdx];
        const startTime = job.segments[0].start;
        const endTime = job.segments[job.segments.length - 1].end;

        // 创建持久显示的 Notice
        const notice = new Notice(`⏳ [批次 ${job.batchIndex + 1}] 初始化中...`, 0);

        // 🔒 锚点保护：在写入前保存当前锚点状态
        const anchorId = job.anchorId;
        const startMarker = `%%${anchorId}_START%%`;
        const endMarker = `%%${anchorId}_END%%`;
        
        // 保存当前文档状态用于恢复
        let preWriteDocContent = "";
        try {
            preWriteDocContent = editor.getValue();
            this.anchorStateCache.set(anchorId, {
                content: preWriteDocContent,
                timestamp: Date.now()
            });
        } catch (e) {
            console.warn(`[批次 ${job.batchIndex + 1}] 无法保存锚点状态:`, e);
        }

        try {
            // --- 阶段一：准备数据 ---
            notice.setMessage(`📤 [批次 ${job.batchIndex + 1}] 正在组装提示词 (0/3)...`);
            let rawText = job.incomingLeftover ? `[上一批次截断内容]\n${job.incomingLeftover}\n\n[本批次内容]\n` : "";
            // 清空已读的 leftover（避免误用）
            job.incomingLeftover = undefined;
            job.segments.forEach(s => rawText += `[${formatTime(s.start)}] ${s.text}\n`);

            // --- 阶段二：请求 AI ---
            const aiStartTime = Date.now();
            let topics: ChapterSummary[] = [];
            let currentLeftover = "";
            const MAX_RETRIES = 2; // 仅重试 1 次 (共 2 次尝试)

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                // 添加心跳计时器
                let seconds = 0;
                const timer = setInterval(() => {
                    seconds++;
                    const retryMsg = attempt > 1 ? ` (重试 ${attempt - 1}/${MAX_RETRIES - 1})` : "";
                    const shortModelName = 'OpenCode-V4';
                    notice.setMessage(`🧠 [批次 ${job.batchIndex + 1}] [${shortModelName}] 模型思考中... (${seconds}s)${retryMsg}`);
                }, 1000);

                const callStartTime = Date.now();
                const providerName = 'OpenCode-V4';
                let callSuccess = false;
                let callError: string | undefined;

                try {
                  // 记录 API 使用（兼容旧格式）
                  if (this.currentTaskReport) {
                    this.currentTaskReport.apiUsageLog.push(`批次 ${job.batchIndex + 1}: 使用 ${providerName} (尝试 ${attempt})`);
                  }
                  
                  // 调用 AI，始终使用 OpenCode DeepSeek V4 Pro (idx=0)
                  const aiResult = await getBatchSummary(rawText, this.historySummaries, startTime, providerIdx, true);
                  topics = aiResult.chapters;
                  currentLeftover = aiResult.leftover;
                  callSuccess = true;
                } catch (err) {
                  console.warn(`[批次 ${job.batchIndex + 1}] AI调用异常 (尝试 ${attempt}/${MAX_RETRIES}):`, err);
                  callError = err.message || String(err);
                  // 记录错误
                  if (this.currentTaskReport) {
                    this.currentTaskReport.errorLog.push(`批次 ${job.batchIndex + 1}: ${callError}`);
                  }
                } finally {
                  clearInterval(timer);
                  // 记录结构化的 LLM 调用信息
                  if (this.currentTaskReport) {
                    this.currentTaskReport.llmCallRecords.push({
                      batchIndex: job.batchIndex,
                      phase: 'batch',
                      provider: providerName,
                      model: provider.MODEL,
                      attempt,
                      success: callSuccess,
                      error: callError,
                      durationMs: Date.now() - callStartTime
                    });
                  }
                }
        
                if (topics && topics.length > 0) {
                  break; // 成功获取数据，退出重试循环
                }
        
                if (attempt < MAX_RETRIES) {
                  notice.setMessage(`⚠️ [批次 ${job.batchIndex + 1}] AI返回空数据，准备重试 (${attempt}/${MAX_RETRIES - 1})...`);
                  await new Promise(r => setTimeout(r, 2000)); // 等待2秒再重试
                }
            }

            // 更新截断内容，供下个批次使用（并发安全：直接写入下一个 job 对象）
            if (currentLeftover) {
                console.log(`[批次 ${job.batchIndex + 1}] 存在截断内容，将传递给下一批次:`, currentLeftover);
                const nextJob = this.allBatchJobsRef?.[job.batchIndex + 1];
                if (nextJob) {
                    nextJob.incomingLeftover = currentLeftover;
                } else {
                    console.log(`[批次 ${job.batchIndex + 1}] 无下一批次，截断内容被丢弃`);
                }
            }

            const aiDuration = ((Date.now() - aiStartTime) / 1000).toFixed(1);

            // 失败检测
            if (!topics || topics.length === 0) {
                const failMsg = `❌ [批次 ${job.batchIndex + 1}] AI 响应为空或解析失败 (已重试 ${MAX_RETRIES-1} 次)`;
                console.error(failMsg);
                notice.setMessage(failMsg);
                this.markBatchAsFailed(job, editor, targetLeaf, "AI 返回空数据");
                // 记录失败批次
                if (this.currentTaskReport) {
                    this.currentTaskReport.failedBatches++;
                    this.currentTaskReport.errorLog.push(`批次 ${job.batchIndex + 1}: AI 响应为空`);
                }
                setTimeout(() => notice.hide(), 5000);
                return false;
            }

            // --- 阶段三：处理数据 ---
            notice.setMessage(`⚙️ [批次 ${job.batchIndex + 1}] AI 耗时 ${aiDuration}s，正在排序与清洗数据...`);
            topics.sort((a, b) => parseTime(a.timestamp) - parseTime(b.timestamp));

            let finalContent = "";
            let newHistory = "";

            for (let t = 0; t < topics.length; t++) {
                const topic = topics[t];
                const topicSec = parseTime(topic.timestamp);

                // 过滤幻觉
                if (topicSec < startTime - 5) continue;

                // 构建最终内容（去掉原文嵌入，改用 key_points）
                finalContent += `#### ⏱️ ${topic.timestamp} ${topic.title}  🎬 [[${fileName}#t=${topic.timestamp}|${topic.timestamp}]]\n`;
                if (topic.key_points && topic.key_points.length > 0) {
                    topic.key_points.forEach(kp => {
                        // 以 # 开头的行是子标题，不加 - 前缀
                        if (kp.startsWith('#')) {
                            finalContent += `${kp}\n`;
                        } else {
                            finalContent += `- ${kp}\n`;
                        }
                    });
                } else if (topic.summary) {
                    // 向后兼容：如果没有 key_points，用 summary
                    finalContent += `${topic.summary}\n`;
                }
                finalContent += `\n`;

                // 历史摘要用于下一批次上下文传递
                const historyDetail = topic.key_points 
                    ? topic.key_points.join('；')
                    : (topic.summary || '');
                newHistory += `[${topic.timestamp}] ${topic.title}\n${historyDetail ? `描述: ${historyDetail}\n` : ''}`;

                // 累积章节数据用于思维导图
                this.allChapterSummaries.push({
                    timestamp: topic.timestamp,
                    title: topic.title,
                    summary: topic.summary || "",
                    key_points: topic.key_points
                });
            }

            this.historySummaries += newHistory;

            // --- 阶段四：写入笔记（带重试和验证） ---
            notice.setMessage(`✍️ [批次 ${job.batchIndex + 1}] 写入文档 (2/3)...`);

            // 使用重试机制写入
            const writeSuccess = await this.safeEditorReplace(
                editor,
                targetLeaf,
                job.anchorId,
                finalContent,
                job.batchIndex + 1,
                notice
            );

            if (writeSuccess) {
                this.batchWriteStatus.set(job.batchIndex, { success: true, retryCount: 0 });
                // 🛡️ 即时校验：趁 AI 回复还在内存，确认内容确实落盘，被覆盖立即补写
                await this.verifyAndRepairInsertion(editor, targetLeaf, job.anchorId, finalContent, job.batchIndex + 1, notice);
                notice.setMessage(`✅ [批次 ${job.batchIndex + 1}] 处理完成！(3/3)`);
            } else {
                this.batchWriteStatus.set(job.batchIndex, {
                    success: false,
                    retryCount: 3,
                    lastError: "锚点丢失或写入失败"
                });
                // 写入失败也缓存内容，留给绘图前兜底巡检补写
                this.batchContentCache.set(job.anchorId, finalContent);
                notice.setMessage(`⚠️ [批次 ${job.batchIndex + 1}] 写入失败：锚点丢失`);
            }

            setTimeout(() => notice.hide(), 2000);
            return true;

        } catch (e) {
            console.error(e);
            this.batchWriteStatus.set(job.batchIndex, {
                success: false,
                retryCount: 0,
                lastError: e.message
            });
            notice.setMessage(`❌ [批次 ${job.batchIndex + 1}] 发生程序错误: ${e.message}`);
            setTimeout(() => notice.hide(), 5000);
            return false;
        } finally {
            // 清理锚点状态缓存
            this.anchorStateCache.delete(anchorId);
        }
    }

    /**
     * 安全的编辑器内容替换（带重试和验证）
     * 采用「磁盘文件优先」策略：先从 vault 读取文件内容，执行字符串替换后写回磁盘
     * 然后同步到编辑器内存，确保内容不会因编辑器同步问题而丢失
     * @param editor 编辑器实例
     * @param anchorId 锚点ID
     * @param newContent 新内容
     * @param batchIndex 批次索引（用于日志）
     * @param notice 通知对象
     * @returns 是否成功
     */
    async safeEditorReplace(
        editor: Editor,
        targetLeaf: WorkspaceLeaf,
        anchorId: string,
        newContent: string,
        batchIndex: number,
        notice?: Notice
    ): Promise<boolean> {
        const startMarker = `%%${anchorId}_START%%`;
        const endMarker = `%%${anchorId}_END%%`;
        const maxRetries = 3;

        // 🔒 直接从 targetLeaf 获取文件对象，不依赖 editor 匹配
        const getNoteFile = (): TFile | null => {
            try {
                const view = targetLeaf.view as any;
                if (view && view.file instanceof TFile) {
                    return view.file;
                }
            } catch {}
            return null;
        };

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // 🔒 使用文件写入锁，防止并发 read-modify-write 竞争
                const result = await this.withFileLock(async () => {
                    // 🔒 优先从磁盘文件读取，确保数据源是最新的
                    const noteFile = getNoteFile();
                    let docContent = '';
                    let useFileIO = false;

                    if (noteFile instanceof TFile) {
                        try {
                            docContent = await this.app.vault.read(noteFile);
                            useFileIO = true;
                        } catch (e) {
                            console.warn(`[批次 ${batchIndex}] 磁盘读取失败，回退到编辑器:`, e);
                            docContent = editor.getValue();
                        }
                    } else {
                        docContent = editor.getValue();
                    }

                    let startIndex = docContent.indexOf(startMarker);
                    let endIndex = docContent.indexOf(endMarker);

                    if (startIndex === -1 || endIndex === -1) {
                        // 备用定位：重新获取
                        if (noteFile instanceof TFile && useFileIO) {
                            try { docContent = await this.app.vault.read(noteFile); }
                            catch { docContent = editor.getValue(); }
                        } else {
                            docContent = editor.getValue();
                        }
                        startIndex = docContent.indexOf(startMarker);
                        endIndex = docContent.indexOf(endMarker);
                    }

                    if (startIndex === -1 || endIndex === -1) {
                        return { success: false, reason: 'anchor-not-found' } as const;
                    }

                    console.log(`[替换] 批次 ${batchIndex} - 位置: ${startIndex} 到 ${endIndex}, 内容长度: ${newContent.length}, 来源: ${useFileIO ? '磁盘' : '编辑器'}`);

                    // 构建新文档内容
                    const newDocContent =
                        docContent.substring(0, startIndex) +
                        `${startMarker}\n${newContent}\n${endMarker}` +
                        docContent.substring(endIndex + endMarker.length);

                    if (useFileIO && noteFile instanceof TFile) {
                        // 🔒 写入磁盘
                        await this.app.vault.modify(noteFile, newDocContent);
                        await sleep(50);
                        // 同步编辑器
                        try {
                            const editorAfter = editor.getValue();
                            if (!editorAfter.includes(newContent.substring(0, Math.min(50, newContent.length)))) {
                                editor.setValue(newDocContent);
                                console.log(`[替换] 批次 ${batchIndex} 编辑器已手动同步`);
                            }
                        } catch (e) {
                            console.warn(`[批次 ${batchIndex}] 编辑器同步检查异常:`, e);
                        }
                    } else {
                        // 回退：使用编辑器 API
                        const startPos = editor.offsetToPos(startIndex);
                        const endPos = editor.offsetToPos(endIndex + endMarker.length);
                        editor.replaceRange(`${startMarker}\n${newContent}\n${endMarker}`, startPos, endPos);
                    }

                    return { success: true, newDocContent, noteFile, useFileIO } as const;
                });

                if (result.success) {
                    // 验证写入（在锁外验证，减少锁持有时间）
                    await sleep(100);
                    let verifySuccess = false;
                    
                    // 验证 1: 编辑器内存
                    const verifyEditorContent = editor.getValue();
                    const verifyStart = verifyEditorContent.indexOf(startMarker);
                    const verifyEnd = verifyEditorContent.indexOf(endMarker);
                    if (verifyStart !== -1 && verifyEnd !== -1 && verifyStart < verifyEnd) {
                        const writtenSection = verifyEditorContent.substring(verifyStart, verifyEnd + endMarker.length);
                        if (writtenSection.includes(newContent.substring(0, Math.min(50, newContent.length)))) {
                            verifySuccess = true;
                            console.log(`[替换] 批次 ${batchIndex} 替换成功并验证通过（编辑器）`);
                        }
                    }

                    // 验证 2: 磁盘文件
                    if (!verifySuccess && result.noteFile instanceof TFile) {
                        try {
                            const verifyDiskContent = await this.app.vault.read(result.noteFile);
                            const diskStart = verifyDiskContent.indexOf(startMarker);
                            const diskEnd = verifyDiskContent.indexOf(endMarker);
                            if (diskStart !== -1 && diskEnd !== -1 && diskStart < diskEnd) {
                                const diskSection = verifyDiskContent.substring(diskStart, diskEnd + endMarker.length);
                                if (diskSection.includes(newContent.substring(0, Math.min(50, newContent.length)))) {
                                    verifySuccess = true;
                                    console.log(`[替换] 批次 ${batchIndex} 替换成功并验证通过（磁盘）`);
                                    // 磁盘有但编辑器没有，强制同步编辑器
                                    editor.setValue(verifyDiskContent);
                                    console.log(`[替换] 批次 ${batchIndex} 编辑器已从磁盘同步`);
                                }
                            }
                        } catch (e) {
                            console.warn(`[批次 ${batchIndex}] 磁盘验证读取失败:`, e);
                        }
                    }

                    if (verifySuccess) return true;
                    console.warn(`[批次 ${batchIndex}] 写入验证失败 (尝试 ${attempt + 1}/${maxRetries})`);
                } else {
                    console.error(`[批次 ${batchIndex}] 无法定位锚点`);
                }

            } catch (e) {
                console.error(`[批次 ${batchIndex}] 写入异常 (尝试 ${attempt + 1}/${maxRetries}):`, e);
            }

            if (attempt < maxRetries - 1) {
                const delay = 500 * Math.pow(2, attempt);
                notice?.setMessage(`⏳ [批次 ${batchIndex}] 写入重试中 (${attempt + 1}/${maxRetries - 1})...`);
                await sleep(delay);
            }
        }

        return false;
    }

    /**
     * 🛡️ 插入后即时校验（每次 AI 回复写入完成后立即调用）
     * 写入当时的验证可能通过，但内容仍可能在数秒后被并发批次的编辑器同步/整体覆盖回写冲掉。
     * 这里延迟片刻后复查锚点区间，发现内容丢失立即用内存中的内容补写——
     * 趁 AI 回复还在内存时修复，避免流程末端才发现缺失、需要重新生成。
     * @returns 校验（含补写）后内容是否确认落盘
     */
    async verifyAndRepairInsertion(
        editor: Editor,
        targetLeaf: WorkspaceLeaf,
        anchorId: string,
        expectedContent: string,
        batchIndex: number,
        notice?: Notice
    ): Promise<boolean> {
        if (!expectedContent || !expectedContent.trim()) return false;

        // 无论下方校验结果如何都先缓存：绘图前兜底巡检可凭它补写，无需重新生成
        this.batchContentCache.set(anchorId, expectedContent);

        const startMarker = `%%${anchorId}_START%%`;
        const endMarker = `%%${anchorId}_END%%`;
        const probe = expectedContent.substring(0, Math.min(50, expectedContent.length)).trim();

        const sectionHasContent = (content: string): boolean => {
            const s = content.indexOf(startMarker);
            const e = content.indexOf(endMarker);
            if (s === -1 || e === -1 || e < s) return false;
            const section = content.substring(s + startMarker.length, e).trim();
            return section.length > 0 && section.includes(probe);
        };

        try {
            // 延迟复查：给编辑器同步/自动保存风暴留出时间，写入竞争大多发生在这几秒内
            await sleep(2000);

            let diskContent = '';
            let diskOk = false;
            const noteFile = (targetLeaf.view as any).file as TFile;
            if (noteFile instanceof TFile) {
                try {
                    diskContent = await this.app.vault.read(noteFile);
                    diskOk = sectionHasContent(diskContent);
                } catch (e) {
                    console.warn(`[批次 ${batchIndex}] 延迟校验读取磁盘失败:`, e);
                }
            }

            let editorOk = false;
            try {
                editorOk = sectionHasContent(editor.getValue());
            } catch {}

            if (diskOk && editorOk) return true;

            // 磁盘完好、仅编辑器滞后：以最新磁盘内容为准同步编辑器
            if (diskOk && !editorOk) {
                try {
                    let freshDisk = diskContent;
                    try { freshDisk = await this.app.vault.read(noteFile); } catch {}
                    editor.setValue(freshDisk);
                    console.log(`[批次 ${batchIndex}] 延迟校验：磁盘完好，编辑器已从磁盘同步`);
                } catch {}
                return true;
            }

            // 磁盘内容缺失/被覆盖 → 立即用内存内容补写
            console.warn(`[批次 ${batchIndex}] ⚠️ 延迟校验发现内容未持久化（锚点 ${anchorId}），立即补写`);
            if (this.currentTaskReport) {
                this.currentTaskReport.errorLog.push(`批次 ${batchIndex}: 写入后内容丢失，已触发自动补写`);
            }
            const repaired = await this.safeEditorReplace(editor, targetLeaf, anchorId, expectedContent, batchIndex, notice);
            if (repaired) {
                console.log(`[批次 ${batchIndex}] ✅ 补写成功，内容已确认写入`);
            } else {
                console.error(`[批次 ${batchIndex}] ❌ 补写失败，内容仍缺失（绘图前兜底巡检将再次尝试）`);
            }
            return repaired;
        } catch (e) {
            console.warn(`[批次 ${batchIndex}] 延迟校验异常（不影响主流程，兜底巡检会再次检查）:`, e);
            return false;
        }
    }

    /**
     * 🛡️ 绘图前兜底巡检：逐一核对每个分块锚点区间，内容为空或仍是占位提示时，
     * 用内存缓存（batchContentCache）中的 AI 生成内容补写——不触发任何重新生成。
     * 无缓存且缺失的批次只告警，不阻塞思维导图生成。
     */
    async ensureAllSectionsWritten(editor: Editor, targetLeaf: WorkspaceLeaf, totalChunks: number, fileName: string) {
        const noteFile = (targetLeaf.view as any).file as TFile;
        if (!(noteFile instanceof TFile)) {
            console.warn('[兜底巡检] 无法获取笔记文件，跳过巡检');
            return;
        }

        const unrepaired: number[] = [];

        try {
            // 先在锁内统一读取并判定缺失项，再在锁外逐个补写（safeEditorReplace 内部自带锁，不可嵌套）
            const repairs = await this.withFileLock(async () => {
                const content = await this.app.vault.read(noteFile);
                const list: { anchorId: string; batchIndex: number; content: string }[] = [];
                for (let i = 0; i < totalChunks; i++) {
                    const anchorId = `BATCH_${i}`;
                    const startMarker = `%%${anchorId}_START%%`;
                    const endMarker = `%%${anchorId}_END%%`;
                    const s = content.indexOf(startMarker);
                    const e = content.indexOf(endMarker);
                    if (s === -1 || e === -1 || e < s) continue;

                    const section = content.substring(s + startMarker.length, e).trim();
                    const cached = this.batchContentCache.get(anchorId);
                    const isEmpty = section.length === 0;
                    // 仍是"⏳ 提取/等待分析"类占位提示，而内存里已有真实内容 → 视为缺失
                    const isPlaceholder = !isEmpty && section.startsWith('>') && section.includes('⏳');

                    if (isEmpty || isPlaceholder) {
                        if (cached && cached.trim()) {
                            list.push({ anchorId, batchIndex: i + 1, content: cached });
                        } else {
                            unrepaired.push(i + 1);
                        }
                    }
                }
                return list;
            });

            for (const r of repairs) {
                console.warn(`[兜底巡检] 批次 ${r.batchIndex} 内容缺失，使用内存缓存补写 (anchor=${r.anchorId})`);
                const ok = await this.safeEditorReplace(editor, targetLeaf, r.anchorId, r.content, r.batchIndex);
                if (!ok) unrepaired.push(r.batchIndex);
            }

            if (repairs.length > 0) {
                new Notice(`🛡️ 绘图前巡检：已自动补写 ${repairs.length} 个缺失分块`, 5000);
            }
            if (unrepaired.length > 0) {
                console.error(`[兜底巡检] 第 ${unrepaired.join('、')} 部分内容缺失，未能自动恢复`);
                if (this.currentTaskReport) {
                    this.currentTaskReport.errorLog.push(`兜底巡检: 第 ${unrepaired.join('、')} 部分内容缺失，未能自动恢复`);
                }
                new Notice(`⚠️ 第 ${unrepaired.join('、')} 部分内容缺失，未能自动恢复`, 8000);
            }
        } catch (e) {
            console.warn('[兜底巡检] 巡检异常（不影响后续绘图）:', e);
        }
    }

    /**
     * 标记失败的批次（使用文件级写入）
     */
    async markBatchAsFailed(job: BatchJob, editor: Editor, targetLeaf: WorkspaceLeaf, reason: string) {
        const startMarker = `%%${job.anchorId}_START%%`;
        const endMarker = `%%${job.anchorId}_END%%`;
        let originalRaw = "";
        job.segments.forEach(s => originalRaw += `> **[${formatTime(s.start)}]** ${s.text}\n`);
        const failedBlock = `${startMarker}\n> [!danger] ❌ 第 ${job.batchIndex + 1} 部分分析失败 (${reason})\n${originalRaw}\n${endMarker}`;

        try {
            const noteFile = (targetLeaf.view as any).file as TFile;
            if (noteFile instanceof TFile) {
                // 🔒 此时常有并发批次在写入，必须持锁 read-modify-write，
                // 否则会用旧快照整体回写，把其他批次刚写入的内容覆盖掉
                await this.withFileLock(async () => {
                    const fileContent = await this.app.vault.read(noteFile);
                    const startIndex = fileContent.indexOf(startMarker);
                    const endIndex = fileContent.indexOf(endMarker);
                    if (startIndex !== -1 && endIndex !== -1) {
                        const newContent =
                            fileContent.substring(0, startIndex) +
                            failedBlock +
                            fileContent.substring(endIndex + endMarker.length);
                        await this.app.vault.modify(noteFile, newContent);
                    }
                });
                return;
            }
        } catch (e) {
            console.warn(`[批次 ${job.batchIndex}] markBatchAsFailed 文件级写入失败，尝试 editor:`, e);
        }

        // 回退到 editor
        try {
            const docContent = editor.getValue();
            const startIndex = docContent.indexOf(startMarker);
            const endIndex = docContent.indexOf(endMarker);
            if (startIndex !== -1 && endIndex !== -1) {
                const startPos = editor.offsetToPos(startIndex);
                const endPos = editor.offsetToPos(endIndex + endMarker.length);
                editor.replaceRange(failedBlock, startPos, endPos);
            }
        } catch (e) {
            console.error(`[批次 ${job.batchIndex}] markBatchAsFailed editor 回退也失败:`, e);
        }
    }

    /**
     * 生成思维导图
     */
    async generateMindMap(videoFile: TFile) {
        try {
            if (this.allChapterSummaries.length === 0) {
                console.warn("没有章节数据，跳过思维导图生成");
                return;
            }

            const prepareNotice = new Notice("🧠 [阶段1/4] 准备章节数据...", 0);

            // 修复根目录路径问题
            const videoDir = videoFile.parent?.path === '/' ? '' : videoFile.parent?.path || '';
            const { notePath } = calculateNotePaths(videoDir, videoFile.basename);
            const noteFile = this.app.vault.getAbstractFileByPath(notePath);

            if (!(noteFile instanceof TFile)) {
                prepareNotice.hide();
                new Notice("⚠️ 无法找到笔记文件，跳过思维导图生成。");
                return;
            }

            // 调用 LLM 生成思维导图内容
            prepareNotice.setMessage("🧠 [阶段2/4] 生成 Markmap...");
            
            const mindmapStartTime = Date.now();
            let mindmapSuccess = false;
            let mindmapError: string | undefined;
            let finalContent: string = '';
            
            try {
                const content = await generateMindmapContent(this.allChapterSummaries, noteFile, this.app);
                mindmapSuccess = true;
                
                // 添加 MarkMind 识别头，配置节点间距更宽松
                const yamlHeader = `---
mindmap-plugin: basic
markmap:
  spacingVertical: 25
  spacingHorizontal: 180
  paddingX: 30
  initialExpandLevel: 3
---

`;
                finalContent = yamlHeader + content;
            } catch (llmError: any) {
                mindmapError = llmError.message || String(llmError);
                console.error("思维导图 LLM 调用失败:", llmError);
            } finally {
                // 记录思维导图的 LLM 调用
                if (this.currentTaskReport) {
                    this.currentTaskReport.llmCallRecords.push({
                        batchIndex: -1,
                        phase: 'mindmap',
                        provider: 'OpenCode-V4',
                        model: 'deepseek-v4-pro',
                        attempt: 1,
                        success: mindmapSuccess,
                        error: mindmapError,
                        durationMs: Date.now() - mindmapStartTime
                    });
                }
            }
            
            if (!mindmapSuccess || !finalContent) {
                prepareNotice.hide();
                new Notice("⚠️ 思维导图内容生成失败", 5000);
                return;
            }

            // 写入文件（使用安全写入）
            prepareNotice.setMessage("🧠 [阶段3/4] 写入文件...");
            const mindmapPath = calculateMindmapPath(videoDir, videoFile.basename);
            
            console.log(`[思维导图] 目标路径: ${mindmapPath}`);
            
            // 等待 vault 索引更新
            await sleep(200);
            
            let existingFile = this.app.vault.getAbstractFileByPath(mindmapPath);
            console.log(`[思维导图] 文件是否存在: ${existingFile instanceof TFile}`);

            try {
                if (existingFile instanceof TFile) {
                    // 使用安全写入（带重试和验证）
                    await safeWriteWithRetry(this.app.vault, existingFile, finalContent, 3);
                    console.log(`思维导图已更新: ${mindmapPath}`);
                } else {
                    // 再次检查，防止竞态条件
                    await sleep(100);
                    existingFile = this.app.vault.getAbstractFileByPath(mindmapPath);
                    
                    if (existingFile instanceof TFile) {
                        await safeWriteWithRetry(this.app.vault, existingFile, finalContent, 3);
                        console.log(`思维导图已更新(二次检查): ${mindmapPath}`);
                    } else {
                        // 使用安全创建
                        await safeCreateWithRetry(this.app.vault, mindmapPath, finalContent, 3);
                        console.log(`思维导图已生成: ${mindmapPath}`);
                    }
                }
            } catch (writeError) {
                console.error(`[思维导图] 写入失败: ${mindmapPath}`, writeError);
                throw new Error(`思维导图写入失败: ${writeError.message}`);
            }

            prepareNotice.setMessage("🧠 [阶段4/4] 转换为 Rich 模式...");

            // 🚀 自动转换为 Rich 模式
            await this.autoConvertToRich(mindmapPath, videoDir, videoFile.basename);
            
            prepareNotice.hide();
        } catch (error) {
            console.error("思维导图生成失败:", error);
            new Notice("⚠️ 思维导图生成失败，但转写已完成", 5000);
        }
    }

    /**
     * 🚀 自动将 basic 思维导图转换为 Rich 模式并删除 basic 文件
     * 通过调用 MarkMind 插件的命令实现
     */
    async autoConvertToRich(basicPath: string, videoDir: string, videoBasename: string) {
        const richPath = basicPath.replace(/\.md$/, '-rich.md');

        // 🔑 保存用户当前活动 leaf，转换完成后恢复
        const originalLeaf = this.app.workspace.activeLeaf;

        // 🚀 后台节流对抗：检测窗口是否在后台，如果是则临时激活
        // Chromium 在窗口处于后台时会节流 setTimeout/setInterval 和 requestAnimationFrame
        // 导致 MarkMind 的 Vue 组件渲染变慢甚至停滞
        let wasBackground = false;
        try {
            if (document.hidden) {
                wasBackground = true;
                console.log('[自动转换] 🔍 检测到窗口处于后台，临时激活以对抗 Chromium 节流');
                // 方法1：focus 窗口（Electron renderer 中可用）
                const electron = (window as any).require ? (window as any).require('electron') : null;
                if (electron?.remote?.getCurrentWindow) {
                    const win = electron.remote.getCurrentWindow();
                    win.focus();
                    console.log('[自动转换] ✅ Electron BrowserWindow.focus() 已调用');
                } else if (electron?.ipcRenderer) {
                    // 兜底：通过 IPC 请求主进程聚焦窗口
                    electron.ipcRenderer.send('silicon-transcriber-focus-window');
                    console.log('[自动转换] ✅ IPC focus 请求已发送');
                }
                // 方法2：DOM 层面激活（辅助手段）
                window.focus();
                document.body.focus();
                // 等待窗口激活生效
                await sleep(300);
            }
        } catch (e) {
            console.warn('[自动转换] 窗口激活失败（不影响主流程）:', e);
        }

        // 辅助：恢复用户原视图 + 清理临时 leaf
        const restoreAndCleanup = (tempLeaf?: WorkspaceLeaf) => {
            if (tempLeaf) {
                try { tempLeaf.detach(); } catch (e) { /* ignore */ }
            }
            if (originalLeaf) {
                try { this.app.workspace.setActiveLeaf(originalLeaf, { focus: true }); } catch (e) { /* ignore */ }
            }
        };

        let tempLeaf: WorkspaceLeaf | undefined;

        try {
            // 0. 删除可能已存在的旧 rich 文件，避免 MarkMind 弹出覆盖确认
            const existingRich = this.app.vault.getAbstractFileByPath(richPath);
            if (existingRich instanceof TFile) {
                await this.app.vault.delete(existingRich);
                console.log("[自动转换] 已删除旧 rich 文件:", richPath);
                await sleep(200);
            }

            // 1. 获取 basic 思维导图文件引用
            const basicFile = this.app.vault.getAbstractFileByPath(basicPath);
            if (!(basicFile instanceof TFile)) {
                console.warn("[自动转换] 无法找到 basic 思维导图文件:", basicPath);
                return;
            }

            // 2. 等待 metadataCache 完成 frontmatter 解析（最多 3s，每 100ms 检查一次）
            //    MarkMind monkey-patch 需要 frontmatter["mindmap-plugin"] 存在才会把 view 切成 mindmapview
            const FRONTMATTER_TIMEOUT_MS = 3000;
            const FRONTMATTER_INTERVAL_MS = 100;
            const frontmatterStart = Date.now();
            let hasFrontmatter = false;
            while (Date.now() - frontmatterStart < FRONTMATTER_TIMEOUT_MS) {
                const cache = this.app.metadataCache.getFileCache(basicFile);
                if (cache?.frontmatter?.["mindmap-plugin"]) {
                    hasFrontmatter = true;
                    break;
                }
                await sleep(FRONTMATTER_INTERVAL_MS);
            }
            console.log(`[自动转换] frontmatter 解析等待 ${Date.now() - frontmatterStart}ms，结果: ${hasFrontmatter ? '✅ 已解析' : '⚠️ 超时未解析'}`);

            // 3. 🔑 改动：打开 basic 文件，但不额外调用 setActiveLeaf(focus: true)
            //    openFile 本身已经会激活该 leaf，不需要额外 focus
            tempLeaf = this.app.workspace.getLeaf(true);
            await tempLeaf.openFile(basicFile);
            // 不再调用 setActiveLeaf(tempLeaf, { focus: true })
            await sleep(200); // 缩短等待时间
            console.log(`[自动转换] leaf 打开后 viewType: ${tempLeaf.view.getViewType()}`);

            // 4. 兜底：如果 MarkMind 自动切换钩子未生效，显式 setViewState 强切 mindmapview
            if (tempLeaf.view.getViewType() !== 'mindmapview') {
                console.log('[自动转换] 检测到未自动切换 mindmapview，尝试显式 setViewState');
                try {
                    await tempLeaf.setViewState({
                        type: 'mindmapview',
                        state: { file: basicPath },
                        popstate: true
                    } as any);
                    await sleep(200);
                    console.log(`[自动转换] setViewState 后 viewType: ${tempLeaf.view.getViewType()}`);
                } catch (e) {
                    console.warn('[自动转换] 显式 setViewState 失败:', e);
                }
            }

            // 5. 🔑 轮询等待 mindmap 渲染完成（分层检测）
            //    MarkMind 的渲染流程：
            //    a) Vue $mount → 创建 mindmap 实例 → view.mindmap 被赋值（对象存在但数据未就绪）
            //    b) mindmap.init(mindData) → 递归创建所有节点 → 构建 root.children 树
            //    c) 节点 measureDom/refreshDom → DOM 布局完成
            //    basicToRich() 需要读 this.mindmap.getData()，它遍历 root.children 获取节点数据
            //    如果在步骤 b 完成前执行命令，getData() 会返回不完整数据 → basicToRich 静默失败
            const MINDMAP_READY_TIMEOUT_MS = 10000;
            const MINDMAP_READY_INTERVAL_MS = 200;
            const readyStart = Date.now();
            let mindmapReady = false;
            let readyStage = '未检测到 mindmap 实例';
            while (Date.now() - readyStart < MINDMAP_READY_TIMEOUT_MS) {
                const view = tempLeaf.view as any;
                const mm = view?.mindmap;
                if (!mm) {
                    readyStage = 'mindmap 实例尚未创建';
                } else if (!mm.root) {
                    readyStage = 'mindmap 实例已创建，root 节点尚未就绪';
                } else if (!mm.root.children || mm.root.children.length === 0) {
                    readyStage = 'root 节点已创建，子节点树尚未构建';
                } else {
                    // root.children 有内容，说明节点树已构建完成
                    mindmapReady = true;
                    readyStage = `✅ 渲染完成 (root.children=${mm.root.children.length})`;
                    break;
                }
                await sleep(MINDMAP_READY_INTERVAL_MS);
            }
            console.log(`[自动转换] mindmap 就绪等待 ${Date.now() - readyStart}ms，结果: ${mindmapReady ? readyStage : '⚠️ 超时 - ' + readyStage}`);

            // 额外等待 DOM 布局稳定（节点树构建完成后，DOM 测量可能还在进行）
            if (mindmapReady) {
                await sleep(300);
                console.log(`[自动转换] 额外等待 300ms 供 DOM 布局稳定`);
            }

            // 7. 执行 MarkMind 转换命令（带重试）
            const commandId = 'obsidian-markmind:Change basic mode to rich mode';
            const cmdExists = !!(this.app as any).commands?.commands?.[commandId];
            console.log(`[自动转换] 命令是否存在: ${cmdExists}`);

            if (!cmdExists) {
                new Notice('❌ MarkMind 插件未启用或命令 ID 已变更，无法自动转换 rich 模式');
                restoreAndCleanup(tempLeaf);
                return;
            }

            // 执行转换并等待 rich 文件，带重试
            let richFile: TFile | null = null;
            const MAX_CONVERT_ATTEMPTS = 3;
            for (let convAttempt = 0; convAttempt < MAX_CONVERT_ATTEMPTS; convAttempt++) {
                if (convAttempt > 0) {
                    console.log(`[自动转换] 第 ${convAttempt + 1} 次尝试执行转换命令...`);
                    // 确保临时 leaf 还活着且是 mindmapview
                    if (tempLeaf.view.getViewType() !== 'mindmapview') {
                        try {
                            await tempLeaf.setViewState({
                                type: 'mindmapview',
                                state: { file: basicPath },
                                popstate: true
                            } as any);
                            await sleep(300);
                        } catch (e) {
                            console.warn(`[自动转换] 重新设置 mindmapview 失败:`, e);
                        }
                    }
                    // 🔑 重试前等待 mindmap 重新就绪（可能因前一次失败导致状态不稳定）
                    const view = tempLeaf.view as any;
                    const mm = view?.mindmap;
                    if (mm && mm.root && mm.root.children && mm.root.children.length > 0) {
                        console.log(`[自动转换] 重试前 mindmap 状态正常 (root.children=${mm.root.children.length})`);
                    } else {
                        console.warn(`[自动转换] 重试前 mindmap 状态异常，等待 1s 后继续...`);
                        await sleep(1000);
                    }
                }

                // 🚀 优先直接调用 mindmapview 的 basicToRich()，绕过 getActiveViewOfType 依赖
                // executeCommandById 内部调用 getActiveViewOfType，它只认活动 leaf
                // 直接拿 view 实例调用可以避免这个限制
                let convertCalled = false;
                try {
                    const view = tempLeaf.view as any;
                    if (view && typeof view.basicToRich === 'function') {
                        console.log(`[自动转换] 直接调用 view.basicToRich() (尝试 ${convAttempt + 1}/${MAX_CONVERT_ATTEMPTS})`);
                        view.basicToRich();
                        convertCalled = true;
                    } else {
                        console.warn(`[自动转换] view 上未找到 basicToRich 方法，回退到 executeCommandById`);
                    }
                } catch (e) {
                    console.warn(`[自动转换] 直接调用 basicToRich 失败:`, e);
                }

                // 兜底：如果直接调用失败，用 executeCommandById
                if (!convertCalled) {
                    (this.app as any).commands.executeCommandById(commandId);
                    console.log(`[自动转换] 已执行命令: ${commandId} (尝试 ${convAttempt + 1}/${MAX_CONVERT_ATTEMPTS})`);
                }

                // 等待 rich 文件生成（每次最多等 15 秒）
                for (let i = 0; i < 30; i++) {
                    await sleep(500);
                    const f = this.app.vault.getAbstractFileByPath(richPath);
                    if (f instanceof TFile) {
                        richFile = f;
                        console.log(`[自动转换] ✅ 第 ${i + 1} 次轮询命中 rich 文件 (尝试 ${convAttempt + 1})`);
                        break;
                    }
                    if ((i + 1) % 6 === 0) {
                        console.log(`[自动转换] 轮询进度: ${(i + 1) * 500}ms / 15000ms (尝试 ${convAttempt + 1})，仍未找到 ${richPath}`);
                    }
                }

                if (richFile) break;
                console.warn(`[自动转换] 第 ${convAttempt + 1} 次转换未生成 rich 文件`);
            }

            if (!richFile) {
                console.warn("[自动转换] Rich 文件未在预期时间内生成:", richPath);
                new Notice('⚠️ 思维导图自动转换 rich 模式失败，请手动在 basic 视图上按 Ctrl+P → "Change basic mode to rich mode"', 8000);
                restoreAndCleanup(tempLeaf);
                return;
            }

            console.log("[自动转换] Rich 文件已生成:", richFile);

            // 9. 删除 basic 文件
            await this.app.vault.delete(basicFile);
            console.log("[自动转换] 已删除 basic 文件:", basicPath);

            // 10. 🔑 恢复用户原视图 + 关闭临时 leaf
            restoreAndCleanup(tempLeaf);
            tempLeaf = undefined; // 已清理，避免 catch 重复清理

            new Notice("🚀 思维导图已自动转换为 Rich 模式", 3000);
        } catch (error) {
            console.error("[自动转换] 失败:", error);
            restoreAndCleanup(tempLeaf);
            new Notice('⚠️ 思维导图自动转换失败，请手动操作: Ctrl+P → "Change basic mode to rich mode"', 8000);
        }
    }

    // ==================== 辅助方法 ====================

    /**
     * 智能查找目标笔记 Leaf (优化后)
     */
    findTargetNoteLeaf(): WorkspaceLeaf | null {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (!activeLeaf) return null;

        const file = (activeLeaf.view as any).file as TFile;
        if (!file) return null;

        // 情况A: 当前就是笔记
        if (activeLeaf.view.getViewType() === 'markdown' && file.name.startsWith('📝')) {
            return activeLeaf;
        }

        // 情况B: 当前是媒体文件，查找其关联笔记
        if (this.isVideoView(activeLeaf.view)) {
            const videoDir = file.parent?.path === '/' ? '' : file.parent?.path || '';
            const { notePath } = calculateNotePaths(videoDir, file.basename);

            let foundLeaf: WorkspaceLeaf | null = null;
            this.app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.view.getViewType() === 'markdown') {
                    const leafFile = (leaf.view as any).file as TFile;
                    if (leafFile && leafFile.path === notePath) {
                        foundLeaf = leaf;
                    }
                }
            });
            return foundLeaf;
        }

        return null; // 其他情况不处理
    }

    /**
     * 从笔记中查找音频/视频文件
     */
    findAudioFileInNote(view: MarkdownView): TFile | null {
        const c = this.app.metadataCache.getFileCache(view.file!);
        if (!c?.embeds) return null;
        for (const e of c.embeds) {
            const f = this.app.metadataCache.getFirstLinkpathDest(e.link, view.file!.path);
            if (f && isSupportedMediaExtension(f.extension)) return f;
        }
        return null;
    }

    /**
     * 打开或创建转写笔记（重写后的稳定版本）
     */
    async openTranscriptNote(videoFile: TFile): Promise<{ editor: Editor; leaf: WorkspaceLeaf }> {
        // 1. 统一使用工具函数计算路径
        const videoDir = videoFile.parent?.path === '/' ? '' : videoFile.parent?.path || '';
        const { noteFolder, notePath } = calculateNotePaths(videoDir, videoFile.basename);

        // 2. 确保文件夹存在（幂等操作）
        const existingFolder = this.app.vault.getAbstractFileByPath(noteFolder);
        if (!existingFolder) {
            try {
                await this.app.vault.createFolder(noteFolder);
            } catch (err) {
                // 忽略 "folder already exists" 错误
                if (!err.message?.includes('already exists')) {
                    console.error('创建笔记文件夹失败:', err);
                    throw err; // 抛出其他严重错误
                }
            }
        } else if (!(existingFolder instanceof TFolder)) {
            throw new Error(`路径已存在且不是文件夹: ${noteFolder}`);
        }
       
        // 3. 获取或创建笔记文件（核心稳定逻辑，使用安全创建）
        let noteFile = this.app.vault.getAbstractFileByPath(notePath);
        if (!(noteFile instanceof TFile)) {
            try {
                // 兼容代理 TFile：getResourcePath 可能失败
                let resourceUrl: string;
                try {
                    resourceUrl = this.app.vault.getResourcePath(videoFile);
                    if (!resourceUrl || resourceUrl.includes('[object') || resourceUrl.includes('undefined')) {
                        throw new Error('getResourcePath returned invalid URL');
                    }
                } catch {
                    resourceUrl = videoFile.path;
                }
                noteFile = await safeCreateWithRetry(
                    this.app.vault,
                    notePath,
                    `![](${resourceUrl.replace(/ /g, '%20')})\n\n`,
                    3
                );
            } catch (err) {
                console.error('创建笔记文件失败:', err);
                throw new Error(`无法创建笔记文件: ${notePath} - ${err.message}`);
            }
        }
        const targetFile = noteFile as TFile;

        // 4. 查找或创建窗口来显示文件
        let targetLeaf: WorkspaceLeaf | null = null;
        // 优先在所有叶子中寻找是否已打开
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.file?.path === targetFile.path) {
                targetLeaf = leaf;
            }
        });

        if (targetLeaf) {
            // 如果找到了，就激活它
            this.app.workspace.revealLeaf(targetLeaf);
        } else {
            // 如果没找到，就在右侧打开一个新的
            targetLeaf = this.app.workspace.getRightLeaf(false);
            if (!targetLeaf) targetLeaf = this.app.workspace.getLeaf('split', 'vertical');
            await targetLeaf.openFile(targetFile);
        }

        // 5. 确保窗口处于源码模式以供编辑
        const view = targetLeaf.view as MarkdownView;
        const state = targetLeaf.getViewState();
        if (state.state?.mode !== 'source') {
            const newState = { ...state, state: { ...(state.state ?? {}), mode: 'source' } };
            await targetLeaf.setViewState(newState, { focus: true });
        } else {
            this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
        }

        return { editor: view.editor, leaf: targetLeaf };
    }

    /**
     * 判断是否为视频/音频视图
     */
    isVideoView(view: any): boolean {
        const t = view.getViewType();
        const f = view.file;
        const ext = f?.extension?.toLowerCase();
        return ['video', 'audio', 'media-view'].includes(t) ||
            (ext && SUPPORTED_MEDIA_EXTENSIONS.includes(ext as any));
    }

    /**
     * 从现有笔记重新生成思维导图
     */
    async regenerateMindmapFromNote() {
         const activeLeaf = this.app.workspace.activeLeaf;
         if (!activeLeaf || activeLeaf.view.getViewType() !== 'markdown') {
             new Notice("❌ 请打开智能笔记文件");
             return;
         }

         const noteFile = (activeLeaf.view as any).file as TFile;
         if (!noteFile) return;

         try {
             const content = await this.app.vault.read(noteFile);
             
             // 尝试查找原始视频文件
             const videoFile = await this.findVideoFileFromNote(noteFile, content);
             if (!videoFile) {
                 new Notice("❌ 无法找到关联的视频文件，请确保笔记头部包含视频链接或位于正确目录", 5000);
                 return;
             }
             
             const chapters = this.parseChaptersFromNote(content);
             if (chapters.length === 0) {
                 new Notice("❌ 未识别到章节数据。请确认笔记格式包含 '#### ⏱️ MM:SS 标题'", 5000);
                 return;
             }
             
             this.allChapterSummaries = chapters;
             
             new Notice(`🧠 识别到 ${chapters.length} 个章节，开始生成思维导图（含自动 Rich 转换）...`);
             await this.generateMindMap(videoFile);
             
         } catch (e) {
             console.error(e);
             new Notice(`❌ 错误: ${e.message}`);
         }
    }

    /**
     * 辅助：从笔记内容查找视频文件
     */
    async findVideoFileFromNote(noteFile: TFile, content: string): Promise<TFile | null> {
        // 策略 1: 从头部引用查找 > [!info] [[文件名.mp4]]
        const linkMatch = content.match(/^> \[!info\] \[\[(.*?)\]\]/m);
        if (linkMatch) {
            const linkText = linkMatch[1].split('|')[0]; // 处理可能的别名
            const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkText, noteFile.path);
            if (linkedFile instanceof TFile) return linkedFile;
        }

        // 策略 2: 从智能笔记文件名推断
        const baseName = noteFile.basename.replace(/^📝/, '');
        if (baseName !== noteFile.basename) {
            const possibleNames = SUPPORTED_MEDIA_EXTENSIONS.map(ext => `${baseName}.${ext}`);
            
            // 2.1 同级目录
            if (noteFile.parent) {
                 for (const name of possibleNames) {
                     const f = this.app.vault.getAbstractFileByPath(`${noteFile.parent.path}/${name}`);
                     if (f instanceof TFile) return f;
                 }
            }
            
            // 2.2 上级目录
            if (noteFile.parent && noteFile.parent.parent) {
                const parentPath = noteFile.parent.parent.path === '/' ? '' : noteFile.parent.parent.path;
                for (const name of possibleNames) {
                   const p = parentPath ? `${parentPath}/${name}` : name;
                   const f = this.app.vault.getAbstractFileByPath(p);
                   if (f instanceof TFile) return f;
                }
            }
        }
        return null;
    }

    /**
     * 辅助：解析 Markdown 章节
     */
    parseChaptersFromNote(content: string): ChapterSummary[] {
        const chapters: ChapterSummary[] = [];
        const lines = content.split('\n');
        
        let currentChapter: Partial<ChapterSummary> | null = null;
        let keyPointsBuffer: string[] = [];
        const headerRegex = /^#{2,4}\s+⏱️\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+(.*?)(?:\s+🎬|$)/;

        const finalizeChapter = () => {
            if (currentChapter && currentChapter.timestamp && currentChapter.title) {
                if (keyPointsBuffer.length > 0) {
                    currentChapter.key_points = [...keyPointsBuffer];
                    currentChapter.summary = keyPointsBuffer.join('\n');
                }
                chapters.push(currentChapter as ChapterSummary);
            }
        }

        for (const line of lines) {
            const match = line.match(headerRegex);
            if (match) {
                finalizeChapter();
                currentChapter = {
                    timestamp: match[1],
                    title: match[2].trim(),
                };
                keyPointsBuffer = [];
                continue;
            }

            if (currentChapter) {
                if (line.trim().startsWith('>')) continue; // Ignore quotes
                if (!line.trim()) continue; // Ignore empty lines
                // 提取 - 开头的要点行作为 key_points
                const pointMatch = line.match(/^\s*[-*+]\s+(.+)$/);
                if (pointMatch) {
                    keyPointsBuffer.push(pointMatch[1].trim());
                }
            }
        }
        finalizeChapter();
        return chapters;
    }
}
