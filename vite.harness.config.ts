import base from './vite.config';
import { mergeConfig } from 'vite';
export default mergeConfig(base, {
  build: { outDir: 'C:/Users/abhij/AppData/Local/Temp/claude/c3c4a011ff0fa55a/db8289c4-f4ca-453e-8524-c0d56f11e4b6/scratchpad/harness-dist', emptyOutDir: true, target: 'esnext', rollupOptions: { input: 'harness.html' } },
});
