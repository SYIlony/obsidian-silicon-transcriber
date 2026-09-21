"use strict";
/**
 * 🔌 index.ts - 模块统一导出
 * 方便 main.ts 一次性导入所有需要的模块
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
// 类型定义
__exportStar(require("./types"), exports);
// 配置
__exportStar(require("./config"), exports);
// 设置
__exportStar(require("./settings"), exports);
// 设置界面
__exportStar(require("./settings-tab"), exports);
// 工具函数
__exportStar(require("./utils"), exports);
// ASR 模块
__exportStar(require("./asr"), exports);
// LLM 模块
__exportStar(require("./llm"), exports);
// 批量转写模态框
__exportStar(require("./batch-modal"), exports);
// 局部思维导图（分块选择 + 追加到已有导图）
__exportStar(require("./partial-mindmap"), exports);
