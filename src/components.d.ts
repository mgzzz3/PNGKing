/* eslint-disable */
declare module 'vue' {
  export interface GlobalComponents {
    ElButton: typeof import('element-plus/es')['ElButton']
    RouterLink: typeof import('vue-router')['RouterLink']
    RouterView: typeof import('vue-router')['RouterView']
  }
}
export {}
