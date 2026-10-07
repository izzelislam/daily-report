import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    host: '::', // dual-stack: works for both http://localhost (IPv6) and 127.0.0.1 (IPv4)
    proxy: { '/api': 'http://localhost:3000' },
  },
});
