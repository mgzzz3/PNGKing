<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useImagesStore } from '@/stores/images'
import DropZone from '@/components/DropZone.vue'
import FeatureCard from '@/components/FeatureCard.vue'
import IconBase from '@/components/IconBase.vue'
import type { ImportSource } from '@/utils/analytics'

const router = useRouter()
const store = useImagesStore()

function handleFiles(files: File[], source: ImportSource) {
  const { accepted, rejected } = store.addFiles(files, source)
  if (rejected.length) ElMessage.warning(`有 ${rejected.length} 个文件格式不受支持`)
  if (accepted) void router.push('/editor')
}
</script>

<template>
  <div class="home-view">
    <section class="hero-section">
      <div class="eyebrow"><IconBase name="lock" />无需上传 · 隐私安全</div>
      <h1>图片瘦身，<em>观感不打折</em></h1>
      <p class="hero-copy">智能颜色量化与无损重压缩协同工作。一次处理所有图片，轻一点，快很多。</p>
      <DropZone @files="handleFiles" />
      <p class="privacy-line"><IconBase name="shield" />文件始终留在你的设备上，我们看不到任何内容</p>
    </section>

    <section class="features" aria-label="产品特点">
      <FeatureCard icon="shield" tone="green" title="智能压缩" description="自适应减少肉眼难辨的颜色，并重压缩数据、移除冗余信息。" />
      <FeatureCard icon="bolt" tone="yellow" title="本地极速" description="无需等待上传，浏览器直接处理，速度取决于你的设备。" />
      <FeatureCard icon="layers" tone="purple" title="批量处理" description="一次拖入多张图片，完成后打包下载，工作更高效。" />
    </section>

    <section class="how-it-works">
      <div><span>01</span><strong>添加图片</strong><small>拖放或选择文件</small></div>
      <IconBase name="arrow" />
      <div><span>02</span><strong>自动优化</strong><small>安全清理冗余信息</small></div>
      <IconBase name="arrow" />
      <div><span>03</span><strong>立即下载</strong><small>单张或打包保存</small></div>
    </section>
  </div>
</template>
