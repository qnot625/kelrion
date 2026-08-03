import { spawn } from "node:child_process";
import net from "node:net";

const preferredApiPort = Number.parseInt(process.env.PORT || "3001", 10);
const preferredWebPort = Number.parseInt(process.env.VITE_PORT || "3000", 10);

async function getAvailablePort(startPort) {
  for (let offset = 0; offset < 20; offset += 1) {
    const port = startPort + offset;
    try {
      const server = net.createServer();
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "0.0.0.0", () => {
          server.close(() => resolve(undefined));
        });
      });
      return port;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Could not find an available port starting from ${startPort}`);
}

async function main() {
  const apiPort = await getAvailablePort(preferredApiPort);
  const webPort = await getAvailablePort(preferredWebPort);

  console.warn(`[Dev] Starting Klerion Fastify API on port ${apiPort}...`);
  const api = spawn("node", ["--import", "tsx", "apps/api/src/index.ts"], {
    env: { ...process.env, PORT: String(apiPort) },
    stdio: "inherit",
  });

  console.warn(`[Dev] Starting Klerion Company Console (Vite) on port ${webPort}...`);
  const web = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", "--host", "0.0.0.0", "--port", String(webPort)], {
    cwd: "apps/web",
    env: { ...process.env, VITE_API_BASE_URL: "/api" },
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  const cleanup = () => {
    api.kill();
    web.kill();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
