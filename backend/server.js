require("dotenv").config();

const cors = require("cors");
const express = require("express");
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Copy backend/.env.example to backend/.env and set it.");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const isLocalDatabase = process.env.DATABASE_URL.includes("localhost");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
});

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ ok: true, database: "reachable" });
  } catch (error) {
    console.error("Health check could not reach PostgreSQL:", error.message);
    response.status(503).json({ ok: false, error: "database unavailable" });
  }
});

app.get("/api/items", async (_request, response, next) => {
  try {
    const result = await pool.query(
      "SELECT id, title, created_at FROM items ORDER BY created_at DESC",
    );
    response.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/items", async (request, response, next) => {
  try {
    // INTENTIONAL DEFECT: whitespace-only titles are accepted.
    // Leave this in place until a peer outside the team files the GitHub issue.
    const title = typeof request.body.title === "string" ? request.body.title : "";
    if (title.length === 0) {
      response.status(400).json({ error: "title is required" });
      return;
    }

    const result = await pool.query(
      "INSERT INTO items (title) VALUES ($1) RETURNING id, title, created_at",
      [title],
    );
    response.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error("Unexpected API error:", error.message);
  response.status(500).json({ error: "unexpected server error" });
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on port ${port}`);
});
