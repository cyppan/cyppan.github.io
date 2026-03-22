import { readFileSync } from "node:fs";
import type { Context } from "hono";
import { Hono } from "hono";

const pages = new Hono();

function serveIndex(c: Context) {
  const html = readFileSync("dist/client/index.html", "utf-8");
  return c.html(html);
}

pages.get("/n/:slug", serveIndex);
pages.get("/edit/:slug", serveIndex);
pages.get("/", serveIndex);

export default pages;
