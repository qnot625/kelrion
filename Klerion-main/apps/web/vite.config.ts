import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fastifyApiPlugin(): Plugin {
  let apiProcess: ChildProcess | null = null;
  return {
    name: "fastify-api-plugin",
    configureServer(server) {
      if (apiProcess) return;
      const rootDir = path.resolve(__dirname, "../..");
      const entryPath = path.resolve(__dirname, "../api/src/index.ts");
      apiProcess = spawn("node", ["--import", "tsx", entryPath], {
        cwd: rootDir,
        env: { ...process.env, PORT: "3001" },
        stdio: "inherit",
      });

      apiProcess.on("error", (err) => {
        console.error("[Fastify API] Failed to start child process:", err);
      });

      const killProcess = () => {
        if (apiProcess) {
          apiProcess.kill();
          apiProcess = null;
        }
      };

      process.on("exit", killProcess);
      process.on("SIGINT", killProcess);
      process.on("SIGTERM", killProcess);

      server.httpServer?.on("close", killProcess);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const rawApiOrigin = env.KLERION_API_ORIGIN || process.env.KLERION_API_ORIGIN;
  const apiOrigin =
    rawApiOrigin && !rawApiOrigin.includes(":3000")
      ? rawApiOrigin
      : "http://127.0.0.1:3001";

  return {
    plugins: [react(), tailwindcss(), fastifyApiPlugin()],
    server: {
      port: 3000,
      host: "0.0.0.0",
      strictPort: true,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:3001",
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on("error", (err) => {
              console.error("[Vite Proxy Error]", err);
            });
          },
        },
      },
    },
    preview: {
      port: 3000,
      host: "0.0.0.0",
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
