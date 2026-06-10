<script setup lang="ts">
import { useFileDialog } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import JSZip from 'jszip'
import { useImagesStore } from '@/stores/images'
import { formatBytes, optimizedFilename } from '@/utils/format'
import IconBase from '@/components/IconBase.vue'
import ImageRow from '@/components/ImageRow.vue'

const store = useImagesStore()
const { open, onChange } = useFileDialog({ accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true })
onChange((files) => files && addFiles([...files]))

function addFiles(files: File[]) {
  const { accepted, rejected } = store.addFiles(files)
  if (accepted) ElMessage.success(`已添加 ${accepted} 张图片`)
  if (rejected.length) ElMessage.warning(`${rejected.length} 个文件格式不受支持`)
}

function undo() {
  if (store.undo()) ElMessage.success('已撤销上一步操作')
}

function redo() {
  if (store.redo()) ElMessage.success('已重做上一步操作')
}

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
    URL.revokeObjectURL(url)
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
