<script setup lang="ts">
import IconBase from './IconBase.vue'
</script>

<template>
  <header class="app-header">
    <RouterLink class="brand" to="/" aria-label="PNGKing 首页">
      <span class="brand-mark"><IconBase name="image" /></span>
      <span>PNG<span>King</span></span>
    </RouterLink>
    <div class="header-note">
      <span class="pulse-dot"></span>
      100% 浏览器本地处理
    </div>
  </header>
</template>
