import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  // 5173 belongs to another project on this machine — this one lives on 5180.
  server: { port: 5180, open: false },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0, // keep the woff2 files as real files, not base64
    rollupOptions: {
      output: {
        // Rolldown (Vite 8) wants a function here, not the record form.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/gsap') || id.includes('node_modules/lenis')) return 'motion'
        },
      },
    },
  },
})
