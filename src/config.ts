/**
 * 🔧 配置模块
 * 集中管理所有 API 配置和处理参数
 */

import { SiliconTranscriberSettings } from './settings';

// ==================== 更新配置的方法 ====================

/**
 * 从 secrets.json 对象更新配置（向后兼容，用于 secrets.json 迁移）
 */
export function updateConfigs(secrets: any) {
  ASR_CONFIG.API_KEYS = [];
  if (secrets?.ASR_API_KEY1) ASR_CONFIG.API_KEYS.push(secrets.ASR_API_KEY1);
  if (secrets?.ASR_API_KEY2) ASR_CONFIG.API_KEYS.push(secrets.ASR_API_KEY2);
  if (secrets?.ASR_API_KEY) ASR_CONFIG.API_KEYS.push(secrets.ASR_API_KEY);

  // 如果没有提供任何 API key，回退使用单一环境变量（如果有的话）
  if (ASR_CONFIG.API_KEYS.length > 0) {
    ASR_CONFIG.API_KEY = ASR_CONFIG.API_KEYS[0];
  }

  if (secrets?.LLM_API_KEY) {
    LLM_PROVIDERS[0].API_KEY = secrets.LLM_API_KEY;
    LLM_CONFIG.API_KEY = secrets.LLM_API_KEY; // 保留向后兼容
  }
}

/**
 * 从设置对象更新所有运行时配置（设置优先级最高）
 * @param settings 插件设置
 */
export function updateConfigsFromSettings(settings: SiliconTranscriberSettings): void {
  // --- ASR 配置 ---
  ASR_CONFIG.API_KEYS = [];
  if (settings.asrApiKey1) ASR_CONFIG.API_KEYS.push(settings.asrApiKey1);
  if (settings.asrApiKey2) ASR_CONFIG.API_KEYS.push(settings.asrApiKey2);
  if (ASR_CONFIG.API_KEYS.length > 0) {
    ASR_CONFIG.API_KEY = ASR_CONFIG.API_KEYS[0];
  }
  if (settings.asrBaseUrl) ASR_CONFIG.BASE_URL = settings.asrBaseUrl;
  if (settings.asrModel) ASR_CONFIG.MODEL = settings.asrModel;

  // --- 主 LLM（章节分析 + 思维导图）---
  if (settings.llmApiKey) {
    LLM_PROVIDERS[0].API_KEY = settings.llmApiKey;
    LLM_CONFIG.API_KEY = settings.llmApiKey;           // 向后兼容
  }
  if (settings.llmBaseUrl) {
    LLM_PROVIDERS[0].BASE_URL = settings.llmBaseUrl;
    LLM_CONFIG.BASE_URL = settings.llmBaseUrl;
  }
  if (settings.llmModel) {
    LLM_PROVIDERS[0].MODEL = settings.llmModel;
    LLM_CONFIG.MODEL = settings.llmModel;
  }

  // --- LLM 额外请求体参数（EXTRA_BODY）---
  // 从设置 JSON 字符串解析，更新 LLM_PROVIDERS[0].EXTRA_BODY
  // 空字符串 → 清空 EXTRA_BODY（不发送任何额外参数）
  // 有效 JSON → 解析并设置
  if (settings.llmExtraBody !== undefined) {
    if (settings.llmExtraBody.trim() === '') {
      LLM_PROVIDERS[0].EXTRA_BODY = undefined;
      console.log('🔧 EXTRA_BODY 已清空（无额外请求体参数）');
    } else {
      try {
        LLM_PROVIDERS[0].EXTRA_BODY = JSON.parse(settings.llmExtraBody);
        console.log('🔧 EXTRA_BODY 已从设置更新:', JSON.stringify(LLM_PROVIDERS[0].EXTRA_BODY));
      } catch (e) {
        console.warn('⚠️ llmExtraBody JSON 解析失败，保留原 EXTRA_BODY:', e);
      }
    }
  }

  // --- 全局分析 LLM ---
  if (settings.globalLlmApiKey) LLM_GLOBAL_CONFIG.API_KEY = settings.globalLlmApiKey;
  if (settings.globalLlmBaseUrl) LLM_GLOBAL_CONFIG.BASE_URL = settings.globalLlmBaseUrl;
  if (settings.globalLlmModel) LLM_GLOBAL_CONFIG.MODEL = settings.globalLlmModel;

  // --- 思维导图专用 LLM（三级回退：mindmap 自身 → global → LLM_PROVIDERS[0]）---
  LLM_MINDMAP_CONFIG.API_KEY = settings.mindmapLlmApiKey || LLM_GLOBAL_CONFIG.API_KEY || LLM_PROVIDERS[0].API_KEY;
  LLM_MINDMAP_CONFIG.BASE_URL = settings.mindmapLlmBaseUrl || LLM_GLOBAL_CONFIG.BASE_URL || LLM_PROVIDERS[0].BASE_URL;
  LLM_MINDMAP_CONFIG.MODEL = settings.mindmapLlmModel || LLM_GLOBAL_CONFIG.MODEL || LLM_PROVIDERS[0].MODEL;
  LLM_MINDMAP_CONFIG.EXTRA_BODY = LLM_PROVIDERS[0].EXTRA_BODY || {};

  // --- 任务报告 LLM ---
  if (settings.reportLlmApiKey) LLM_REPORT_CONFIG.API_KEY = settings.reportLlmApiKey;
  if (settings.reportLlmBaseUrl) LLM_REPORT_CONFIG.BASE_URL = settings.reportLlmBaseUrl;
  if (settings.reportLlmModel) LLM_REPORT_CONFIG.MODEL = settings.reportLlmModel;

  // --- 备用任务报告 LLM ---
  if (settings.reportFallbackApiKey) LLM_REPORT_FALLBACK.API_KEY = settings.reportFallbackApiKey;
  if (settings.reportFallbackBaseUrl) LLM_REPORT_FALLBACK.BASE_URL = settings.reportFallbackBaseUrl;
  if (settings.reportFallbackModel) LLM_REPORT_FALLBACK.MODEL = settings.reportFallbackModel;

  // --- 处理参数 ---
  if (settings.chunkSize >= 60 && settings.chunkSize <= 1800) {
    (PROCESSING_CONFIG as any).CHUNK_SIZE = settings.chunkSize;
  }
  if (settings.batchSize >= 1 && settings.batchSize <= 10) {
    (PROCESSING_CONFIG as any).BATCH_SIZE = settings.batchSize;
  }

  console.log('✅ 运行时配置已从设置更新');
}

