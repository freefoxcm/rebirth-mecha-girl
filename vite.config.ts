import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    // QA 脚本固定访问 127.0.0.1；显式绑定 IPv4，避免 Vite 只监听 ::1。
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
