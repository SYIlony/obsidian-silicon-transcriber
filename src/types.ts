/**
 * 🔷 类型定义模块
 * 定义插件中使用的所有接口和类型
 */

import { Editor, WorkspaceLeaf } from 'obsidian';


/**
 * 转写模式：
 * - 'standard': 常规全量转写（保留知识点、定义推导与例题具体演算过程）
 * - 'exam_points': 二轮考点转写（数学强化专用：纯考点+题型破题技巧+一行母题特征，剔除例题具体演算过程）
 */
export type TranscribeMode = 'standard' | 'exam_points';
/**
 * ASR 返回的单个句段
 */
export interface Segment {
    start: number;
    end: number;
    text: string;
}

/**
 * AI 批次处理任务
 */
export interface BatchJob {
    segments: Segment[];
    batchIndex: number;
    anchorId: string;
    /** 由上一批次写入的截断内容（并发安全：直接写入 job 对象，不走实例变量） */
    incomingLeftover?: string;
}

/**
 * 章节摘要数据
 * key_points 为阶段1输出的结构化要点数组（替代旧 summary 字段）
 */
export interface ChapterSummary {
    timestamp: string;
    title: string;
    summary: string;           // 向后兼容：旧格式或全局阶段未升级时的回退字段
    key_points?: string[];     // 新增：详细要点数组（阶段1主输出）
}

/**
 * 模糊搜索中的单行数据
 */
export interface SegmentLine {
    line: number;
    text: string;
    preview: string;
}

/**
 * ASR API 响应结构
 */
export interface ASRResponse {
    text?: string;
    segments?: Array<{
        start: number;
        end: number;
        text: string;
    }>;
}

/**
 * LLM API 响应结构
 */
export interface LLMResponse {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
}

/**
 * 打开笔记的返回结果
 */
export interface OpenNoteResult {
    editor: Editor;
    leaf: WorkspaceLeaf;
}

/**
 * 全局笔记元数据（阶段2的 ===META=== 块输出）
 */
export interface NoteMetaData {
    exam_focus: string;         // 考试核心总览
    emphasis: string[];         // 老师强调的注意点
    examples: ExampleItem[];    // 例题与方法
}

/**
 * 例题条目
 */
export interface ExampleItem {
    timestamp: string;
    topic: string;
    method: string;
}

/**
 * 全局校验结果（阶段2完整输出）
 */
export interface GlobalCorrectionResult {
    chapters: ChapterSummary[];   // 重组后的知识点
    metaData: NoteMetaData;       // 全局元数据
}

