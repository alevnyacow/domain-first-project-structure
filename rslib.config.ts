import { defineConfig } from '@rslib/core';

export default defineConfig({
  source: {
    entry: {
      index: './src/index.ts',
      lint: './src/lint.ts',
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
