"use strict";
/**
 * ⚙️ 设置模块
 * 定义插件设置的数据模型和默认值
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = void 0;
exports.maskApiKey = maskApiKey;
/**
 * 默认设置值（不含 API Key，Key 从 secrets.json 迁移或用户手动输入）
 */
exports.DEFAULT_SETTINGS = {
    // ASR 配置
    asrApiKey1: '',
    asrApiKey2: '',
    asrBaseUrl: 'https://api.siliconflow.cn/v1/audio/transcriptions',
    asrModel: 'TeleAI/TeleSpeechASR',
    // 主 LLM（OpenCode DeepSeek V4 Pro）
    llmApiKey: '',
    llmBaseUrl: 'https://opencode.ai/zen/go/v1/chat/completions',
    llmModel: 'deepseek-v4-pro',
    // LLM 额外请求体参数（JSON 字符串，留空则不发送任何额外参数；OpenCode 默认: {"reasoning_effort":"xhigh","thinking":{"type":"enabled"}}）
    llmExtraBody: '',
    // 任务报告 LLM（商汤 DeepSeek-V4-Flash）
    reportLlmApiKey: '',
    reportLlmBaseUrl: 'https://token.sensenova.cn/v1/chat/completions',
    reportLlmModel: 'deepseek-v4-flash',
    // 备用任务报告 LLM（京东云 Kimi-K2.5）
    reportFallbackApiKey: '',
    reportFallbackBaseUrl: 'https://modelservice.jdcloud.com/coding/openai/v1/chat/completions',
    reportFallbackModel: 'Kimi-K2.5',
    // 全局分析 LLM（OpenCode DeepSeek V4 Pro）
    globalLlmApiKey: '',
    globalLlmBaseUrl: 'https://opencode.ai/zen/go/v1/chat/completions',
    globalLlmModel: 'deepseek-v4-pro',
    // 思维导图专用 LLM（空字符串表示走回退链：全局分析 → 章节分析）
    mindmapLlmApiKey: '',
    mindmapLlmBaseUrl: '',
    mindmapLlmModel: '',
    // 处理参数
    chunkSize: 420,
    batchSize: 1
};
/**
 * 掩码 API Key，只显示前4后4
 * @param key 原始 API Key
 * @returns 掩码后的 Key，如 sk-****xxxx
 */
function maskApiKey(key) {
    if (!key || key.length <= 8)
        return key;
    return key.slice(0, 4) + '****' + key.slice(-4);
}
