# OpenClaw Desktop v0.2.0-beta 手工冒烟测试交接包

## 1) 目标
在真实交互环境完成 v0.2.0-beta 发布前阻塞项验证：
- 安装器可启动
- 首次启动向导可完成
- 诊断文件导出可读

> 当前主机为 Linux CLI，会话无法直接执行 Windows/macOS 图形化安装验证；本交接包用于人工测试闭环。

## 2) 测试分配（建议）
- Windows 测试人：Zhangsan（`Zhangsan-PC`）
- macOS 测试人：待指定（可由 beta tester 补位）
- Linux 测试人：当前维护者（可复测）

## 3) 测试输入与证据链接
- CI run（当前最新成功基线，含 macOS `.app` 检测修复）：https://github.com/buzhangsan/openclaw-desktop/actions/runs/22752777316
- CI run（上一条成功发布验证基线）：https://github.com/buzhangsan/openclaw-desktop/actions/runs/22726283117
- CI run（最近失败样本，已定位为 smoke 脚本误判而非产物缺失）：https://github.com/buzhangsan/openclaw-desktop/actions/runs/22752455106
- 发布清单：`docs/RELEASE_CHECKLIST_v0.2.0-beta.md`
- 10min 日志：`docs/TODO_10MIN.md`

## 4) 平台测试步骤（每个平台都执行）
1. 从 CI artifacts 下载对应安装包（Windows: `.exe` / `.msi`，macOS: `.dmg`，Linux: `.AppImage` 或 `.deb`）。
2. 执行安装并启动应用，记录是否出现崩溃/拦截/权限弹窗。
3. 完成首次向导（Provider → Agent → Channel），确认保存后重启仍能加载配置。
4. 打开 Validation Center，执行“导出诊断文件”。
5. 用文本编辑器打开导出的诊断文件，确认可读（非空、字段完整）。
6. 如可用，执行一次 Gateway 启动/停止，确认状态变化正常。

## 5) 证据模板（复制填写）
```markdown
### [平台] Windows 11 / macOS 14 / Ubuntu 24.04
- 构建来源：run 22752777316
- 安装包文件名：
- 安装结果：PASS/FAIL
- 首次向导结果：PASS/FAIL
- 诊断导出结果：PASS/FAIL
- 诊断文件路径：
- 关键截图/日志链接：
- 问题描述（如失败）：
```

## 6) 跟进模板（可直接发送给测试人）
```text
请按 OpenClaw Desktop v0.2.0-beta 冒烟清单回传证据：
1) 安装并启动结果（PASS/FAIL）
2) 首次向导完成结果（PASS/FAIL）
3) 诊断导出可读性（PASS/FAIL）
4) 安装包文件名 + 截图/日志链接
文档模板位置：docs/SMOKE_TEST_HANDOFF_v0.2.0-beta.md（第5节）
```

### 当前跟进状态（2026-03-06 20:15 +08:00）
- Windows (Zhangsan-PC): 节点当前在线且已配对，但本轮探测确认其仅暴露 `browser.proxy` / `system.which`，不支持 `system.run.prepare`，因此仍无法从当前 cron/CLI 会话直接代跑 Windows 冒烟；跟进文案已准备，待在可交互 Discord 线程中发送并收集回传证据。
- macOS tester: `Zhangsan-MacBook` 节点当前离线，且人工测试人仍待指定（当前主要阻塞）。
- CI 基线：最新 run `22755495785`（success，docs-only baseline refresh）；最新包含 macOS `.app` smoke-check 修复的实质构建基线仍为 run `22752777316`（success）；最近失败样本 run `22752455106`（failed，根因已定位并修复：`scripts/smoke-test.sh` 误把 `.app` 目录当成缺失产物）；上一条发布验证成功基线 run `22726283117`（green）。
- CI 细项复核：run `22755495785` 的 macOS / Ubuntu / Windows 三个 build job 全部 success，当前没有新的 CI 回归信号。
- 本地校验：上一轮已执行 `npm run build`（pass）与 `cargo check --manifest-path src-tauri/Cargo.toml`（pass），当前仓库仍满足本地构建/编译质量门。
- 说明：证据模板继续保持 run `22752777316` 作为实质 smoke 构建来源，避免测试人误引用 docs-only run。
- 阻塞：当前 cron/CLI 会话仍无法直接完成指定测试人的交互触达与证据回收；下一步必须在 Discord 交互面发送 Windows 跟进，并补齐 macOS 测试人后回填截图/日志链接。

## 7) 通过标准（Release Gate）
- Windows + macOS 至少各 1 份 PASS 证据
- 诊断导出在两个平台都“可读且字段完整”
- 无 P0/P1 启动阻塞问题

满足后将 `docs/RELEASE_CHECKLIST_v0.2.0-beta.md` 的以下项勾选：
- Smoke test first-run flow on Windows/macOS/Linux VM or physical device
- Verify diagnostics export file exists and is readable
- Confirm installer launch + app startup + gateway launch behavior
