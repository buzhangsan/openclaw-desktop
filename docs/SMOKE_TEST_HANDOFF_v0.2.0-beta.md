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
- CI run（最近成功基线）：https://github.com/buzhangsan/openclaw-desktop/actions/runs/22726283117
- CI run（最新失败样本，macOS DMG 打包）：https://github.com/buzhangsan/openclaw-desktop/actions/runs/22728026668
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
- 构建来源：run 22716099630
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

### 当前跟进状态（2026-03-06 10:33 +08:00）
- Windows (Zhangsan-PC): 跟进文案已准备，待在可交互 Discord 线程中发送并收集回传证据。
- macOS tester: 仍待指定（当前主要阻塞）。
- CI 基线：最新 run `22746220821`（success，docs blocker refresh）；最近失败样本 run `22728026668`（failed，macOS `bundle_dmg.sh` 打包失败）；最近发布验证成功基线 run `22726283117`（green）。
- 阻塞：当前 cron/CLI 会话无法直接完成指定测试人的交互触达与证据回收，需在 Discord 交互面执行跟进并回填截图/日志链接。

## 7) 通过标准（Release Gate）
- Windows + macOS 至少各 1 份 PASS 证据
- 诊断导出在两个平台都“可读且字段完整”
- 无 P0/P1 启动阻塞问题

满足后将 `docs/RELEASE_CHECKLIST_v0.2.0-beta.md` 的以下项勾选：
- Smoke test first-run flow on Windows/macOS/Linux VM or physical device
- Verify diagnostics export file exists and is readable
- Confirm installer launch + app startup + gateway launch behavior
