import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  },
  server: {
    // middleware mode 下端口由 server.ts 控制，此处仅作为 SPA fallback 时的回退
    strictPort: false
  }
});
