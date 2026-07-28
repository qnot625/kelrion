import { createAppContextFromEnv } from "./context.js";
import { buildServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);

const context = await createAppContextFromEnv();
const app = buildServer(context);

try {
  await app.listen({ port, host: "0.0.0.0" });
  console.warn(`AdminOps API listening on port ${port}`);
} catch (error) {
  console.error(error);
  await context.close();
  process.exit(1);
}
