import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const buildTime = new Date().toISOString();
const buildSha = process.env.VITE_BUILD_SHA || process.env.GITHUB_SHA || 'development';

export default defineConfig({
  base: '/Simplified_Analysis/',
  plugins: [tailwindcss()],
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
  server: {
    watch: {
      ignored: ['**/benchmarks/**', '**/reports/**'],
    },
  },
});
