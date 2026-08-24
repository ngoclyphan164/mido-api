import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./test/setup-env.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/**/*.module.ts'],
      thresholds: {
        lines: 0,
        'src/midpoint/**': {
          statements: 80,
          branches: 65,
          functions: 90,
          lines: 85,
        },
      },
    },
  },
  // Nest cần decorator metadata; swc nhanh hơn ts-jest/esbuild cho việc này
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
