# OpenClaw Desktop

🦞 **OpenClaw 桌面客户端** - 专注小白一键使用龙虾

## 功能特性

- ✅ **一键安装** - 自动检测环境、安装依赖
- ✅ **跨平台** - 支持 Windows / macOS / Linux
- ✅ **图形化配置** - 无需命令行，可视化配置 API Key
- ✅ **Gateway 管理** - 一键启动/停止，状态监控
- ✅ **轻量级** - 基于 Tauri v2，安装包仅 ~60MB

## 截图

> TODO: 添加截图

## 下载安装

前往 [Releases](https://github.com/your-username/openclaw-desktop/releases) 页面下载对应平台的安装包：

| 平台 | 文件 |
|------|------|
| Windows | `openclaw-desktop_x64-setup.exe` |
| macOS | `openclaw-desktop_universal.dmg` |
| Linux | `openclaw-desktop_amd64.deb` |

## 开发

### 前置要求

- Node.js 22+
- Rust (via rustup)
- pnpm 或 npm

### Linux 额外依赖

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

### 启动开发服务器

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev
```

### 构建

```bash
npm run tauri build
```

## 技术栈

- **框架**: Tauri v2
- **前端**: React + TypeScript + Vite
- **样式**: CSS (Dark Theme)
- **后端**: Rust

## 许可证

MIT

## 相关项目

- [OpenClaw](https://github.com/openclaw/openclaw) - 官方仓库
- [openclaw-desktop (Linux)](https://github.com/Jorgut/openclaw-desktop) - Linux 版本参考
