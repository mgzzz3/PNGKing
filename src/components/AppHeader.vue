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
    <a class="github-link" href="https://github.com" target="_blank" rel="noreferrer" aria-label="查看 GitHub 项目">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.6.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C16.9 4.8 18 5 18 5c.6 1.5.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.5 5.7.5.4.9 1.1.9 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .7Z"/></svg>
    </a>
  </header>
</template>
