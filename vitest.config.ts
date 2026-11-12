import { defineConfig } from 'vitest/config';

// tests/*.cjs는 node:test로 돌리는 web/ 테스트라서 vitest 대상에서 뺀다
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } });
