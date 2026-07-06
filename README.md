# PNGKing

一个简洁、隐私优先的批量图片优化网站。PNGKing 会对普通 PNG 进行自适应调色板量化和数据流重压缩，并移除 PNG、JPEG、WebP 和 GIF 中不影响显示的可选元数据；所有处理都在浏览器本地完成。

## 功能

- 拖放或选择多张图片批量导入
- 支持 PNG、JPG/JPEG、WebP、GIF
- 更强的 PNG 压缩：普通 8-bit RGB/RGBA PNG 可选择无损优化，或量化为自适应调色板；动画或不支持的 PNG 自动回退到无损重压缩
- 可选 1–9 级压缩强度（默认 6）：1 级仅做无损优化，2–9 级逐步减少颜色，并在处理完成前显示预估体积
- 可按每张图片选择 50 KB–2 MB 的目标大小，输出会尽量贴近但不超过目标，无法达到时终止并提示
- 实时显示处理状态、文件大小和节省比例
- 单张下载或 ZIP 批量下载
- 删除、清空与撤销操作
- 响应式中文界面
- GitHub Actions 自动测试、构建和部署 GitHub Pages

> 强度模式的 1 级“画质优先”仅清理元数据并无损重压缩，2–9 级会逐步减少 PNG 调色板颜色数量并采用更小结果，9 级“体积优先”使用最激进的 16 色方案；目标大小模式会比较多个调色板候选，采用不超过目标且体积最接近的版本，而不是一味选择最小文件。调色板量化会合并肉眼较难区分的近似颜色，因此属于有损压缩；动画 PNG 始终走无损路径。其他格式的效果取决于源文件中的可移除元数据。

## 本地开发

```bash
npm install
npm run dev
```

质量检查：

```bash
npm run check
```

生产构建：

```bash
npm run build
npm run preview
```

## 部署到 GitHub Pages

1. 将仓库推送到 GitHub，并使用 `main` 作为部署分支。
2. 在仓库 **Settings → Pages → Build and deployment** 中，将 Source 设为 **GitHub Actions**。
3. 推送到 `main`。`.github/workflows/deploy.yml` 会自动执行 lint、单元测试、类型检查和构建，通过后发布 Pages。
4. 工作流根据仓库名自动设置 Vite base path，并生成 `404.html` 作为 Vue Router 的 SPA 回退。


## Issue 自动化

本仓库包含 GitHub Copilot cloud agent 的准备配置：

1. 使用 **Issues → New issue → AI agent task** 创建范围明确的任务，模板会自动添加 `agent-ready` 标签。
2. 在 GitHub 仓库的 **Agents** 标签页创建自动化：触发器选择“issue created”，过滤 `agent-ready` 标签，并让 Copilot 根据 issue 内容实现改动、运行校验并提交 PR。
3. `.github/workflows/copilot-setup-steps.yml` 会为 Copilot 预装 Node.js 22、执行 `npm ci` 并运行 `npm run check`，让代理在提交 PR 前使用与项目一致的验证流程。

## 技术栈

Vue 3、Vite、TypeScript strict、Pinia、Vue Router 4、Element Plus、VueUse、JSZip、Vitest。

详细产品边界与验收标准见 [`docs/spec.md`](docs/spec.md)。Firebase Analytics 的事件含义、漏斗和控制台配置见 [`docs/analytics.md`](docs/analytics.md)。
