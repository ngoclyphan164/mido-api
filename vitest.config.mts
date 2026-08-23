import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/**/*.module.ts'],
      thresholds: {
        // midpoint/ là phần dễ sai âm thầm — giữ ngưỡng cao ở đó khi Phase 2 xong
        lines: 0,
      },
    },
  },
  // Nest cần decorator metadata; swc nhanh hơn ts-jest/esbuild cho việc này
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
