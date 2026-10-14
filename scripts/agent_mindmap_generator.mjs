#!/usr/bin/env node
/**
 * agent_mindmap_generator.mjs
 * 
 * 将 Silicon Transcriber 插件内的思维导图生成逻辑解耦为独立脚本/API，
 * 供外部 Agent、CLI 脚本或自动化工作流直接调用。
 * 
 * 默认配置：
 * - 优先调用云服务器 8045 上的 gemini-3.8-flash-high 高质量思考模式
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const DATA_JSON_PATH = path.join(PLUGIN_ROOT, 'data.json');

/** 默认思维导图生成系统提示词 */
export const MINDMAP_SYSTEM_PROMPT = 
  "You are a professional mindmap outline generator for graduate entrance exam (考研) circuit theory. " +
  "Output pure Markdown. NEVER output HTML tags. NEVER output code fences (```). " +
  "以【题型分类】、【考点二轮总结】为主干，深度融入【做题技巧、避坑要点、速算公式】。 " +
  "层级结构必须清晰工整、绝不杂乱。使用精炼有力的短语，适度搭配 Emoji 增强视觉辨识度。 " +
  "请使用中文输出内容。公式请使用标准 LaTeX 行内公式（$...$）。";

/**
 * 加载模型配置：优先云服务器 8045 的 gemini-3.8-flash-high
 */
export function loadPluginConfig() {
  const defaultUrl = 'http://115.29.222.138:8045/v1/chat/completions';
  const defaultKey = 'sk-2ab6a5330d2b4c62844586978907a256';
  const defaultModel = 'gemini-3.8-flash-high'; // 用户明令使用 high 思考模式

  // 优先级：显式环境变量 > 云服务器 8045 gemini-3.8-flash-high
  const baseUrl = process.env.MINDMAP_LLM_URL || defaultUrl;
  const apiKey = process.env.MINDMAP_LLM_KEY || defaultKey;
  const model = process.env.MINDMAP_LLM_MODEL || defaultModel;

  return { baseUrl, apiKey, model };
}

/**
 * 组装思维导图生成 Prompt
 */
export function buildMindmapPrompt({ title, content, referenceNotes = '', customPrompt = '' }) {
  let prompt = `请针对【${title}】绘制一份高质量的考研二轮复习思维导图大纲（纯 Markdown 格式，不要转 rich 模式）。\n\n`;
  prompt += `【定位与核心要求】：\n`;
  prompt += `1. 风格定位：对标考研数学/电路二轮高分复习导图，以【题型突破】与【核心考点精粹】为主线。\n`;
  prompt += `2. 深度融入【做题技巧】与【解题陷阱】：每个题型下必须提炼出破题标志、关键公式、推导步、避坑点。\n`;
  prompt += `3. 层次严谨不杂乱：\n`;
  prompt += `   - # ${title}（根节点）\n`;
  prompt += `   - ## 模块/题型（二级节点，如：## 题型一 KCL/KVL直接应用、## 核心知识与方法体系）\n`;
  prompt += `   - ### 核心考法/模型/破题法则（三级节点）\n`;
  prompt += `   - - 四级要点与做题技巧（以 - **加粗关键词**：要点说明 的形式，条理清晰）\n`;
  prompt += `4. 严禁输出任何 HTML 标签，严禁使用任何形式的代码块（\`\`\`）包裹，直接输出大纲文本。\n`;
  prompt += `5. 数学物理公式严格使用 LaTeX 行内公式（如 $U_{oc}$, $R_{eq}$）。\n\n`;

  if (customPrompt) {
    prompt += `【额外定制指示】：\n${customPrompt}\n\n`;
  }

  if (referenceNotes && referenceNotes.trim()) {
    prompt += `【一轮/基础课智能笔记与导图关联要点参考】：\n${referenceNotes.slice(0, 5000)}\n\n`;
  }

  prompt += `【二轮考点深度解析稿原件】：\n${content}\n\n`;
  prompt += `请直接输出思维导图大纲：`;

  return prompt;
}

/**
 * 清洗模型返回内容
 */
export function cleanMindmapText(rawText) {
  let text = rawText || '';
  // 过滤 think 标签
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  // 过滤 markdown 代码块
  text = text.replace(/^```(markdown|markmap)?\s*/im, '').replace(/\s*```$/m, '').trim();
  // 规范连续空行
  text = text.replace(/\n{3,}/g, '\n\n');
  return text;
}

/**
 * 核心生成函数
 */
export async function generateMindmapOutline({
  title,
  content,
  referenceNotes = '',
  customPrompt = '',
  configOverrides = {}
}) {
  const cfg = { ...loadPluginConfig(), ...configOverrides };
  const prompt = buildMindmapPrompt({ title, content, referenceNotes, customPrompt });

  console.log(`[AgentMindmap] 调用模型: ${cfg.model} @ ${cfg.baseUrl}`);

  const payload = {
    model: cfg.model,
    messages: [
      { role: "system", content: MINDMAP_SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ],
    temperature: 0.25,
    max_tokens: 16384
  };

  const resp = await fetch(cfg.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`LLM 请求失败 HTTP ${resp.status}: ${errText}`);
  }

  const json = await resp.json();
  const choice = json.choices?.[0];
  const rawText = choice?.message?.content || choice?.delta?.content || '';

  if (!rawText.trim()) {
    throw new Error("模型返回了空内容");
  }

  return cleanMindmapText(rawText);
}

// CLI 执行入口
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = process.argv.slice(2);
  let inputFile = null;
  let outputFile = null;
  let title = '思维导图';
  let refFile = null;
  let customPrompt = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' || args[i] === '-i') inputFile = args[++i];
    else if (args[i] === '--output' || args[i] === '-o') outputFile = args[++i];
    else if (args[i] === '--title' || args[i] === '-t') title = args[++i];
    else if (args[i] === '--ref' || args[i] === '-r') refFile = args[++i];
    else if (args[i] === '--custom-prompt' || args[i] === '-p') customPrompt = args[++i];
  }

  if (!inputFile) {
    console.log(`用法: node agent_mindmap_generator.mjs --input <输入文件> --output <输出文件> [--title <标题>] [--ref <参考文件>]`);
    process.exit(0);
  }

  const content = fs.readFileSync(inputFile, 'utf-8');
  let referenceNotes = '';
  if (refFile && fs.existsSync(refFile)) {
    referenceNotes = fs.readFileSync(refFile, 'utf-8');
  }

  generateMindmapOutline({ title, content, referenceNotes, customPrompt })
    .then(result => {
      if (outputFile) {
        fs.mkdirSync(path.dirname(outputFile), { recursive: true });
        fs.writeFileSync(outputFile, result, 'utf-8');
        console.log(`✅ 导图大纲已成功生成并保存至: ${outputFile}`);
      } else {
        console.log(result);
      }
    })
    .catch(err => {
      console.error(`❌ 生成失败: ${err.message}`);
      process.exit(1);
    });
}
