<script setup lang="ts">
import IconBase from './IconBase.vue'
defineProps<{ icon: 'shield' | 'bolt' | 'layers'; title: string; description: string; tone: string }>()
</script>
<template>
  <article class="feature-card">
    <span class="feature-icon" :class="`tone-${tone}`"><IconBase :name="icon" /></span>
    <div><h3>{{ title }}</h3><p>{{ description }}</p></div>
  </article>
</template>
