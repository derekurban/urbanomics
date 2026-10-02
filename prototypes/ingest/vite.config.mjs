import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),base:'/lab/',build:{outDir:fileURLToPath(new URL('../../private/ingest-lab',import.meta.url)),emptyOutDir:true}});
