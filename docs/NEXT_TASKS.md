# Next Tasks — OpenClaw Desktop

> Generated: 2026-03-06 14:02 CST
> Based on: commit bdf1a97, IMPLEMENTATION_TASKS.md, PRD.md, code review

## 当前状态总结

**已完成**：CI 三平台绿 ✅ | 5步向导骨架 ✅ | 配置 CRUD 后端 ✅ | 验证中心骨架 ✅ | 诊断导出 ✅

**主要缺口**：
1. macOS CI 偶发 bundle_dmg.sh 失败（run 22728026668），最新已恢复绿
2. Smoke test 发布门控卡在"无人实测"——Windows/macOS 都缺 tester
3. 验证中心诊断逻辑过于简陋（channel 只检查 token 非空，agent 只检查 name 非空）
4. 10分钟推进 cron 产出大量重复日志（T21-T26 全是相同 blocker refresh），无实质推进
5. API Key 明文存储，无加密/混淆
6. 前端单文件 App.tsx ~450行，无组件拆分
7. 嵌入式 Node.js 下载功能未实现（只返回 placeholder 字符串）
8. 配置只写入 desktop-config.json，未同步到 openclaw 实际配置目录

---

## 任务清单（按优先级排序）

### P0 — 阻塞发布

| # | 任务 | 目标 | 复杂度 | 依赖 |
|---|------|------|--------|------|
| 1 | **macOS DMG 打包稳定化** | 排查 bundle_dmg.sh 间歇失败根因，确保连续 3 次 CI 全绿 | M | 无 |
| 2 | **Smoke test 执行** | 在 Windows + macOS 真机上跑一轮安装→向导→Gateway 启动→测试消息，收集截图/日志 | M | #1 |
| 3 | **配置同步到 openclaw** | save_provider/agent/channel 后同步写入 ~/.openclaw/ 实际配置，而非仅 desktop-config.json | M | 无 |

### P1 — 功能完善

| # | 任务 | 目标 | 复杂度 | 依赖 |
|---|------|------|--------|------|
| 4 | **真实 Gateway 健康检查** | 验证中心 Gateway 卡片调用 /health 端点，显示版本/uptime | S | 无 |
| 5 | **Channel 在线验证** | validate_channel 实际调用 Discord/Telegram API 验证 token 有效性 | M | 无 |
| 6 | **Agent 测试任务** | 验证中心发一条测试指令给 agent，验证响应 | M | #3 |
| 7 | **嵌入式 Node.js 自动下载** | setup_embedded_node 实现真实下载 Node.js portable 并解压 | L | 无 |
| 8 | **API Key 加密存储** | desktop-config.json 中 api_key/token 使用 OS keyring 或 AES 加密 | M | 无 |
| 9 | **步骤级错误提示与重试** | 向导每步失败时显示具体错误分类和一键重试按钮 | S | 无 |

### P2 — 代码质量

| # | 任务 | 目标 | 复杂度 | 依赖 |
|---|------|------|--------|------|
| 10 | **前端组件拆分** | App.tsx 拆为 WizardView、MainView、StatusPanel、DiagnosticsPanel 等组件 | M | 无 |
| 11 | **清理 10min cron 日志** | 停止无效重复 blocker refresh，改为有实质变化时才记录 | S | 无 |
| 12 | **E2E 测试骨架** | 用 Playwright/WebDriver 跑向导→主界面基本流程 | L | #10 |
| 13 | **模型列表动态化** | Provider 切换时自动更新可选模型列表，而非硬编码 3 个 Claude 模型 | S | 无 |

### P3 — 体验优化

| # | 任务 | 目标 | 复杂度 | 依赖 |
|---|------|------|--------|------|
| 14 | **暗色主题** | 跟随系统 prefers-color-scheme | S | 无 |
| 15 | **Gateway 日志实时流** | 主界面日志面板接入 Gateway stdout 实时输出 | M | #4 |
| 16 | **自动更新检查** | 启动时检查 openclaw npm 版本，提示一键升级 | S | 无 |
| 17 | **国际化基础** | 抽取中文硬编码为 i18n key，支持中/英切换 | M | #10 |

---

## 建议执行顺序

**Sprint 1（本周）**：#1 → #3 → #4 → #5 → #11
**Sprint 2（下周）**：#2 → #6 → #8 → #9 → #10
**Sprint 3**：#7 → #12 → #13 → #15
**Backlog**：#14 #16 #17
