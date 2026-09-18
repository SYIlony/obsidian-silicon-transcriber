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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOzs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsT0FBTztBQUNQLDBDQUF3QjtBQUV4QixLQUFLO0FBQ0wsMkNBQXlCO0FBRXpCLEtBQUs7QUFDTCw2Q0FBMkI7QUFFM0IsT0FBTztBQUNQLGlEQUErQjtBQUUvQixPQUFPO0FBQ1AsMENBQXdCO0FBRXhCLFNBQVM7QUFDVCx3Q0FBc0I7QUFFdEIsU0FBUztBQUNULHdDQUFzQjtBQUV0QixVQUFVO0FBQ1YsZ0RBQThCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIPCflIwgaW5kZXgudHMgLSDmqKHlnZfnu5/kuIDlr7zlh7pcclxuICog5pa55L6/IG1haW4udHMg5LiA5qyh5oCn5a+85YWl5omA5pyJ6ZyA6KaB55qE5qih5Z2XXHJcbiAqL1xyXG5cclxuLy8g57G75Z6L5a6a5LmJXHJcbmV4cG9ydCAqIGZyb20gJy4vdHlwZXMnO1xyXG5cclxuLy8g6YWN572uXHJcbmV4cG9ydCAqIGZyb20gJy4vY29uZmlnJztcclxuXHJcbi8vIOiuvue9rlxyXG5leHBvcnQgKiBmcm9tICcuL3NldHRpbmdzJztcclxuXHJcbi8vIOiuvue9rueVjOmdolxyXG5leHBvcnQgKiBmcm9tICcuL3NldHRpbmdzLXRhYic7XHJcblxyXG4vLyDlt6Xlhbflh73mlbBcclxuZXhwb3J0ICogZnJvbSAnLi91dGlscyc7XHJcblxyXG4vLyBBU1Ig5qih5Z2XXHJcbmV4cG9ydCAqIGZyb20gJy4vYXNyJztcclxuXHJcbi8vIExMTSDmqKHlnZdcclxuZXhwb3J0ICogZnJvbSAnLi9sbG0nO1xyXG5cclxuLy8g5om56YeP6L2s5YaZ5qih5oCB5qGGXHJcbmV4cG9ydCAqIGZyb20gJy4vYmF0Y2gtbW9kYWwnO1xyXG4iXX0=