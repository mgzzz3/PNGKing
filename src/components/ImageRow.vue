<script setup lang="ts">
import type { ImageItem } from '@/stores/images'
import { formatBytes, formatSaving, optimizedFilename } from '@/utils/format'
import IconBase from './IconBase.vue'

const props = defineProps<{ item: ImageItem }>()
const emit = defineEmits<{ remove: [id: string] }>()
const saving = computed(() => formatSaving(props.item.file.size, props.item.optimizedSize))

function download() {
  if (!props.item.result) return
  const url = URL.createObjectURL(props.item.result)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = optimizedFilename(props.item.file.name)
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <article class="image-row">
    <div class="image-preview"><img :src="item.previewUrl" :alt="item.file.name" /></div>
    <div class="file-info">
      <strong :title="item.file.name">{{ item.file.name }}</strong>
      <span>{{ item.file.type.split('/')[1]?.toUpperCase() }} · {{ formatBytes(item.file.size) }}</span>
    </div>
    <div class="status-cell">
      <template v-if="item.status === 'processing' || item.status === 'queued'">
        <span class="spinner"></span><small>正在优化...</small>
      </template>
      <template v-else-if="item.status === 'error'">
        <span class="error-dot">!</span><small>{{ item.error }}</small>
      </template>
      <template v-else>
        <span class="done-check"><IconBase name="check" /></span>
        <div><strong>{{ saving ? `-${saving}%` : '已是最优' }}</strong><small>{{ formatBytes(item.optimizedSize) }}</small></div>
      </template>
    </div>
    <div class="row-actions">
      <el-button circle plain aria-label="下载此图片" :disabled="item.status !== 'done'" @click="download"><IconBase name="download" /></el-button>
      <el-button circle plain aria-label="从队列删除" @click="emit('remove', item.id)"><IconBase name="trash" /></el-button>
    </div>
  </article>
</template>
