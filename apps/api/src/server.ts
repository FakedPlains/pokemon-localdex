import { serve } from "@hono/node-server";
import { app } from "./app.ts";

const port = Number(process.env.PORT ?? 3030);
const hostname = process.env.HOST ?? "0.0.0.0";

serve({ fetch: app.fetch, port, hostname }, () => {
  const displayHost = hostname === "0.0.0.0" ? "localhost" : hostname;
  console.log(`Pokemon LocalDex API listening on http://${displayHost}:${port}`);
});
