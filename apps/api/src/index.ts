import { createAppContext } from "./context.js";
import { buildServer } from "./server.js";

const app = buildServer(createAppContext());
const port = Number(process.env.PORT ?? 3000);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    console.warn(`AdminOps API listening on port ${port}`);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
