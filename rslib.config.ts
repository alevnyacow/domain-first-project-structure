import { defineConfig } from '@rslib/core';

export default defineConfig({
  source: {
    entry: {
      index: './src/index.ts',
      lint: './src/lint.ts',
      integration: './src/integration.ts',
      init: './src/init.ts',
      react: './src/react.ts',
    },
  },
  lib: [
    {
      format: 'esm',
      syntax: ['node 22'],
      dts: true,
    },
    {
      format: 'cjs',
      syntax: ['node 22'],
    },
  ],
});
