/**
 * 🔌 index.ts - 模块统一导出
 * 方便 main.ts 一次性导入所有需要的模块
 */

// 类型定义
export * from './types';

// 配置
export * from './config';

// 设置
export * from './settings';

// 设置界面
export * from './settings-tab';

// 工具函数
export * from './utils';

// ASR 模块
export * from './asr';

// LLM 模块
export * from './llm';

// 批量转写模态框
export * from './batch-modal';

// 局部思维导图（分块选择 + 追加到已有导图）
export * from './partial-mindmap';
