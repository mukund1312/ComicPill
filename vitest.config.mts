import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/lib/engines/**/*.spec.ts',
      'src/lib/util/**/*.spec.ts',
    ],
  },
});
