<script setup lang="ts">
import { useFileDialog } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { onBeforeUnmount, watch } from 'vue'
import JSZip from 'jszip'
import { useImagesStore } from '@/stores/images'
import { formatBytes, optimizedFilename } from '@/utils/format'
import {
  bytesToKilobytes,
  formatsSummary,
  savingPercent,
  trackEvent,
  type ImportSource,
} from '@/utils/analytics'
import IconBase from '@/components/IconBase.vue'
import ImageRow from '@/components/ImageRow.vue'

const store = useImagesStore()
const { open, onChange } = useFileDialog({ accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true })
onChange((files) => files && addFiles([...files], 'file_picker'))

function addFiles(files: File[], source: ImportSource) {
  const { accepted, rejected } = store.addFiles(files, source)
  if (accepted) ElMessage.success(`已添加 ${accepted} 张图片`)
  if (rejected.length) ElMessage.warning(`${rejected.length} 个文件格式不受支持`)
}

function undo() {
  if (store.undo()) ElMessage.success('已撤销上一步操作')
}

function redo() {
  if (store.redo()) ElMessage.success('已重做上一步操作')
}

let settingsVersion = 0
let settingsTimer: number | undefined

async function applySettings(version: number) {
  const mode = store.targetSize ? 'target_size' : 'strength'
  trackEvent('compression_settings_changed', {
    compression_mode: mode,
    compression_strength: store.targetSize ? undefined : store.compressionStrength,
    target_kb: store.targetSize ? bytesToKilobytes(store.targetSize) : undefined,
    queue_count: store.items.length,
  })
  const results = await store.reprocessAll()
  if (version !== settingsVersion) return
  const failures = results.filter((result) => !result).length
  trackEvent('reprocessing_completed', {
    compression_mode: mode,
    image_count: results.length,
    success_count: results.length - failures,
    failure_count: failures,
  })
  if (failures) ElMessage.warning(`${failures} 张图片无法达到所选目标大小，已终止对应压缩`)
  else ElMessage.success('已按新设置重新压缩')
}

watch(
  () => [store.compressionStrength, store.targetSize] as const,
  () => {
    const version = ++settingsVersion
    if (settingsTimer !== undefined) window.clearTimeout(settingsTimer)
    settingsTimer = window.setTimeout(() => {
      settingsTimer = undefined
      void applySettings(version)
    }, 150)
  },
  { flush: 'post' },
)

watch(
  () => store.sortKey,
  (sortKey, previousSortKey) => {
    trackEvent('queue_sort_changed', { sort_key: sortKey, previous_sort_key: previousSortKey })
  },
)

onBeforeUnmount(() => {
  if (settingsTimer !== undefined) window.clearTimeout(settingsTimer)
})

async function downloadAll() {
  const completed = store.items.filter((item) => item.status === 'done' && item.result)
  if (!completed.length) return
  store.isDownloading = true
  try {
    const zip = new JSZip()
    for (const item of completed) zip.file(optimizedFilename(item.file.name), item.result!)
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'PNGKing-optimized.zip'
    anchor.click()
    trackEvent('batch_download', {
      outcome: 'success',
      image_count: completed.length,
      original_kb: bytesToKilobytes(completed.reduce((sum, item) => sum + item.file.size, 0)),
      optimized_kb: bytesToKilobytes(completed.reduce((sum, item) => sum + (item.result?.size ?? 0), 0)),
      saving_percent: savingPercent(
        completed.reduce((sum, item) => sum + item.file.size, 0),
        completed.reduce((sum, item) => sum + (item.result?.size ?? 0), 0),
      ),
      file_formats: formatsSummary(completed.map((item) => item.file)),
    })
    URL.revokeObjectURL(url)
  } catch {
    trackEvent('batch_download', { outcome: 'error', image_count: completed.length })
    ElMessage.error('打包下载失败，请稍后重试')
  } finally {
    store.isDownloading = false
  }
}
</script>

