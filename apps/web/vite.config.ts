import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiOrigin = env.KLERION_API_ORIGIN || "http://localhost:3000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiOrigin,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
    build: {
      target: "es2022",
      sourcemap: true,
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
