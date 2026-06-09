<script setup lang="ts">
defineProps<{ name: 'upload' | 'shield' | 'bolt' | 'layers' | 'download' | 'trash' | 'undo' | 'image' | 'lock' | 'arrow' | 'check' | 'plus' | 'chevron' }>()
</script>

<template>
  <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <template v-if="name === 'upload'">
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v3A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-3" />
    </template>
    <template v-else-if="name === 'shield'">
      <path d="M12 3l7 3v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z" /><path d="m8.8 12 2 2 4.4-4.5" />
    </template>
    <template v-else-if="name === 'bolt'">
      <path d="m13.5 2-8 12h6l-1 8 8-12h-6l1-8Z" />
    </template>
    <template v-else-if="name === 'layers'">
      <path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </template>
    <template v-else-if="name === 'download'">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M4 7h16M9 3h6l1 4H8l1-4Zm-3 4 1 14h10l1-14M10 11v6m4-6v6" />
    </template>
    <template v-else-if="name === 'undo'">
      <path d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6" />
    </template>
    <template v-else-if="name === 'image'">
      <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m4 17 5-4 3 3 2-2 6 5" />
    </template>
    <template v-else-if="name === 'lock'">
      <rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </template>
    <template v-else-if="name === 'arrow'">
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </template>
    <template v-else-if="name === 'check'">
      <path d="m5 12 4 4L19 6" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5v14M5 12h14" />
    </template>
    <template v-else-if="name === 'chevron'">
      <path d="m8 10 4 4 4-4" />
    </template>
  </svg>
</template>
