import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, addBook, listBooks, getBook, getPassages, getPassage, searchLibrary } from "./db.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(cors({ origin: process.env.WEB_ORIGIN?.split(",") || true }));
app.use(express.json({ limit: "2mb" }));

const uploadDir = path.resolve("data/uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const maxBytes = (Number(process.env.MAX_UPLOAD_MB) || 20) * 1024 * 1024;
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: maxBytes },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, [".txt", ".md"].includes(ext));
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "al-bayan-library" }));
app.get("/api/books", (_req, res) => res.json({ books: listBooks() }));
app.get("/api/books/:id", (req, res) => {
  const book = getBook(req.params.id);
  if (!book) return res.status(404).json({ error: "الكتاب غير موجود" });
  res.json({ book, passages: getPassages(req.params.id, 100, Number(req.query.offset) || 0) });
});
app.get("/api/search", (req, res) => {
  const q = String(req.query.q || "");
  res.json({ query: q, results: searchLibrary(q, req.query.limit || 20) });
});
app.get("/api/passages/:id", (req, res) => {
  const passage = getPassage(req.params.id);
  if (!passage) return res.status(404).json({ error: "المقطع غير موجود" });
  res.json({ passage });
});
app.post("/api/books", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "ارفع ملف TXT أو MD صالحاً" });
  try {
    const text = fs.readFileSync(req.file.path, "utf8");
    if (!text.trim()) return res.status(400).json({ error: "الملف فارغ" });
    const title = String(req.body.title || req.file.originalname).trim();
    const result = addBook({
      title, author: req.body.author || "", category: req.body.category || "عام",
      description: req.body.description || "", filename: req.file.originalname, text
    });
    res.status(201).json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: "تعذر استيراد الكتاب", detail: e.message });
  } finally {
    fs.rmSync(req.file.path, { force: true });
  }
});

// MCP: tools are intentionally read-only. Use the same indexed library as the website.
function makeMcpServer() {
  const server = new McpServer({ name: "al-bayan-library", version: "1.0.0" });
  server.tool(
    "search_library",
    "ابحث في كتب مكتبة البيان. أعد المقاطع المطابقة مع عنوان الكتاب والمؤلف والفصل ورقم الصفحة إن كان مسجلاً.",
    { query: z.string().min(1), limit: z.number().int().min(1).max(20).optional() },
    async ({ query, limit = 8 }) => {
      const rows = searchLibrary(query, limit);
      return { content: [{ type: "text", text: JSON.stringify(rows.map(r => ({
        passage_id: r.passage_id, book_id: r.book_id, title: r.title, author: r.author,
        chapter: r.chapter, page: r.page_label || null, text: r.body
      })), null, 2) }] };
    }
  );
  server.tool(
    "get_book",
    "اعرض بيانات كتاب ومقاطع منه. استخدم book_id الذي تعيده أداة البحث.",
    { book_id: z.number().int(), offset: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(30).optional() },
    async ({ book_id, offset = 0, limit = 10 }) => {
      const book = getBook(book_id);
      if (!book) return { content: [{ type: "text", text: "الكتاب غير موجود." }] };
      const passages = getPassages(book_id, limit, offset);
      return { content: [{ type: "text", text: JSON.stringify({ book, passages }, null, 2) }] };
    }
  );
  server.tool(
    "get_passage",
    "استرجع نص مقطع بعينه مع بيانات الكتاب والفصل والصفحة.",
    { passage_id: z.number().int() },
    async ({ passage_id }) => {
      const passage = getPassage(passage_id);
      return { content: [{ type: "text", text: passage ? JSON.stringify(passage, null, 2) : "المقطع غير موجود." }] };
    }
  );
  return server;
}

app.all("/mcp", async (req, res) => {
  try {
    const mcp = makeMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); mcp.close(); });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP error:", error);
    if (!res.headersSent) res.status(500).json({ error: "MCP request failed" });
  }
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`Al-Bayan API + MCP listening on http://localhost:${port}`));
