declare module 'pako' {
  export interface DeflateOptions {
    level?: number
  }

  export function deflate(data: Uint8Array, options?: DeflateOptions): Uint8Array
  export function inflate(data: Uint8Array): Uint8Array
}
