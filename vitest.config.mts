import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/lib/engines/**/*.spec.ts',
      'src/lib/util/**/*.spec.ts',
      'src/lib/db/seed/**/*.spec.ts',
      'src/features/**/*.spec.ts',
      'src/lib/intent/**/*.spec.ts',
      'src/lib/ai/**/*.spec.ts',
      'src/lib/auth/**/*.spec.ts',
      'src/lib/onboarding/**/*.spec.ts',
      'src/lib/update/**/*.spec.ts',
      'src/lib/scan/**/*.spec.ts',
      'src/lib/settings/**/*.spec.ts',
      'src/lib/state/**/*.spec.ts',
      'src/lib/platform/**/*.spec.ts',
      'src/lib/reader/**/*.spec.ts',
      'src/lib/mind/**/*.spec.ts',
      'src/lib/opds/**/*.spec.ts',
    ],
  },
});
