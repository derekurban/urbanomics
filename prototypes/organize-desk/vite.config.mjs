import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {host: '127.0.0.1', port: 4184, strictPort: true},
  build: {outDir: fileURLToPath(new URL('../../private/organize-desk-build', import.meta.url)), emptyOutDir: true},
});
