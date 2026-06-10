# Firebase Analytics 事件说明

这份文档用于回答两个问题：**现在记录了什么**，以及**在 Firebase / Google Analytics 控制台里该怎么看**。

## 1. 隐私边界

PNGKing 只发送行为和汇总数据，不发送图片内容，也不发送以下信息：

- 文件名、文件路径、图片像素或预览；
- 用户输入的自由文本；
- 可用于还原单张图片内容的数据。

文件相关参数只包含格式、数量、四舍五入后的 KB、节省率、处理耗时和成功/失败状态。

## 2. 推荐关注的用户漏斗

在 **Google Analytics → 探索 → 漏斗探索** 中按下列顺序建立漏斗：

1. `route_view`，且 `route_name = home`：用户看到了首页；
2. `file_import`，且 `accepted_count > 0`：用户成功加入了至少一张图片；
3. `optimization_result`，且 `outcome = success`：至少一张图片处理成功；
4. `single_image_download` 或 `batch_download`（`outcome = success`）：用户拿到了结果。

最值得长期观察的三个比率：

- **开始使用率**：成功导入用户数 ÷ 首页用户数；
- **处理成功率**：`outcome = success` 的 `optimization_result` 数量 ÷ 全部 `optimization_result` 数量；
- **下载转化率**：发生下载的用户数 ÷ 成功导入的用户数。

## 3. 事件字典

| 事件 | 什么时候触发 | 它能回答什么 | 重点参数 |
| --- | --- | --- | --- |
| `route_view` | Vue 路由完成切换 | 用户主要访问首页还是编辑页？ | `route_name`, `page_path` |
| `file_import` | 用户拖放或选择文件后 | 用户偏好拖放还是选择器？一次处理几张？有多少格式不支持或重复？ | `import_source`, `selected_count`, `accepted_count`, `rejected_count`, `duplicate_count`, `selected_kb`, `file_formats`, `queue_count` |
| `optimization_result` | 每张图片处理结束 | 哪种格式、模式更容易成功？平均节省多少？目标体积是否经常不可达？ | `outcome`, `processing_reason`, `file_format`, `original_kb`, `result_kb`, `saving_percent`, `compression_mode`, `compression_strength`, `target_kb`, `duration_ms` |
| `compression_settings_changed` | 用户停止调整设置 150ms 后 | 用户更爱强度模式还是目标大小？常用设置是什么？ | `compression_mode`, `compression_strength`, `target_kb`, `queue_count` |
| `reprocessing_completed` | 新设置对应的一轮重新处理完成 | 改设置后整批处理的成功情况如何？ | `compression_mode`, `image_count`, `success_count`, `failure_count` |
| `single_image_download` | 用户下载单张结果 | 用户是否偏好逐张下载？下载结果节省了多少？ | `file_format`, `original_kb`, `optimized_kb`, `saving_percent` |
| `batch_download` | ZIP 打包成功或失败 | 批量下载是主要交付方式吗？打包是否失败？ | `outcome`, `image_count`, `original_kb`, `optimized_kb`, `saving_percent`, `file_formats` |
| `queue_item_removed` | 删除单个队列项目 | 用户通常在处理前还是处理后删除？ | `file_format`, `item_status`, `queue_count` |
| `queue_cleared` | 清空队列 | 用户清空时队列有多大、完成情况怎样？ | `removed_count`, `completed_count`, `failed_count`, `file_formats` |
| `queue_history_action` | 撤销或重做 | 队列操作是否容易误触？ | `action`, `affected_count`, `queue_count` |
| `queue_sort_changed` | 修改排序 | 用户最关心名称、大小还是节省率？ | `sort_key`, `previous_sort_key` |

### 常见参数值

- `import_source`：`drop`（拖放）或 `file_picker`（文件选择器）。
- `outcome`：优化事件为 `success`、`target_unreachable`、`processing_error`；批量下载为 `success`、`error`。
- `processing_reason`：`initial`（首次导入自动处理）或 `settings_change`（修改设置后重处理）。
- `compression_mode`：`strength`（压缩强度）或 `target_size`（目标体积）。
- `file_formats`：本次涉及格式的去重列表，例如 `jpg,png,webp`。

## 4. Firebase 控制台配置

自定义事件会自动出现在 **Analytics → 事件**，但要在报告和探索中按参数拆分，需在 **Google Analytics → 管理 → 数据显示 → 自定义定义** 注册事件范围的自定义维度或指标。

建议先注册最有决策价值的维度，避免一次占满配额：

| 显示名称 | 事件参数 | 类型 |
| --- | --- | --- |
| 导入方式 | `import_source` | 维度 |
| 文件格式 | `file_format` | 维度 |
| 文件格式组合 | `file_formats` | 维度 |
| 处理结果 | `outcome` | 维度 |
| 处理原因 | `processing_reason` | 维度 |
| 压缩模式 | `compression_mode` | 维度 |
| 排序方式 | `sort_key` | 维度 |
| 节省率 | `saving_percent` | 指标（百分比或标准数值） |
| 处理耗时 | `duration_ms` | 指标（毫秒） |
| 图片数量 | `image_count` | 指标（标准数值） |

> 自定义定义从创建后才开始积累可用于报告的数据，不会回填历史参数。事件本身仍会正常采集。

## 5. 建议建立的报表

### A. 导入体验

查看 `file_import`，按 `import_source` 拆分，并观察：

- `accepted_count`：真正进入队列的数量；
- `rejected_count`：格式兼容问题；
- `duplicate_count`：用户是否经常重复选图。

如果 `rejected_count` 较高，应优先改进格式提示；如果选择器转化明显高于拖放，应确保移动端的“选择图片”按钮足够突出。

### B. 压缩质量和稳定性

查看 `optimization_result`，按 `file_format`、`compression_mode`、`outcome` 拆分：

- `saving_percent` 高：压缩价值明显；
- `target_unreachable` 高：目标大小选项可能过于激进；
- `processing_error` 高：需要按格式排查兼容性；
- `duration_ms` 高：需要优化对应格式或大文件的性能。

### C. 最终价值

把 `single_image_download` 与成功的 `batch_download` 放在同一探索中比较用户数和事件数。若批量下载占绝大多数，应优先保证 ZIP 的速度、稳定性和移动端体验。

## 6. 调试方法

1. 在浏览器安装 Google Analytics Debugger，或临时通过 Tag Assistant 打开站点。
2. 打开 **Google Analytics → 管理 → 数据显示 → DebugView**。
3. 完成一次“进入首页 → 添加图片 → 调整设置 → 下载”的流程。
4. 确认事件顺序和参数符合本页事件字典。

Analytics 未加载或被广告拦截器阻止时，业务功能仍可正常工作；埋点调用会安全地跳过。
