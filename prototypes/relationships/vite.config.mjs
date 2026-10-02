import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),server:{host:'127.0.0.1',port:4183,strictPort:true},build:{outDir:fileURLToPath(new URL('../../private/relationships-build',import.meta.url)),emptyOutDir:true}});
