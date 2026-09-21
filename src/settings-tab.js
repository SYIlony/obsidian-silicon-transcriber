"use strict";
/**
 * ⚙️ 设置界面模块
 * 创建 Obsidian 设置面板，让用户在设置中直接修改配置
 */
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
        this.addPasswordSetting(containerEl, 'ASR API Key 1', 'SiliconFlow ASR 主密钥', this.plugin.settings.asrApiKey1, async (val) => { this.plugin.settings.asrApiKey1 = val; await this.plugin.saveSettings(); });
        this.addPasswordSetting(containerEl, 'ASR API Key 2', 'SiliconFlow ASR 备用密钥（可选，用于双 Key 并发）', this.plugin.settings.asrApiKey2, async (val) => { this.plugin.settings.asrApiKey2 = val; await this.plugin.saveSettings(); });
        new obsidian_1.Setting(containerEl)
            .setName('ASR Base URL')
            .setDesc('ASR API 端点地址')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.asrBaseUrl)
            .setValue(this.plugin.settings.asrBaseUrl)
            .onChange(async (value) => {
            this.plugin.settings.asrBaseUrl = value || settings_1.DEFAULT_SETTINGS.asrBaseUrl;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('ASR 模型')
            .setDesc('语音识别模型名称')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.asrModel)
            .setValue(this.plugin.settings.asrModel)
            .onChange(async (value) => {
            this.plugin.settings.asrModel = value || settings_1.DEFAULT_SETTINGS.asrModel;
            await this.plugin.saveSettings();
        }));
    }
    // ==================== 分组 2：🤖 AI 章节分析 (LLM) ====================
    renderLlmSection(containerEl) {
        containerEl.createEl('h3', { text: '🤖 AI 章节分析 (LLM)' });
        this.addPasswordSetting(containerEl, 'LLM API Key', '主 LLM 密钥（用于批次分析和思维导图生成）', this.plugin.settings.llmApiKey, async (val) => { this.plugin.settings.llmApiKey = val; await this.plugin.saveSettings(); });
        new obsidian_1.Setting(containerEl)
            .setName('LLM Base URL')
            .setDesc('主 LLM API 端点地址')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.llmBaseUrl)
            .setValue(this.plugin.settings.llmBaseUrl)
            .onChange(async (value) => {
            this.plugin.settings.llmBaseUrl = value || settings_1.DEFAULT_SETTINGS.llmBaseUrl;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('LLM 模型')
            .setDesc('主 LLM 模型名称')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.llmModel)
            .setValue(this.plugin.settings.llmModel)
            .onChange(async (value) => {
            this.plugin.settings.llmModel = value || settings_1.DEFAULT_SETTINGS.llmModel;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('LLM 额外请求体参数 (Extra Body)')
            .setDesc('JSON 格式的额外请求体参数（如 reasoning_effort / thinking）。留空则不发送任何额外参数。OpenCode 示例: {"reasoning_effort":"xhigh","thinking":{"type":"enabled"}}')
            .addTextArea(text => {
            text
                .setPlaceholder('{"reasoning_effort":"xhigh","thinking":{"type":"enabled"}}')
                .setValue(this.plugin.settings.llmExtraBody || '')
                .onChange(async (value) => {
                this.plugin.settings.llmExtraBody = value;
                await this.plugin.saveSettings();
            });
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
        this.addPasswordSetting(containerEl, '报告 LLM API Key', '任务报告主模型密钥', this.plugin.settings.reportLlmApiKey, async (val) => { this.plugin.settings.reportLlmApiKey = val; await this.plugin.saveSettings(); });
        new obsidian_1.Setting(containerEl)
            .setName('报告 LLM Base URL')
            .setDesc('任务报告主模型 API 端点')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.reportLlmBaseUrl)
            .setValue(this.plugin.settings.reportLlmBaseUrl)
            .onChange(async (value) => {
            this.plugin.settings.reportLlmBaseUrl = value || settings_1.DEFAULT_SETTINGS.reportLlmBaseUrl;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('报告 LLM 模型')
            .setDesc('任务报告主模型名称')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.reportLlmModel)
            .setValue(this.plugin.settings.reportLlmModel)
            .onChange(async (value) => {
            this.plugin.settings.reportLlmModel = value || settings_1.DEFAULT_SETTINGS.reportLlmModel;
            await this.plugin.saveSettings();
        }));
        // --- 备用报告模型 ---
        containerEl.createEl('h4', { text: '备用报告模型' });
        this.addPasswordSetting(containerEl, '备用报告 API Key', '任务报告备用模型密钥', this.plugin.settings.reportFallbackApiKey, async (val) => { this.plugin.settings.reportFallbackApiKey = val; await this.plugin.saveSettings(); });
        new obsidian_1.Setting(containerEl)
            .setName('备用报告 Base URL')
            .setDesc('任务报告备用模型 API 端点')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.reportFallbackBaseUrl)
            .setValue(this.plugin.settings.reportFallbackBaseUrl)
            .onChange(async (value) => {
            this.plugin.settings.reportFallbackBaseUrl = value || settings_1.DEFAULT_SETTINGS.reportFallbackBaseUrl;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('备用报告模型')
            .setDesc('任务报告备用模型名称')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.reportFallbackModel)
            .setValue(this.plugin.settings.reportFallbackModel)
            .onChange(async (value) => {
            this.plugin.settings.reportFallbackModel = value || settings_1.DEFAULT_SETTINGS.reportFallbackModel;
            await this.plugin.saveSettings();
        }));
    }
    // ==================== 分组 4：🧠 全局分析 LLM ====================
    renderGlobalSection(containerEl) {
        containerEl.createEl('h3', { text: '🧠 全局分析 LLM' });
        this.addPasswordSetting(containerEl, '全局分析 API Key', '全局深度校验与修正模型密钥', this.plugin.settings.globalLlmApiKey, async (val) => { this.plugin.settings.globalLlmApiKey = val; await this.plugin.saveSettings(); });
        new obsidian_1.Setting(containerEl)
            .setName('全局分析 Base URL')
            .setDesc('全局分析 LLM API 端点')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.globalLlmBaseUrl)
            .setValue(this.plugin.settings.globalLlmBaseUrl)
            .onChange(async (value) => {
            this.plugin.settings.globalLlmBaseUrl = value || settings_1.DEFAULT_SETTINGS.globalLlmBaseUrl;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('全局分析模型')
            .setDesc('全局分析 LLM 模型名称')
            .addText(text => text
            .setPlaceholder(settings_1.DEFAULT_SETTINGS.globalLlmModel)
            .setValue(this.plugin.settings.globalLlmModel)
            .onChange(async (value) => {
            this.plugin.settings.globalLlmModel = value || settings_1.DEFAULT_SETTINGS.globalLlmModel;
            await this.plugin.saveSettings();
        }));
    }
    // ==================== 分组 4b：🧠 思维导图 LLM ====================
    renderMindmapSection(containerEl) {
        containerEl.createEl('h3', { text: '🧠 思维导图 LLM' });
        this.addPasswordSetting(containerEl, '思维导图 API Key', '思维导图生成专用密钥（留空则复用全局分析设置，仍留空则复用章节分析设置）', this.plugin.settings.mindmapLlmApiKey, async (val) => { this.plugin.settings.mindmapLlmApiKey = val; await this.plugin.saveSettings(); });
        new obsidian_1.Setting(containerEl)
            .setName('思维导图 Base URL')
            .setDesc('思维导图 LLM API 端点（留空则复用全局分析设置，仍留空则复用章节分析设置）')
            .addText(text => text
            .setPlaceholder('（复用全局分析 → 章节分析）')
            .setValue(this.plugin.settings.mindmapLlmBaseUrl)
            .onChange(async (value) => {
            this.plugin.settings.mindmapLlmBaseUrl = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('思维导图模型 (Mindmap Model)')
            .setDesc('思维导图 LLM 模型名称（留空则复用全局分析设置，仍留空则复用章节分析设置）')
            .addText(text => text
            .setPlaceholder('（复用全局分析 → 章节分析）')
            .setValue(this.plugin.settings.mindmapLlmModel)
            .onChange(async (value) => {
            this.plugin.settings.mindmapLlmModel = value;
            await this.plugin.saveSettings();
        }));
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
                .onChange(async (value) => {
                const num = parseInt(value, 10);
                if (!isNaN(num) && num >= 60 && num <= 1800) {
                    this.plugin.settings.chunkSize = num;
                    await this.plugin.saveSettings();
                }
            });
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
                .onChange(async (value) => {
                const num = parseInt(value, 10);
                if (!isNaN(num) && num >= 1 && num <= 10) {
                    this.plugin.settings.batchSize = num;
                    await this.plugin.saveSettings();
                }
            });
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
            .onClick(async () => {
            try {
                const success = await this.plugin.loadSecrets();
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
        }));
        new obsidian_1.Setting(containerEl)
            .setName('重置为默认值')
            .setDesc('将所有设置恢复为默认值（API Key 将被清空）')
            .addButton(button => button
            .setButtonText('🔄 重置')
            .setWarning()
            .onClick(async () => {
            // 深拷贝默认值
            this.plugin.settings = JSON.parse(JSON.stringify(settings_1.DEFAULT_SETTINGS));
            await this.plugin.saveSettings();
            new obsidian_1.Notice('✅ 设置已重置为默认值');
            this.display(); // 刷新界面
        }));
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
            text.onChange(async (value) => {
                // 只有当用户实际输入了内容时才更新（避免空字符串覆盖已有值）
                if (value || !currentValue) {
                    await onChange(value);
                }
            });
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
