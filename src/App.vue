<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <main>
      <RouterView />
    </main>
    <footer class="site-footer">
      <span>PNGKing · 图片只在你的浏览器里处理</span>
    </footer>
  </div>
</template>
