import { defineConfig } from 'tsup';

// Bundles cli + api + wrapper source (../src) into dist/cli.js.
// Runtime deps (baileys, better-sqlite3, ...) stay external and are resolved from node_modules.
export default defineConfig({
  entry: { cli: 'cli/index.ts' },
  outDir: 'dist',
  format: ['cjs'],
  target: 'node18',
  clean: true,
  sourcemap: true,
  external: [
    '@whiskeysockets/baileys',
    'better-sqlite3',
    'pino',
    'qrcode',
    'qrcode-terminal',
    'eventemitter3',
    '@prisma/client',
  ],
});
