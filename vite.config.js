import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  root: './src/viewer', // index.html 위치
  base: './', // 상대 경로 (필수)
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/viewer'),
    },
  },
  build: {
    outDir: '../../docs', // 루트 기준 docs 폴더 (GitHub Pages)
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
  },
});
