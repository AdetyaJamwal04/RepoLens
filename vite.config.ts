import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'extension-manifest-and-paths',
      generateBundle() {
        // Emit extension manifest to dist root
        this.emitFile({
          type: 'asset',
          fileName: 'manifest.json',
          source: readFileSync(resolve(__dirname, 'extension/manifest.json'), 'utf-8'),
        });
      },
      closeBundle() {
        // Relocate dist/src/sidepanel/index.html to dist/sidepanel/index.html
        const srcSidepanelHtml = resolve(__dirname, 'dist/src/sidepanel/index.html');
        const targetDir = resolve(__dirname, 'dist/sidepanel');
        const targetHtml = resolve(targetDir, 'index.html');

        if (existsSync(srcSidepanelHtml)) {
          mkdirSync(targetDir, { recursive: true });
          copyFileSync(srcSidepanelHtml, targetHtml);
          rmSync(resolve(__dirname, 'dist/src'), { recursive: true, force: true });
        }
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background' || chunkInfo.name === 'content') {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
