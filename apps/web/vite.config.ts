import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiOrigin = env.KLERION_API_ORIGIN || "http://127.0.0.1:3001";

  return {
    plugins: [react()],
    server: {
      port: 3000,
      host: "0.0.0.0",
      strictPort: false,
      proxy: {
        "/api": {
          target: apiOrigin,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
    preview: {
      port: 3000,
      host: "0.0.0.0",
      strictPort: false,
    },
    build: {
      target: "es2022",
      sourcemap: true,
      outDir: "../../dist",
      emptyOutDir: true,
    },
  };
});
