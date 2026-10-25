import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Pre-bundle the heavy, lazily-loaded libraries at dev-server start so the
  // first visit to the report / charts pages does not trigger a page reload.
  optimizeDeps: {
    include: ['pdfjs-dist', 'tesseract.js', 'recharts'],
  },
  build: {
    // The main chunk includes the Supabase client (~200 kB) when cloud history
    // is configured; pdf.js, OCR and charts are already split out and loaded
    // on demand. Warn only if the main chunk grows well beyond that.
    chunkSizeWarningLimit: 700,
  },
})
