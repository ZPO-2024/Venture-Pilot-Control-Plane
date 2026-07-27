import { buildServer } from "./server.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const app = buildServer({ env });

app
  .listen({ port: env.API_PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`venture-pilot-control-plane API listening on :${env.API_PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
