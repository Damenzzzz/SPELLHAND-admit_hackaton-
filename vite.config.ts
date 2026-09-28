import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // MediaPipe сам подгружает свой wasm-лоадер — не даём Vite пре-бандлить пакет
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] },
});
