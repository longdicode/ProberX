import type { FastifyPluginAsync } from "fastify";
import { renderLandingPage } from "../services/render.service.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminDir = path.join(__dirname, "..", "..", "admin");

export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req, reply) => {
    // Serve the static landing page (new design) if present
    const rootDir = path.join(__dirname, "..", "..");
    const staticPage = path.join(rootDir, "index.html");
    if (fs.existsSync(staticPage)) {
      return reply.type("text/html; charset=utf-8").send(fs.readFileSync(staticPage, "utf-8"));
    }
    // Fallback to the legacy rendered page
    const queryLang = (req.query as { lang?: string }).lang;
    const lang = (queryLang === "en" || queryLang === "zh") ? queryLang : "zh";
    const html = renderLandingPage(lang);
    return reply.type("text/html; charset=utf-8").send(html);
  });


  // Agent install script
  app.get("/install-agent.sh", async (_req, reply) => {
    const downloadsDir = path.join(__dirname, "..", "..", "downloads");
    const fp = path.join(downloadsDir, "install-agent.sh");
    if (!fs.existsSync(fp)) return reply.status(404).send("Not found");
    return reply.type("text/x-sh; charset=utf-8").send(fs.readFileSync(fp, "utf-8"));
  });
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // MCP
  app.get("/mcp", async (_req, reply) => {
    const docsDir = path.join(__dirname, "..", "..", "docs");
    const fp = path.join(docsDir, "mcp.html");
    if (!fs.existsSync(fp)) return reply.status(404).send("MCP page not found");
    return reply.type("text/html; charset=utf-8").send(fs.readFileSync(fp, "utf-8"));
  });

  // Docs
  app.get("/docs", async (_req, reply) => {
    const docsDir = path.join(__dirname, "..", "..", "docs");
    const fp = path.join(docsDir, "index.html");
    if (!fs.existsSync(fp)) return reply.status(404).send("Docs not found");
    return reply.type("text/html; charset=utf-8").send(fs.readFileSync(fp, "utf-8"));
  });

  app.get("/docs/:page", async (req, reply) => {
    const raw = (req.params as { page: string }).page;
    const page = raw.replace(/\.html$/, "");
    if (page.includes("..") || page.includes("/") || page.includes("\\")) return reply.status(403).send("Forbidden");
    const docsDir = path.join(__dirname, "..", "..", "docs");
    const fp = path.join(docsDir, page + ".html");
    if (!fs.existsSync(fp)) return reply.status(404).send("Page not found");
    return reply.type("text/html; charset=utf-8").send(fs.readFileSync(fp, "utf-8"));
  });

  app.get("/admin", async (_req, reply) => {
    const filePath = path.join(adminDir, "index.html");
    if (!fs.existsSync(filePath)) return reply.status(404).send("Admin panel not found");
    return reply.type("text/html; charset=utf-8").send(fs.readFileSync(filePath, "utf-8"));
  });

  app.get("/admin/:file", async (req, reply) => {
    const { file } = req.params as { file: string };
    if (file.includes("..") || file.includes("/") || file.includes("\\")) return reply.status(403).send("Forbidden");
    const filePath = path.join(adminDir, file);
    if (!fs.existsSync(filePath)) return reply.status(404).send("Not found");
    const ext = path.extname(file);
    const mimeTypes: Record<string, string> = {
      ".css": "text/css", ".js": "application/javascript", ".html": "text/html",
      ".png": "image/png", ".svg": "image/svg+xml",
    };
    const isTextAsset = [".css", ".js", ".html", ".svg"].includes(ext);
    const fileData = fs.readFileSync(filePath, isTextAsset ? "utf-8" : null);
    return reply.type(mimeTypes[ext] || "application/octet-stream").send(fileData);
  });
};
