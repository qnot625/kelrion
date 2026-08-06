import { createServer } from "./server.js";

const app = createServer();
const port = Number(process.env.PORT) || 3001;

app.listen({ port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`[Fastify API] Running on ${address}`);
});
