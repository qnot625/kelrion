import { buildServer } from "./server.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

const server = buildServer({ logger: true });

async function start() {
  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`AdminOps API Service running on http://${HOST}:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  start();
}

export { buildServer };
