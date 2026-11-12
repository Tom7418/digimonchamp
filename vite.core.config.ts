import { defineConfig } from 'vite';

// src/core 규칙 엔진을 web/core.js 한 파일로 묶는다. web/는 빌드 없이 Pages에 그대로 배포된다.
export default defineConfig({
  build: {
    lib: { entry: 'src/web-core.ts', name: 'ChampCore', formats: ['iife'], fileName: () => 'core.js' },
    outDir: 'web',
    emptyOutDir: false,
    minify: false,
    copyPublicDir: false,
  },
});