<template>
  <div class="editor-view">
    <div v-if="store.items.length" class="editor-content">
      <section class="editor-heading">
        <div><span class="section-kicker">优化队列</span><h1>让图片轻装上阵</h1><p>自适应优化颜色数量，智能重压缩并清理冗余元数据。</p></div>
        <el-button class="add-more" size="large" @click="open()"><IconBase name="plus" />继续添加</el-button>
      </section>

      <section class="summary-card">
        <div class="summary-main">
          <span class="summary-icon"><IconBase name="layers" /></span>
          <div><small>已完成</small><strong>{{ store.completedCount }} <em>/ {{ store.items.length }} 张</em></strong></div>
        </div>
        <div class="summary-stat"><small>原始大小</small><strong>{{ formatBytes(store.totalOriginal) }}</strong></div>
        <div class="summary-arrow">→</div>
        <div class="summary-stat optimized"><small>优化之后</small><strong>{{ formatBytes(store.totalOptimized) }}</strong></div>
        <div class="saving-badge"><small>共节省</small><strong>{{ store.totalSaving }}%</strong></div>
      </section>

      <section class="compression-settings" aria-labelledby="compression-settings-title">
        <div class="settings-heading">
          <div><span class="settings-icon"><IconBase name="sliders" /></span><div><strong id="compression-settings-title">压缩设置</strong><small>修改后会自动重新处理当前队列</small></div></div>
          <span class="local-badge">仅本地处理</span>
        </div>
        <div class="setting-control strength-control" :class="{ disabled: store.targetSize > 0 }">
          <div class="setting-label"><label for="compression-strength">压缩强度</label><strong>{{ store.compressionStrength }}</strong></div>
          <input id="compression-strength" v-model.number="store.compressionStrength" type="range" min="1" max="9" step="1" :disabled="store.targetSize > 0" />
          <div class="range-labels"><span>画质优先</span><span>默认 6</span><span>体积优先</span></div>
        </div>
        <div class="setting-control">
          <div class="setting-label"><label for="target-size">目标文件大小</label><small>每张图片</small></div>
          <select id="target-size" v-model.number="store.targetSize">
            <option :value="0">不指定（按压缩强度）</option>
            <option :value="50 * 1024">50 KB</option>
            <option :value="100 * 1024">100 KB</option>
            <option :value="250 * 1024">250 KB</option>
            <option :value="500 * 1024">500 KB</option>
            <option :value="1024 * 1024">1 MB</option>
            <option :value="2 * 1024 * 1024">2 MB</option>
          </select>
          <p>选择后会采用不超过目标且体积最接近的结果；无法达到时不会生成文件。</p>
        </div>
      </section>

      <section class="queue-panel">
        <header class="queue-toolbar">
          <div><strong>图片列表</strong><span>{{ store.items.length }} 个文件</span></div>
          <div class="toolbar-actions">
            <label>排序
              <select v-model="store.sortKey">
                <option value="name">名称</option><option value="size">文件大小</option><option value="saving">节省比例</option>
              </select>
            </label>
            <el-button text :disabled="!store.undoStack.length" @click="undo"><IconBase name="undo" />撤销</el-button>
            <el-button text :disabled="!store.redoStack.length" @click="redo">重做</el-button>
            <el-button text @click="store.clearAll"><IconBase name="trash" />清空</el-button>
          </div>
        </header>
        <div class="image-list">
          <ImageRow v-for="item in store.sortedItems" :key="item.id" :item="item" @remove="store.removeItem" />
        </div>
      </section>

      <section class="download-bar">
        <div><span class="secure-mark"><IconBase name="lock" /></span><div><strong>处理完成，文件已准备好</strong><small>下载后仍会保留当前列表，方便继续操作。</small></div></div>
        <el-button type="primary" size="large" :loading="store.isDownloading" :disabled="!store.completedCount" @click="downloadAll">
          <IconBase name="download" />下载全部 <span>ZIP</span>
        </el-button>
      </section>
    </div>

    <section v-else class="empty-state">
      <span><IconBase name="image" /></span><h1>队列还是空的</h1><p>添加 PNG、JPG、WebP 或 GIF，马上开始智能优化。</p>
      <el-button type="primary" size="large" @click="open()"><IconBase name="plus" />选择图片</el-button>
      <RouterLink to="/">返回首页</RouterLink>
    </section>
  </div>
</template>
