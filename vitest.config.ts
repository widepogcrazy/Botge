/** @format */

import { defineConfig, type ViteUserConfig } from 'vitest/config';

const viteUserConfig: ViteUserConfig = defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  test: {
    name: { label: 'Testge', color: 'cyan' },
    logHeapUsage: true,
    setupFiles: ['./tests/setup.ts']
  }
});

export default viteUserConfig;
