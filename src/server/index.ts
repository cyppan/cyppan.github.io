import path from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { initIndex, startWatcher } from "./notes.ts";
import api from "./routes/api.ts";
import pages from "./routes/pages.ts";

const notesDir = path.resolve(process.cwd(), "notes");

await initIndex(notesDir);
startWatcher(notesDir);

const app = new Hono();

app.route("/api", api);
app.use("/media/*", serveStatic({ root: "./" }));

const isProd = process.env.NODE_ENV === "production";

if (isProd) {
  app.use("/*", serveStatic({ root: "./dist/client" }));
  app.route("/", pages);
}

export default {
  port: 3000,
  fetch: app.fetch,
};