// ==================== 语音转文字配置 ====================
export const ASR_CONFIG = {
  API_KEYS: [] as string[],
  API_KEY: '',
  BASE_URL: 'https://api.siliconflow.cn/v1/audio/transcriptions',
  MODEL: 'TeleAI/TeleSpeechASR'
};

export interface LLMProvider {
  /** 用于日志显示的 provider 友好名称 */
  NAME: string;
  API_KEY: string;
  BASE_URL: string;
  MODEL: string;
  /**
   * provider 专属请求体字段（如 OpenCode 的 reasoning_effort / thinking）。
   * 这些字段会在请求时展开进 body；未设置则不发送，避免污染其他 provider。
   */
  EXTRA_BODY?: Record<string, any>;
}

// ==================== AI 总结多模型配置 ====================
// 索引 0: Ollama Gateway → VolcEngine Pool (主力 LLM，直连本地网关)
// 索引 1-3: 魔搭社区 (已禁用，不再使用)
export const LLM_PROVIDERS: LLMProvider[] = [
  {
    NAME: 'Ollama Gateway Volc Pool',
    API_KEY: 'ollama-gateway',
    BASE_URL: 'http://127.0.0.1:11434/v1/chat/completions',
    MODEL: 'volc-pool'
  },
  {
    NAME: 'ModelScope DeepSeek R1',
    API_KEY: 'ms-02393c7a-70ad-4a47-a52d-8cb8971dec14',
    BASE_URL: 'https://api-inference.modelscope.cn/v1/chat/completions',
    MODEL: 'deepseek-ai/DeepSeek-R1-0528'
  },
  {
    NAME: 'ModelScope DeepSeek R1 (备2)',
    API_KEY: 'ms-88441022-29b2-4b15-805a-f3ac252fe99c',
    BASE_URL: 'https://api-inference.modelscope.cn/v1/chat/completions',
    MODEL: 'deepseek-ai/DeepSeek-R1-0528'
  },
  {
    NAME: 'ModelScope DeepSeek R1 (备3)',
    API_KEY: 'ms-9acac3e9-cc71-4ff9-9751-8f0b0e9506fe',
    BASE_URL: 'https://api-inference.modelscope.cn/v1/chat/completions',
    MODEL: 'deepseek-ai/DeepSeek-R1-0528'
  }
];

// 全局分析专用配置 (直连 Ollama Gateway → VolcEngine Pool)
export const LLM_GLOBAL_CONFIG = {
  API_KEY: 'ollama-gateway',
  BASE_URL: 'http://127.0.0.1:11434/v1/chat/completions',
  MODEL: 'volc-pool'
};

// 思维导图专用配置（独立于 LLM_PROVIDERS[0] 和 LLM_GLOBAL_CONFIG）
export const LLM_MINDMAP_CONFIG = {
  API_KEY: '',
  BASE_URL: '',
  MODEL: '',
  EXTRA_BODY: {} as Record<string, unknown>
};

// 任务报告专用配置 (商汤 DeepSeek-V4-Flash 优先)
export const LLM_REPORT_CONFIG = {
  API_KEY: 'sk-QGUSD3Wrb5z253YcQAPwXumfhOJpjiUX',
  BASE_URL: 'https://token.sensenova.cn/v1/chat/completions',
  MODEL: 'deepseek-v4-flash'
};

// 任务报告备用配置 (京东云 Kimi-K2.5)
export const LLM_REPORT_FALLBACK = {
  API_KEY: 'pk-8ca7ea9d-dba0-463a-83b6-002ae8c68510',
  BASE_URL: 'https://modelservice.jdcloud.com/coding/openai/v1/chat/completions',
  MODEL: 'Kimi-K2.5'
};

// 向后兼容的单模型配置 (已弃用，保留向后兼容，现指向 Ollama Gateway)
export const LLM_CONFIG = {
  API_KEY: 'ollama-gateway',
  BASE_URL: 'http://127.0.0.1:11434/v1/chat/completions',
  MODEL: 'volc-pool'
};

// ==================== 处理参数 ====================
export const PROCESSING_CONFIG = {
/** 每个音频分片的秒数 (7分钟 — 测试最优值，ASR速率4.08x) */
CHUNK_SIZE: 420,
/** 每批次处理的分片数量 */
BATCH_SIZE: 1
} as const;

// ==================== 支持的媒体格式 ====================
export const SUPPORTED_MEDIA_EXTENSIONS = ['mp4', 'mp3', 'wav', 'm4a', 'mov'] as const;

// ==================== 文件命名规则 ====================
export const FILE_NAMING = {
  NOTE_FOLDER: '📝智能笔记',
  NOTE_PREFIX: '📝',
  MINDMAP_SUFFIX: '🧠'
} as const;
