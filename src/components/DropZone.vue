<script setup lang="ts">
import { useDropZone, useFileDialog } from '@vueuse/core'
import IconBase from './IconBase.vue'

const emit = defineEmits<{ files: [files: File[]] }>()
const dropZoneRef = ref<HTMLElement>()
const { isOverDropZone } = useDropZone(dropZoneRef, {
  onDrop: (files) => files && emit('files', files),
  dataTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  multiple: true,
  preventDefaultForUnhandled: true,
})
const { open, onChange } = useFileDialog({
  accept: 'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif',
  multiple: true,
})
onChange((files) => files && emit('files', [...files]))
</script>

<template>
  <section
    ref="dropZoneRef"
    class="drop-zone"
    :class="{ 'is-over': isOverDropZone }"
    tabindex="0"
    role="button"
    aria-label="拖放图片或打开文件选择器"
    @click="open()"
    @keydown.enter="open()"
    @keydown.space.prevent="open()"
  >
    <div class="upload-visual">
      <span class="float-card card-jpg">JPG</span>
      <span class="float-card card-png">PNG</span>
      <span class="float-card card-webp">WEBP</span>
      <span class="upload-icon"><IconBase name="upload" /></span>
    </div>
    <h2>{{ isOverDropZone ? '松开即可添加图片' : '把图片拖到这里' }}</h2>
    <p>或者点击选择文件，支持批量导入</p>
    <el-button class="select-button" type="primary" size="large" @click.stop="open()">
      <IconBase name="plus" />选择图片
    </el-button>
    <div class="format-row">
      <span>PNG</span><i></i><span>JPG</span><i></i><span>WEBP</span><i></i><span>GIF</span>
    </div>
  </section>
</template>
