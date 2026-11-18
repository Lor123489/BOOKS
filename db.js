import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH || "./data/library.sqlite";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT DEFAULT '',
  category TEXT DEFAULT 'عام',
  description TEXT DEFAULT '',
  filename TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS passages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter TEXT DEFAULT '',
  page_label TEXT DEFAULT '',
  body TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS passage_search USING fts5(
  body, chapter, book_title, author,
  content='',
  tokenize='unicode61 remove_diacritics 2'
);
`);
db.pragma("foreign_keys = ON");

export function normalizeArabic(s = "") {
  return String(s)
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export function addBook({ title, author = "", category = "عام", description = "", filename = "", text }) {
  const chunks = splitText(text);
  const insertBook = db.prepare(`INSERT INTO books(title,author,category,description,filename) VALUES(?,?,?,?,?)`);
  const insertPassage = db.prepare(`INSERT INTO passages(book_id,chapter,page_label,body) VALUES(?,?,?,?)`);
  const insertFts = db.prepare(`INSERT INTO passage_search(rowid,body,chapter,book_title,author) VALUES(?,?,?,?,?)`);
  const tx = db.transaction(() => {
    const info = insertBook.run(title, author, category, description, filename);
    const bookId = Number(info.lastInsertRowid);
    for (const c of chunks) {
      const p = insertPassage.run(bookId, c.chapter, c.page, c.body);
      insertFts.run(Number(p.lastInsertRowid), c.body, c.chapter, title, author);
    }
    return bookId;
  });
  return { id: tx(), passages: chunks.length };
}

export function splitText(input = "") {
  const lines = String(input).replace(/\r\n/g, "\n").split("\n");
  const chunks = [];
  let chapter = "مقدمة";
  let page = "";
  let buffer = [];
  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) chunks.push({ chapter, page, body });
    buffer = [];
  };
  for (const line of lines) {
    const t = line.trim();
    if (/^\[PAGE:\s*([^\]]+)\]$/i.test(t)) {
      flush();
      page = t.match(/^\[PAGE:\s*([^\]]+)\]$/i)[1].trim();
      continue;
    }
    if (/^#{1,3}\s+/.test(t)) {
      flush();
      chapter = t.replace(/^#{1,3}\s+/, "");
      continue;
    }
    buffer.push(line);
    if (buffer.join("\n").length >= 1800) flush();
  }
  flush();
  return chunks;
}

export function searchLibrary(query, limit = 10) {
  const q = String(query || "").trim();
  if (!q) return [];
  // FTS phrase/prefix query. Escape quotes to avoid malformed expressions.
  const safe = q.replace(/"/g, '""').split(/\s+/).filter(Boolean).map(x => `"${x}"*`).join(" AND ");
  try {
    return db.prepare(`
      SELECT p.id AS passage_id, p.book_id, b.title, b.author, b.category,
             p.chapter, p.page_label, p.body,
             snippet(passage_search, 0, '<mark>', '</mark>', ' … ', 18) AS excerpt
      FROM passage_search
      JOIN passages p ON p.id = passage_search.rowid
      JOIN books b ON b.id = p.book_id
      WHERE passage_search MATCH ?
      ORDER BY rank LIMIT ?
    `).all(safe, Math.min(Math.max(Number(limit) || 10, 1), 50));
  } catch {
    const like = `%${q}%`;
    return db.prepare(`
      SELECT p.id AS passage_id, p.book_id, b.title, b.author, b.category,
             p.chapter, p.page_label, p.body, substr(p.body,1,280) AS excerpt
      FROM passages p JOIN books b ON b.id=p.book_id
      WHERE p.body LIKE ? OR p.chapter LIKE ? OR b.title LIKE ? OR b.author LIKE ?
      LIMIT ?
    `).all(like, like, like, like, Math.min(Number(limit) || 10, 50));
  }
}

export function listBooks() {
  return db.prepare(`
    SELECT b.*, COUNT(p.id) AS passage_count
    FROM books b LEFT JOIN passages p ON p.book_id=b.id
    GROUP BY b.id ORDER BY b.created_at DESC
  `).all();
}
export function getBook(id) {
  return db.prepare(`SELECT * FROM books WHERE id=?`).get(Number(id));
}
export function getPassages(bookId, limit = 100, offset = 0) {
  return db.prepare(`SELECT * FROM passages WHERE book_id=? ORDER BY id LIMIT ? OFFSET ?`)
    .all(Number(bookId), Number(limit), Number(offset));
}
export function getPassage(id) {
  return db.prepare(`
    SELECT p.*, b.title, b.author, b.category FROM passages p
    JOIN books b ON b.id=p.book_id WHERE p.id=?
  `).get(Number(id));
}
