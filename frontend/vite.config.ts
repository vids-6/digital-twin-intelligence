import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// strictPort: the backend only allows the origins listed in CORS_ORIGINS (5173 for dev, 4173 for preview).
// If the port were silently changed, every API call would fail with a CORS error.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
