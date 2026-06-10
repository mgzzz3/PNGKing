# PNGKing

一个简洁、隐私优先的批量图片优化网站。PNGKing 会对普通 PNG 进行自适应调色板量化和数据流重压缩，并移除 PNG、JPEG、WebP 和 GIF 中不影响显示的可选元数据；所有处理都在浏览器本地完成。

## 功能

- 拖放或选择多张图片批量导入
- 支持 PNG、JPG/JPEG、WebP、GIF
- 更强的 PNG 压缩：普通 8-bit RGB/RGBA PNG 会量化为最多 256 色的自适应调色板；动画或不支持的 PNG 自动回退到无损重压缩
- 实时显示处理状态、文件大小和节省比例
- 单张下载或 ZIP 批量下载
- 删除、清空与撤销操作
- 响应式中文界面
- GitHub Actions 自动测试、构建和部署 GitHub Pages

> PNG 会比较原文件、无损重压缩结果和自适应索引色结果，仅采用体积最小的版本。调色板量化会合并肉眼较难区分的近似颜色，因此属于有损压缩；动画 PNG 始终走无损路径。其他格式的效果取决于源文件中的可移除元数据。

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

## 技术栈

Vue 3、Vite、TypeScript strict、Pinia、Vue Router 4、Element Plus、VueUse、JSZip、Vitest。

详细产品边界与验收标准见 [`docs/spec.md`](docs/spec.md)。
