import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadConfig } from "./shared/config.ts";
import { createDb } from "./shared/db/client.ts";

const config = loadConfig();
const database = createDb(config.DATABASE_URL);
const app = createApp({ pingDb: database.ping });

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});

const shutdown = () => {
  server.close();
  void database.close();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
