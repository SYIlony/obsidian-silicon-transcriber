"use strict";
/**
 * ⚙️ 设置界面模块
 * 创建 Obsidian 设置面板，让用户在设置中直接修改配置
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
exports.SiliconTranscriberSettingTab = void 0;
const obsidian_1 = require("obsidian");
const settings_1 = require("./settings");
/**
 * Silicon Transcriber 设置界面
 */
class SiliconTranscriberSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Silicon Transcriber 设置' });
        this.renderAsrSection(containerEl);
        this.renderLlmSection(containerEl);
        this.renderReportSection(containerEl);
        this.renderGlobalSection(containerEl);
        this.renderMindmapSection(containerEl);
        this.renderProcessingSection(containerEl);
        this.renderMigrationSection(containerEl);
    }
    // ==================== 分组 1：🔑 语音转写 (ASR) ====================
    renderAsrSection(containerEl) {
        containerEl.createEl('h3', { text: '🔑 语音转写 (ASR)' });
        this.addPasswordSetting(containerEl, 'ASR API Key 1', 'SiliconFlow ASR 主密钥', this.plugin.settings.asrApiKey1, (val) => __awaiter(this, void 0, void 0, function* () { this.plugin.settings.asrApiKey1 = val; yield this.plugin.saveSettings(); }));
        this.addPasswordSetting(containerEl, 'ASR API Key 2', 'SiliconFlow ASR 备用密钥（可选，用于双 Key 并发）', this.plugin.settings.asrApiKey2, (val) => __awaiter(this, void 0, void 0, function* () { this.plugin.settings.asrApiKey2 = val; yield this.plugin.saveSettings(); }));
        new obsidian_1.Setting(containerEl)
            .setName('ASR Base URL')
            .setDesc('ASR API 端点地址')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.asrBaseUrl)
            .setValue(this.plugin.settings.asrBaseUrl)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.asrBaseUrl = value || settings_1.DEFAULT_SETTINGS.asrBaseUrl;
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName('ASR 模型')
            .setDesc('语音识别模型名称')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.asrModel)
            .setValue(this.plugin.settings.asrModel)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.asrModel = value || settings_1.DEFAULT_SETTINGS.asrModel;
            yield this.plugin.saveSettings();
        })));
    }
    // ==================== 分组 2：🤖 AI 章节分析 (LLM) ====================
    renderLlmSection(containerEl) {
        containerEl.createEl('h3', { text: '🤖 AI 章节分析 (LLM)' });
        this.addPasswordSetting(containerEl, 'LLM API Key', '主 LLM 密钥（用于批次分析和思维导图生成）', this.plugin.settings.llmApiKey, (val) => __awaiter(this, void 0, void 0, function* () { this.plugin.settings.llmApiKey = val; yield this.plugin.saveSettings(); }));
        new obsidian_1.Setting(containerEl)
            .setName('LLM Base URL')
            .setDesc('主 LLM API 端点地址')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.llmBaseUrl)
            .setValue(this.plugin.settings.llmBaseUrl)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.llmBaseUrl = value || settings_1.DEFAULT_SETTINGS.llmBaseUrl;
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName('LLM 模型')
            .setDesc('主 LLM 模型名称')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.llmModel)
            .setValue(this.plugin.settings.llmModel)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.llmModel = value || settings_1.DEFAULT_SETTINGS.llmModel;
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName('LLM 额外请求体参数 (Extra Body)')
            .setDesc('JSON 格式的额外请求体参数（如 reasoning_effort / thinking）。留空则不发送任何额外参数。OpenCode 示例: {"reasoning_effort":"xhigh","thinking":{"type":"enabled"}}')
            .addTextArea(text => {
            text
                .setPlaceholder('{"reasoning_effort":"xhigh","thinking":{"type":"enabled"}}')
                .setValue(this.plugin.settings.llmExtraBody || '')
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.llmExtraBody = value;
                yield this.plugin.saveSettings();
            }));
            text.inputEl.rows = 3;
            text.inputEl.style.width = '100%';
            text.inputEl.style.fontSize = '12px';
            text.inputEl.style.fontFamily = 'monospace';
        });
    }
    // ==================== 分组 3：📊 任务报告 LLM ====================
    renderReportSection(containerEl) {
        containerEl.createEl('h3', { text: '📊 任务报告 LLM' });
        // --- 主报告模型 ---
        containerEl.createEl('h4', { text: '主报告模型' });
        this.addPasswordSetting(containerEl, '报告 LLM API Key', '任务报告主模型密钥', this.plugin.settings.reportLlmApiKey, (val) => __awaiter(this, void 0, void 0, function* () { this.plugin.settings.reportLlmApiKey = val; yield this.plugin.saveSettings(); }));
        new obsidian_1.Setting(containerEl)
            .setName('报告 LLM Base URL')
            .setDesc('任务报告主模型 API 端点')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.reportLlmBaseUrl)
            .setValue(this.plugin.settings.reportLlmBaseUrl)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.reportLlmBaseUrl = value || settings_1.DEFAULT_SETTINGS.reportLlmBaseUrl;
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName('报告 LLM 模型')
            .setDesc('任务报告主模型名称')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.reportLlmModel)
            .setValue(this.plugin.settings.reportLlmModel)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.reportLlmModel = value || settings_1.DEFAULT_SETTINGS.reportLlmModel;
            yield this.plugin.saveSettings();
        })));
        // --- 备用报告模型 ---
        containerEl.createEl('h4', { text: '备用报告模型' });
        this.addPasswordSetting(containerEl, '备用报告 API Key', '任务报告备用模型密钥', this.plugin.settings.reportFallbackApiKey, (val) => __awaiter(this, void 0, void 0, function* () { this.plugin.settings.reportFallbackApiKey = val; yield this.plugin.saveSettings(); }));
        new obsidian_1.Setting(containerEl)
            .setName('备用报告 Base URL')
            .setDesc('任务报告备用模型 API 端点')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.reportFallbackBaseUrl)
            .setValue(this.plugin.settings.reportFallbackBaseUrl)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.reportFallbackBaseUrl = value || settings_1.DEFAULT_SETTINGS.reportFallbackBaseUrl;
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName('备用报告模型')
            .setDesc('任务报告备用模型名称')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.reportFallbackModel)
            .setValue(this.plugin.settings.reportFallbackModel)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.reportFallbackModel = value || settings_1.DEFAULT_SETTINGS.reportFallbackModel;
            yield this.plugin.saveSettings();
        })));
    }
    // ==================== 分组 4：🧠 全局分析 LLM ====================
    renderGlobalSection(containerEl) {
        containerEl.createEl('h3', { text: '🧠 全局分析 LLM' });
        this.addPasswordSetting(containerEl, '全局分析 API Key', '全局深度校验与修正模型密钥', this.plugin.settings.globalLlmApiKey, (val) => __awaiter(this, void 0, void 0, function* () { this.plugin.settings.globalLlmApiKey = val; yield this.plugin.saveSettings(); }));
        new obsidian_1.Setting(containerEl)
            .setName('全局分析 Base URL')
            .setDesc('全局分析 LLM API 端点')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.globalLlmBaseUrl)
            .setValue(this.plugin.settings.globalLlmBaseUrl)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.globalLlmBaseUrl = value || settings_1.DEFAULT_SETTINGS.globalLlmBaseUrl;
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName('全局分析模型')
            .setDesc('全局分析 LLM 模型名称')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.globalLlmModel)
            .setValue(this.plugin.settings.globalLlmModel)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.globalLlmModel = value || settings_1.DEFAULT_SETTINGS.globalLlmModel;
            yield this.plugin.saveSettings();
        })));
    }
    // ==================== 分组 4b：🧠 思维导图 LLM ====================
    renderMindmapSection(containerEl) {
        containerEl.createEl('h3', { text: '🧠 思维导图 LLM' });
        this.addPasswordSetting(containerEl, '思维导图 API Key', '思维导图生成专用密钥（留空则复用全局分析设置，仍留空则复用章节分析设置）', this.plugin.settings.mindmapLlmApiKey, (val) => __awaiter(this, void 0, void 0, function* () { this.plugin.settings.mindmapLlmApiKey = val; yield this.plugin.saveSettings(); }));
        new obsidian_1.Setting(containerEl)
            .setName('思维导图 Base URL')
            .setDesc('思维导图 LLM API 端点（留空则复用全局分析设置，仍留空则复用章节分析设置）')
            .addText(text => text
            .setPlaceholder('（复用全局分析 → 章节分析）')
            .setValue(this.plugin.settings.mindmapLlmBaseUrl)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.mindmapLlmBaseUrl = value;
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName('思维导图模型 (Mindmap Model)')
            .setDesc('思维导图 LLM 模型名称（留空则复用全局分析设置，仍留空则复用章节分析设置）')
            .addText(text => text
            .setPlaceholder('（复用全局分析 → 章节分析）')
            .setValue(this.plugin.settings.mindmapLlmModel)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.mindmapLlmModel = value;
            yield this.plugin.saveSettings();
        })));
    }
    // ==================== 分组 5：⚙️ 处理参数 ====================
    renderProcessingSection(containerEl) {
        containerEl.createEl('h3', { text: '⚙️ 处理参数' });
        new obsidian_1.Setting(containerEl)
            .setName('音频分片时长')
            .setDesc('每个音频分片的秒数（60-1800），默认 600 秒（10 分钟）')
            .addText(text => {
            text
                .setPlaceholder('600')
                .setValue(String(this.plugin.settings.chunkSize))
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                const num = parseInt(value, 10);
                if (!isNaN(num) && num >= 60 && num <= 1800) {
                    this.plugin.settings.chunkSize = num;
                    yield this.plugin.saveSettings();
                }
            }));
            // 限制只能输入数字
            text.inputEl.type = 'number';
            text.inputEl.min = '60';
            text.inputEl.max = '1800';
        });
        new obsidian_1.Setting(containerEl)
            .setName('每批分片数量')
            .setDesc('每个处理批次包含的分片数量（1-10），默认 1')
            .addText(text => {
            text
                .setPlaceholder('1')
                .setValue(String(this.plugin.settings.batchSize))
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                const num = parseInt(value, 10);
                if (!isNaN(num) && num >= 1 && num <= 10) {
                    this.plugin.settings.batchSize = num;
                    yield this.plugin.saveSettings();
                }
            }));
            text.inputEl.type = 'number';
            text.inputEl.min = '1';
            text.inputEl.max = '10';
        });
    }
    // ==================== 分组 6：🔄 数据迁移 ====================
    renderMigrationSection(containerEl) {
        containerEl.createEl('h3', { text: '🔄 数据迁移' });
        new obsidian_1.Setting(containerEl)
            .setName('从 secrets.json 导入')
            .setDesc('将 secrets.json 文件中的 API Key 导入到设置中（覆盖当前值）')
            .addButton(button => button
            .setButtonText('📥 导入')
            .setCta()
            .onClick(() => __awaiter(this, void 0, void 0, function* () {
            try {
                const success = yield this.plugin.loadSecrets();
                if (success) {
                    new obsidian_1.Notice('✅ secrets.json 导入成功！设置已更新。');
                    this.display(); // 刷新界面显示新值
                }
                else {
                    new obsidian_1.Notice('⚠️ 未找到 secrets.json 或导入失败');
                }
            }
            catch (e) {
                console.error('导入 secrets.json 失败:', e);
                new obsidian_1.Notice('❌ 导入失败: ' + e.message);
            }
        })));
        new obsidian_1.Setting(containerEl)
            .setName('重置为默认值')
            .setDesc('将所有设置恢复为默认值（API Key 将被清空）')
            .addButton(button => button
            .setButtonText('🔄 重置')
            .setWarning()
            .onClick(() => __awaiter(this, void 0, void 0, function* () {
            // 深拷贝默认值
            this.plugin.settings = JSON.parse(JSON.stringify(settings_1.DEFAULT_SETTINGS));
            yield this.plugin.saveSettings();
            new obsidian_1.Notice('✅ 设置已重置为默认值');
            this.display(); // 刷新界面
        })));
    }
    // ==================== 辅助方法 ====================
    /**
     * 添加带密码输入和可见性切换的设置项
     * @param containerEl 容器元素
     * @param name 设置名称
     * @param desc 设置描述
     * @param currentValue 当前值
     * @param onChange 值变更回调
     */
    addPasswordSetting(containerEl, name, desc, currentValue, onChange) {
        const setting = new obsidian_1.Setting(containerEl)
            .setName(name)
            .setDesc(desc);
        // 添加密码输入框
        setting.addText(text => {
            text.inputEl.type = 'password';
            text.inputEl.style.width = '300px';
            // 如果有已保存的值，显示掩码占位符
            if (currentValue) {
                text.setPlaceholder((0, settings_1.maskApiKey)(currentValue));
                // 输入框初始显示掩码（非实际值），点击时清除
                text.setValue('');
                text.inputEl.addEventListener('focus', () => {
                    if (text.inputEl.value === '') {
                        text.inputEl.value = currentValue;
                    }
                }, { once: true });
            }
            else {
                text.setPlaceholder('请输入 API Key...');
            }
            text.onChange((value) => __awaiter(this, void 0, void 0, function* () {
                // 只有当用户实际输入了内容时才更新（避免空字符串覆盖已有值）
                if (value || !currentValue) {
                    yield onChange(value);
                }
            }));
        });
        // 添加可见性切换按钮（小眼睛）
        setting.addExtraButton(button => {
            button
                .setIcon('eye')
                .setTooltip('切换可见性')
                .onClick(() => {
                const inputEl = setting.controlEl.querySelector('input[type="password"], input[type="text"]');
                if (inputEl) {
                    if (inputEl.type === 'password') {
                        inputEl.type = 'text';
                        button.setIcon('eye-off');
                    }
                    else {
                        inputEl.type = 'password';
                        button.setIcon('eye');
                    }
                }
            });
        });
    }
}
exports.SiliconTranscriberSettingTab = SiliconTranscriberSettingTab;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MtdGFiLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2V0dGluZ3MtdGFiLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7Ozs7Ozs7Ozs7OztBQUVILHVDQUEwRTtBQUMxRSx5Q0FBc0Y7QUFXdEY7O0dBRUc7QUFDSCxNQUFhLDRCQUE2QixTQUFRLDJCQUFnQjtJQUc5RCxZQUFZLEdBQVEsRUFBRSxNQUEwQjtRQUM1QyxLQUFLLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQ3pCLENBQUM7SUFFRCxPQUFPO1FBQ0gsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLElBQUksQ0FBQztRQUM3QixXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7UUFFcEIsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1FBRS9ELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNuQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDbkMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN0QyxJQUFJLENBQUMsb0JBQW9CLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDdkMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUM3QyxDQUFDO0lBRUQsK0RBQStEO0lBRXZELGdCQUFnQixDQUFDLFdBQXdCO1FBQzdDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFFdEQsSUFBSSxDQUFD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Q0FBQyxFQUFFO1lBQzVCLE1BQU07aUJBQ0QsT0FBTyxDQUFDLEtBQUssQ0FBQztpQkFDZCxVQUFVLENBQUMsT0FBTyxDQUFDO2lCQUNuQixPQUFPLENBQUMsR0FBRyxFQUFFO2dCQUNWLE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLDRDQUE0QyxDQUFxQixDQUFDO2dCQUNsSCxJQUFJLE9BQU8sRUFBRSxDQUFDO29CQUNWLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxVQUFVLEVBQUUsQ0FBQzt3QkFDOUIsT0FBTyxDQUFDLElBQUksR0FBRyxNQUFNLENBQUM7d0JBQ3RCLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQzlCLENBQUM7eUJBQU0sQ0FBQzt3QkFDSixPQUFPLENBQUMsSUFBSSxHQUFHLFVBQVUsQ0FBQzt3QkFDMUIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDMUIsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDWCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7Q0FDSjtBQTFaRCxvRUEwWkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICog4pqZ77iPIOiuvue9rueVjOmdouaooeWdl1xyXG4gKiDliJvlu7ogT2JzaWRpYW4g6K6+572u6Z2i5p2/77yM6K6p55So5oi35Zyo6K6+572u5Lit55u05o6l5L+u5pS56YWN572uXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgQXBwLCBOb3RpY2UsIFBsdWdpbiwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZyB9IGZyb20gJ29ic2lkaWFuJztcclxuaW1wb3J0IHsgU2lsaWNvblRyYW5zY3JpYmVyU2V0dGluZ3MsIERFRkFVTFRfU0VUVElOR1MsIG1hc2tBcGlLZXkgfSBmcm9tICcuL3NldHRpbmdzJztcclxuXHJcbi8qKlxyXG4gKiDluKborr7nva7og73lipvnmoTmj5Lku7bmjqXlj6PvvIjpgb/lhY3lvqrnjq/kvp3otZbvvIlcclxuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgUGx1Z2luV2l0aFNldHRpbmdzIGV4dGVuZHMgUGx1Z2luIHtcclxuICAgIHNldHRpbmdzOiBTaWxpY29uVHJhbnNjcmliZXJTZXR0aW5ncztcclxuICAgIHNhdmVTZXR0aW5ncygpOiBQcm9taXNlPHZvaWQ+O1xyXG4gICAgbG9hZFNlY3JldHMoKTogUHJvbWlzZTxib29sZWFuPjtcclxufVxyXG5cclxuLyoqXHJcbiAqIFNpbGljb24gVHJhbnNjcmliZXIg6K6+572u55WM6Z2iXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgU2lsaWNvblRyYW5zY3JpYmVyU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xyXG4gICAgcGx1Z2luOiBQbHVnaW5XaXRoU2V0dGluZ3M7XHJcblxyXG4gICAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogUGx1Z2luV2l0aFNldHRpbmdzKSB7XHJcbiAgICAgICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xyXG4gICAgICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gICAgfVxyXG5cclxuICAgIGRpc3BsYXkoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcclxuICAgICAgICBjb250YWluZXJFbC5lbXB0eSgpO1xyXG5cclxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdTaWxpY29uIFRyYW5zY3JpYmVyIOiuvue9ricgfSk7XHJcblxyXG4gICAgICAgIHRoaXMucmVuZGVyQXNyU2VjdGlvbihjb250YWluZXJFbCk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJMbG1TZWN0aW9uKGNvbnRhaW5lckVsKTtcclxuICAgICAgICB0aGlzLnJlbmRlclJlcG9ydFNlY3Rpb24oY29udGFpbmVyRWwpO1xyXG4gICAgICAgIHRoaXMucmVuZGVyR2xvYmFsU2VjdGlvbihjb250YWluZXJFbCk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJNaW5kbWFwU2VjdGlvbihjb250YWluZXJFbCk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJQcm9jZXNzaW5nU2VjdGlvbihjb250YWluZXJFbCk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJNaWdyYXRpb25TZWN0aW9uKGNvbnRhaW5lckVsKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PSDliIbnu4QgMe+8mvCflJEg6K+t6Z+z6L2s5YaZIChBU1IpID09PT09PT09PT09PT09PT09PT09XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXJBc3JTZWN0aW9uKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdoMycsIHsgdGV4dDogJ/CflJEg6K+t6Z+z6L2s5YaZIChBU1IpJyB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5hZGRQYXNzd29yZFNldHRpbmcoY29udGFpbmVyRWwsICdBU1IgQVBJIEtleSAxJywgJ1NpbGljb25GbG93IEFTUiDkuLvlr4bpkqUnLFxyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5hc3JBcGlLZXkxLFxyXG4gICAgICAgICAgICBhc3luYyAodmFsKSA9PiB7IHRoaXMucGx1Z2luLnNldHRpbmdzLmFzckFwaUtleTEgPSB2YWw7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9XHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgdGhpcy5hZGRQYXNzd29yZFNldHRpbmcoY29udGFpbmVyRWwsICdBU1IgQVBJIEtleSAyJywgJ1NpbGljb25GbG93IEFTUiDlpIfnlKjlr4bpkqXvvIjlj6/pgInvvIznlKjkuo7lj4wgS2V5IOW5tuWPke+8iScsXHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmFzckFwaUtleTIsXHJcbiAgICAgICAgICAgIGFzeW5jICh2YWwpID0+IHsgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYXNyQXBpS2V5MiA9IHZhbDsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH1cclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgLnNldE5hbWUoJ0FTUiBCYXNlIFVSTCcpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCdBU1IgQVBJIOerr+eCueWcsOWdgCcpXHJcbiAgICAgICAgICAgIC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG4gICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MuYXNyQmFzZVVybClcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hc3JCYXNlVXJsKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmFzckJhc2VVcmwgPSB2YWx1ZSB8fCBERUZBVUxUX1NFVFRJTkdTLmFzckJhc2VVcmw7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICApO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgLnNldE5hbWUoJ0FTUiDmqKHlnosnKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygn6K+t6Z+z6K+G5Yir5qih5Z6L5ZCN56ewJylcclxuICAgICAgICAgICAgLmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcbiAgICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5hc3JNb2RlbClcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hc3JNb2RlbClcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5hc3JNb2RlbCA9IHZhbHVlIHx8IERFRkFVTFRfU0VUVElOR1MuYXNyTW9kZWw7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09IOWIhue7hCAy77ya8J+kliBBSSDnq6DoioLliIbmnpAgKExMTSkgPT09PT09PT09PT09PT09PT09PT1cclxuXHJcbiAgICBwcml2YXRlIHJlbmRlckxsbVNlY3Rpb24oY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAn8J+kliBBSSDnq6DoioLliIbmnpAgKExMTSknIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmFkZFBhc3N3b3JkU2V0dGluZyhjb250YWluZXJFbCwgJ0xMTSBBUEkgS2V5JywgJ+S4uyBMTE0g5a+G6ZKl77yI55So5LqO5om55qyh5YiG5p6Q5ZKM5oCd57u05a+85Zu+55Sf5oiQ77yJJyxcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubGxtQXBpS2V5LFxyXG4gICAgICAgICAgICBhc3luYyAodmFsKSA9PiB7IHRoaXMucGx1Z2luLnNldHRpbmdzLmxsbUFwaUtleSA9IHZhbDsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH1cclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgLnNldE5hbWUoJ0xMTSBCYXNlIFVSTCcpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCfkuLsgTExNIEFQSSDnq6/ngrnlnLDlnYAnKVxyXG4gICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLmxsbUJhc2VVcmwpXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubGxtQmFzZVVybClcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5sbG1CYXNlVXJsID0gdmFsdWUgfHwgREVGQVVMVF9TRVRUSU5HUy5sbG1CYXNlVXJsO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCdMTE0g5qih5Z6LJylcclxuICAgICAgICAgICAgLnNldERlc2MoJ+S4uyBMTE0g5qih5Z6L5ZCN56ewJylcclxuICAgICAgICAgICAgLmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcbiAgICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5sbG1Nb2RlbClcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5sbG1Nb2RlbClcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5sbG1Nb2RlbCA9IHZhbHVlIHx8IERFRkFVTFRfU0VUVElOR1MubGxtTW9kZWw7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICApO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgLnNldE5hbWUoJ0xMTSDpop3lpJbor7fmsYLkvZPlj4LmlbAgKEV4dHJhIEJvZHkpJylcclxuICAgICAgICAgICAgLnNldERlc2MoJ0pTT04g5qC85byP55qE6aKd5aSW6K+35rGC5L2T5Y+C5pWw77yI5aaCIHJlYXNvbmluZ19lZmZvcnQgLyB0aGlua2luZ++8ieOAgueVmeepuuWImeS4jeWPkemAgeS7u+S9lemineWkluWPguaVsOOAgk9wZW5Db2RlIOekuuS+izoge1wicmVhc29uaW5nX2VmZm9ydFwiOlwieGhpZ2hcIixcInRoaW5raW5nXCI6e1widHlwZVwiOlwiZW5hYmxlZFwifX0nKVxyXG4gICAgICAgICAgICAuYWRkVGV4dEFyZWEodGV4dCA9PiB7XHJcbiAgICAgICAgICAgICAgICB0ZXh0XHJcbiAgICAgICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCd7XCJyZWFzb25pbmdfZWZmb3J0XCI6XCJ4aGlnaFwiLFwidGhpbmtpbmdcIjp7XCJ0eXBlXCI6XCJlbmFibGVkXCJ9fScpXHJcbiAgICAgICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxsbUV4dHJhQm9keSB8fCAnJylcclxuICAgICAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmxsbUV4dHJhQm9keSA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIHRleHQuaW5wdXRFbC5yb3dzID0gMztcclxuICAgICAgICAgICAgICAgIHRleHQuaW5wdXRFbC5zdHlsZS53aWR0aCA9ICcxMDAlJztcclxuICAgICAgICAgICAgICAgIHRleHQuaW5wdXRFbC5zdHlsZS5mb250U2l6ZSA9ICcxMnB4JztcclxuICAgICAgICAgICAgICAgIHRleHQuaW5wdXRFbC5zdHlsZS5mb250RmFtaWx5ID0gJ21vbm9zcGFjZSc7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09IOWIhue7hCAz77ya8J+TiiDku7vliqHmiqXlkYogTExNID09PT09PT09PT09PT09PT09PT09XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXJSZXBvcnRTZWN0aW9uKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdoMycsIHsgdGV4dDogJ/Cfk4og5Lu75Yqh5oql5ZGKIExMTScgfSk7XHJcblxyXG4gICAgICAgIC8vIC0tLSDkuLvmiqXlkYrmqKHlnosgLS0tXHJcbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2g0JywgeyB0ZXh0OiAn5Li75oql5ZGK5qih5Z6LJyB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5hZGRQYXNzd29yZFNldHRpbmcoY29udGFpbmVyRWwsICfmiqXlkYogTExNIEFQSSBLZXknLCAn5Lu75Yqh5oql5ZGK5Li75qih5Z6L5a+G6ZKlJyxcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmVwb3J0TGxtQXBpS2V5LFxyXG4gICAgICAgICAgICBhc3luYyAodmFsKSA9PiB7IHRoaXMucGx1Z2luLnNldHRpbmdzLnJlcG9ydExsbUFwaUtleSA9IHZhbDsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH1cclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgLnNldE5hbWUoJ+aKpeWRiiBMTE0gQmFzZSBVUkwnKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygn5Lu75Yqh5oql5ZGK5Li75qih5Z6LIEFQSSDnq6/ngrknKVxyXG4gICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnJlcG9ydExsbUJhc2VVcmwpXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucmVwb3J0TGxtQmFzZVVybClcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZXBvcnRMbG1CYXNlVXJsID0gdmFsdWUgfHwgREVGQVVMVF9TRVRUSU5HUy5yZXBvcnRMbG1CYXNlVXJsO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCfmiqXlkYogTExNIOaooeWeiycpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCfku7vliqHmiqXlkYrkuLvmqKHlnovlkI3np7AnKVxyXG4gICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnJlcG9ydExsbU1vZGVsKVxyXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnJlcG9ydExsbU1vZGVsKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnJlcG9ydExsbU1vZGVsID0gdmFsdWUgfHwgREVGQVVMVF9TRVRUSU5HUy5yZXBvcnRMbG1Nb2RlbDtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIC0tLSDlpIfnlKjmiqXlkYrmqKHlnosgLS0tXHJcbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2g0JywgeyB0ZXh0OiAn5aSH55So5oql5ZGK5qih5Z6LJyB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5hZGRQYXNzd29yZFNldHRpbmcoY29udGFpbmVyRWwsICflpIfnlKjmiqXlkYogQVBJIEtleScsICfku7vliqHmiqXlkYrlpIfnlKjmqKHlnovlr4bpkqUnLFxyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZXBvcnRGYWxsYmFja0FwaUtleSxcclxuICAgICAgICAgICAgYXN5bmMgKHZhbCkgPT4geyB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZXBvcnRGYWxsYmFja0FwaUtleSA9IHZhbDsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH1cclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgLnNldE5hbWUoJ+Wkh+eUqOaKpeWRiiBCYXNlIFVSTCcpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCfku7vliqHmiqXlkYrlpIfnlKjmqKHlnosgQVBJIOerr+eCuScpXHJcbiAgICAgICAgICAgIC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG4gICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MucmVwb3J0RmFsbGJhY2tCYXNlVXJsKVxyXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnJlcG9ydEZhbGxiYWNrQmFzZVVybClcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZXBvcnRGYWxsYmFja0Jhc2VVcmwgPSB2YWx1ZSB8fCBERUZBVUxUX1NFVFRJTkdTLnJlcG9ydEZhbGxiYWNrQmFzZVVybDtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgICAuc2V0TmFtZSgn5aSH55So5oql5ZGK5qih5Z6LJylcclxuICAgICAgICAgICAgLnNldERlc2MoJ+S7u+WKoeaKpeWRiuWkh+eUqOaooeWei+WQjeensCcpXHJcbiAgICAgICAgICAgIC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG4gICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MucmVwb3J0RmFsbGJhY2tNb2RlbClcclxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZXBvcnRGYWxsYmFja01vZGVsKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnJlcG9ydEZhbGxiYWNrTW9kZWwgPSB2YWx1ZSB8fCBERUZBVUxUX1NFVFRJTkdTLnJlcG9ydEZhbGxiYWNrTW9kZWw7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09IOWIhue7hCA077ya8J+noCDlhajlsYDliIbmnpAgTExNID09PT09PT09PT09PT09PT09PT09XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXJHbG9iYWxTZWN0aW9uKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdoMycsIHsgdGV4dDogJ/Cfp6Ag5YWo5bGA5YiG5p6QIExMTScgfSk7XHJcblxyXG4gICAgICAgIHRoaXMuYWRkUGFzc3dvcmRTZXR0aW5nKGNvbnRhaW5lckVsLCAn5YWo5bGA5YiG5p6QIEFQSSBLZXknLCAn5YWo5bGA5rex5bqm5qCh6aqM5LiO5L+u5q2j5qih5Z6L5a+G6ZKlJyxcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZ2xvYmFsTGxtQXBpS2V5LFxyXG4gICAgICAgICAgICBhc3luYyAodmFsKSA9PiB7IHRoaXMucGx1Z2luLnNldHRpbmdzLmdsb2JhbExsbUFwaUtleSA9IHZhbDsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH1cclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgLnNldE5hbWUoJ+WFqOWxgOWIhuaekCBCYXNlIFVSTCcpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCflhajlsYDliIbmnpAgTExNIEFQSSDnq6/ngrknKVxyXG4gICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLmdsb2JhbExsbUJhc2VVcmwpXHJcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZ2xvYmFsTGxtQmFzZVVybClcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5nbG9iYWxMbG1CYXNlVXJsID0gdmFsdWUgfHwgREVGQVVMVF9TRVRUSU5HUy5nbG9iYWxMbG1CYXNlVXJsO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCflhajlsYDliIbmnpDmqKHlnosnKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygn5YWo5bGA5YiG5p6QIExMTSDmqKHlnovlkI3np7AnKVxyXG4gICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLmdsb2JhbExsbU1vZGVsKVxyXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmdsb2JhbExsbU1vZGVsKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmdsb2JhbExsbU1vZGVsID0gdmFsdWUgfHwgREVGQVVMVF9TRVRUSU5HUy5nbG9iYWxMbG1Nb2RlbDtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT0g5YiG57uEIDRi77ya8J+noCDmgJ3nu7Tlr7zlm74gTExNID09PT09PT09PT09PT09PT09PT09XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXJNaW5kbWFwU2VjdGlvbihjb250YWluZXJFbDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDMnLCB7IHRleHQ6ICfwn6egIOaAnee7tOWvvOWbviBMTE0nIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmFkZFBhc3N3b3JkU2V0dGluZyhjb250YWluZXJFbCwgJ+aAnee7tOWvvOWbviBBUEkgS2V5JywgJ+aAnee7tOWvvOWbvueUn+aIkOS4k+eUqOWvhumSpe+8iOeVmeepuuWImeWkjeeUqOWFqOWxgOWIhuaekOiuvue9ru+8jOS7jeeVmeepuuWImeWkjeeUqOeroOiKguWIhuaekOiuvue9ru+8iScsXHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm1pbmRtYXBMbG1BcGlLZXksXHJcbiAgICAgICAgICAgIGFzeW5jICh2YWwpID0+IHsgdGhpcy5wbHVnaW4uc2V0dGluZ3MubWluZG1hcExsbUFwaUtleSA9IHZhbDsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH1cclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgLnNldE5hbWUoJ+aAnee7tOWvvOWbviBCYXNlIFVSTCcpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCfmgJ3nu7Tlr7zlm74gTExNIEFQSSDnq6/ngrnvvIjnlZnnqbrliJnlpI3nlKjlhajlsYDliIbmnpDorr7nva7vvIzku43nlZnnqbrliJnlpI3nlKjnq6DoioLliIbmnpDorr7nva7vvIknKVxyXG4gICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcign77yI5aSN55So5YWo5bGA5YiG5p6QIOKGkiDnq6DoioLliIbmnpDvvIknKVxyXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm1pbmRtYXBMbG1CYXNlVXJsKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm1pbmRtYXBMbG1CYXNlVXJsID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICApO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgLnNldE5hbWUoJ+aAnee7tOWvvOWbvuaooeWeiyAoTWluZG1hcCBNb2RlbCknKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygn5oCd57u05a+85Zu+IExMTSDmqKHlnovlkI3np7DvvIjnlZnnqbrliJnlpI3nlKjlhajlsYDliIbmnpDorr7nva7vvIzku43nlZnnqbrliJnlpI3nlKjnq6DoioLliIbmnpDorr7nva7vvIknKVxyXG4gICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcign77yI5aSN55So5YWo5bGA5YiG5p6QIOKGkiDnq6DoioLliIbmnpDvvIknKVxyXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm1pbmRtYXBMbG1Nb2RlbClcclxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5taW5kbWFwTGxtTW9kZWwgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT0g5YiG57uEIDXvvJrimpnvuI8g5aSE55CG5Y+C5pWwID09PT09PT09PT09PT09PT09PT09XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXJQcm9jZXNzaW5nU2VjdGlvbihjb250YWluZXJFbDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDMnLCB7IHRleHQ6ICfimpnvuI8g5aSE55CG5Y+C5pWwJyB9KTtcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCfpn7PpopHliIbniYfml7bplb8nKVxyXG4gICAgICAgICAgICAuc2V0RGVzYygn5q+P5Liq6Z+z6aKR5YiG54mH55qE56eS5pWw77yINjAtMTgwMO+8ie+8jOm7mOiupCA2MDAg56eS77yIMTAg5YiG6ZKf77yJJylcclxuICAgICAgICAgICAgLmFkZFRleHQodGV4dCA9PiB7XHJcbiAgICAgICAgICAgICAgICB0ZXh0XHJcbiAgICAgICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCc2MDAnKVxyXG4gICAgICAgICAgICAgICAgICAgIC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3MuY2h1bmtTaXplKSlcclxuICAgICAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG51bSA9IHBhcnNlSW50KHZhbHVlLCAxMCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghaXNOYU4obnVtKSAmJiBudW0gPj0gNjAgJiYgbnVtIDw9IDE4MDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmNodW5rU2l6ZSA9IG51bTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAvLyDpmZDliLblj6rog73ovpPlhaXmlbDlrZdcclxuICAgICAgICAgICAgICAgIHRleHQuaW5wdXRFbC50eXBlID0gJ251bWJlcic7XHJcbiAgICAgICAgICAgICAgICB0ZXh0LmlucHV0RWwubWluID0gJzYwJztcclxuICAgICAgICAgICAgICAgIHRleHQuaW5wdXRFbC5tYXggPSAnMTgwMCc7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgLnNldE5hbWUoJ+avj+aJueWIhueJh+aVsOmHjycpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCfmr4/kuKrlpITnkIbmibnmrKHljIXlkKvnmoTliIbniYfmlbDph4/vvIgxLTEw77yJ77yM6buY6K6kIDEnKVxyXG4gICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHtcclxuICAgICAgICAgICAgICAgIHRleHRcclxuICAgICAgICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoJzEnKVxyXG4gICAgICAgICAgICAgICAgICAgIC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3MuYmF0Y2hTaXplKSlcclxuICAgICAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG51bSA9IHBhcnNlSW50KHZhbHVlLCAxMCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghaXNOYU4obnVtKSAmJiBudW0gPj0gMSAmJiBudW0gPD0gMTApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmJhdGNoU2l6ZSA9IG51bTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB0ZXh0LmlucHV0RWwudHlwZSA9ICdudW1iZXInO1xyXG4gICAgICAgICAgICAgICAgdGV4dC5pbnB1dEVsLm1pbiA9ICcxJztcclxuICAgICAgICAgICAgICAgIHRleHQuaW5wdXRFbC5tYXggPSAnMTAnO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PSDliIbnu4QgNu+8mvCflIQg5pWw5o2u6L+B56e7ID09PT09PT09PT09PT09PT09PT09XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXJNaWdyYXRpb25TZWN0aW9uKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdoMycsIHsgdGV4dDogJ/CflIQg5pWw5o2u6L+B56e7JyB9KTtcclxuXHJcbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAgIC5zZXROYW1lKCfku44gc2VjcmV0cy5qc29uIOWvvOWFpScpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCflsIYgc2VjcmV0cy5qc29uIOaWh+S7tuS4reeahCBBUEkgS2V5IOWvvOWFpeWIsOiuvue9ruS4re+8iOimhuebluW9k+WJjeWAvO+8iScpXHJcbiAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxyXG4gICAgICAgICAgICAgICAgLnNldEJ1dHRvblRleHQoJ/Cfk6Ug5a+85YWlJylcclxuICAgICAgICAgICAgICAgIC5zZXRDdGEoKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnBsdWdpbi5sb2FkU2VjcmV0cygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3VjY2Vzcykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZSgn4pyFIHNlY3JldHMuanNvbiDlr7zlhaXmiJDlip/vvIHorr7nva7lt7Lmm7TmlrDjgIInKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpOyAvLyDliLfmlrDnlYzpnaLmmL7npLrmlrDlgLxcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoJ+KaoO+4jyDmnKrmib7liLAgc2VjcmV0cy5qc29uIOaIluWvvOWFpeWksei0pScpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCflr7zlhaUgc2VjcmV0cy5qc29uIOWksei0pTonLCBlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZSgn4p2MIOWvvOWFpeWksei0pTogJyArIChlIGFzIEVycm9yKS5tZXNzYWdlKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICApO1xyXG5cclxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgLnNldE5hbWUoJ+mHjee9ruS4uum7mOiupOWAvCcpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKCflsIbmiYDmnInorr7nva7mgaLlpI3kuLrpu5jorqTlgLzvvIhBUEkgS2V5IOWwhuiiq+a4heepuu+8iScpXHJcbiAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxyXG4gICAgICAgICAgICAgICAgLnNldEJ1dHRvblRleHQoJ/CflIQg6YeN572uJylcclxuICAgICAgICAgICAgICAgIC5zZXRXYXJuaW5nKClcclxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAvLyDmt7Hmi7fotJ3pu5jorqTlgLxcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoREVGQVVMVF9TRVRUSU5HUykpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoJ+KchSDorr7nva7lt7Lph43nva7kuLrpu5jorqTlgLwnKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTsgLy8g5Yi35paw55WM6Z2iXHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09IOi+heWKqeaWueazlSA9PT09PT09PT09PT09PT09PT09PVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5re75Yqg5bim5a+G56CB6L6T5YWl5ZKM5Y+v6KeB5oCn5YiH5o2i55qE6K6+572u6aG5XHJcbiAgICAgKiBAcGFyYW0gY29udGFpbmVyRWwg5a655Zmo5YWD57SgXHJcbiAgICAgKiBAcGFyYW0gbmFtZSDorr7nva7lkI3np7BcclxuICAgICAqIEBwYXJhbSBkZXNjIOiuvue9ruaPj+i/sFxyXG4gICAgICogQHBhcmFtIGN1cnJlbnRWYWx1ZSDlvZPliY3lgLxcclxuICAgICAqIEBwYXJhbSBvbkNoYW5nZSDlgLzlj5jmm7Tlm57osINcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhZGRQYXNzd29yZFNldHRpbmcoXHJcbiAgICAgICAgY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LFxyXG4gICAgICAgIG5hbWU6IHN0cmluZyxcclxuICAgICAgICBkZXNjOiBzdHJpbmcsXHJcbiAgICAgICAgY3VycmVudFZhbHVlOiBzdHJpbmcsXHJcbiAgICAgICAgb25DaGFuZ2U6ICh2YWx1ZTogc3RyaW5nKSA9PiBQcm9taXNlPHZvaWQ+XHJcbiAgICApOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBzZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAgIC5zZXROYW1lKG5hbWUpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKGRlc2MpO1xyXG5cclxuICAgICAgICAvLyDmt7vliqDlr4bnoIHovpPlhaXmoYZcclxuICAgICAgICBzZXR0aW5nLmFkZFRleHQodGV4dCA9PiB7XHJcbiAgICAgICAgICAgIHRleHQuaW5wdXRFbC50eXBlID0gJ3Bhc3N3b3JkJztcclxuICAgICAgICAgICAgdGV4dC5pbnB1dEVsLnN0eWxlLndpZHRoID0gJzMwMHB4JztcclxuXHJcbiAgICAgICAgICAgIC8vIOWmguaenOacieW3suS/neWtmOeahOWAvO+8jOaYvuekuuaOqeeggeWNoOS9jeesplxyXG4gICAgICAgICAgICBpZiAoY3VycmVudFZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICB0ZXh0LnNldFBsYWNlaG9sZGVyKG1hc2tBcGlLZXkoY3VycmVudFZhbHVlKSk7XHJcbiAgICAgICAgICAgICAgICAvLyDovpPlhaXmoYbliJ3lp4vmmL7npLrmjqnnoIHvvIjpnZ7lrp7pmYXlgLzvvInvvIzngrnlh7vml7bmuIXpmaRcclxuICAgICAgICAgICAgICAgIHRleHQuc2V0VmFsdWUoJycpO1xyXG4gICAgICAgICAgICAgICAgdGV4dC5pbnB1dEVsLmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzJywgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0ZXh0LmlucHV0RWwudmFsdWUgPT09ICcnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRleHQuaW5wdXRFbC52YWx1ZSA9IGN1cnJlbnRWYWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9LCB7IG9uY2U6IHRydWUgfSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0ZXh0LnNldFBsYWNlaG9sZGVyKCfor7fovpPlhaUgQVBJIEtleS4uLicpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0ZXh0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgLy8g5Y+q5pyJ5b2T55So5oi35a6e6ZmF6L6T5YWl5LqG5YaF5a655pe25omN5pu05paw77yI6YG/5YWN56m65a2X56ym5Liy6KaG55uW5bey5pyJ5YC877yJXHJcbiAgICAgICAgICAgICAgICBpZiAodmFsdWUgfHwgIWN1cnJlbnRWYWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IG9uQ2hhbmdlKHZhbHVlKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIOa3u+WKoOWPr+ingeaAp+WIh+aNouaMiemSru+8iOWwj+ecvOedm++8iVxyXG4gICAgICAgIHNldHRpbmcuYWRkRXh0cmFCdXR0b24oYnV0dG9uID0+IHtcclxuICAgICAgICAgICAgYnV0dG9uXHJcbiAgICAgICAgICAgICAgICAuc2V0SWNvbignZXllJylcclxuICAgICAgICAgICAgICAgIC5zZXRUb29sdGlwKCfliIfmjaLlj6/op4HmgKcnKVxyXG4gICAgICAgICAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlucHV0RWwgPSBzZXR0aW5nLmNvbnRyb2xFbC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwicGFzc3dvcmRcIl0sIGlucHV0W3R5cGU9XCJ0ZXh0XCJdJykgYXMgSFRNTElucHV0RWxlbWVudDtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW5wdXRFbCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5wdXRFbC50eXBlID09PSAncGFzc3dvcmQnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnB1dEVsLnR5cGUgPSAndGV4dCc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBidXR0b24uc2V0SWNvbignZXllLW9mZicpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5wdXRFbC50eXBlID0gJ3Bhc3N3b3JkJztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJ1dHRvbi5zZXRJY29uKCdleWUnKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcbiJdfQ==