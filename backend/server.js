require("dotenv").config();

const cors = require("cors");
const express = require("express");
const { Pool } = require("pg");
const path = require("node:path");
const { attachRequestId, logDiagnostic } = require("./diagnostics.cjs");
const { mountFinal } = require("./final_routes.cjs");
const { queryStudentsDirectory, queryStudentDetail } = require("./directory_query.cjs");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Copy backend/.env.example to backend/.env and set it.");
  process.exit(1);
}

const app = express();
app.use(attachRequestId);
const frontendOrigin = process.env.FRONTEND_ORIGIN || "https://cosc3506-team04-frontend.onrender.com";
const accountOrigin = process.env.GITHUB_CALLBACK_URL
  ? new URL(process.env.GITHUB_CALLBACK_URL).origin
  : frontendOrigin;
const allowedOrigins = [...new Set([frontendOrigin, accountOrigin])];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

const isLocalDatabase = process.env.DATABASE_URL.includes("localhost");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
});

const createR2Router = require("./r2");
app.use("/api", createR2Router(pool));

// Release 3: keep the existing R2 signed cookie, GitHub identity, and verified affiliation.
// Neither client-supplied student IDs nor GitHub usernames determine the acting user.
const { mountR3 } = require("./r3_routes.cjs");
app.use('/api/r3', (_req, _res, next) => {
  createR2Router.schemaReady.then(() => next()).catch(next);
});
mountR3(app, {
  pool,
  frontendOrigin: allowedOrigins,
  getVerifiedStudentId: async (request) => {
    const userId = createR2Router.getSession(request);
    if (!userId) return null;
    const { rows } = await pool.query(
      "SELECT user_id FROM r2_accounts WHERE user_id=$1 AND verified_at IS NOT NULL",
      [userId]
    );
    return rows[0]?.user_id || null;
  },
  studentExists: async (studentId) => {
    const { rows } = await pool.query(
      "SELECT 1 FROM r2_accounts WHERE user_id=$1 AND verified_at IS NOT NULL",
      [studentId]
    );
    return rows.length > 0;
  }
});

// Release 4 staff privileges use GitHub's stable account IDs, never a client role.
require("./r4_routes.cjs").mountR4(app, {
  pool,
  ready: createR2Router.schemaReady,
  getSession: createR2Router.getSession,
  origin: allowedOrigins,
  staffGithubIds: process.env.R4_STAFF_GITHUB_IDS
});

// Final Release routes: legacy migration, profile claim/recovery, alumni/availability/retirement,
// duplicate merge + redirect continuity, and staff project maintainer recovery.
mountFinal(app, {
  pool,
  ready: createR2Router.schemaReady,
  getSession: createR2Router.getSession,
  origin: allowedOrigins,
  staffGithubIds: process.env.R4_STAFF_GITHUB_IDS
});

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ ok: true, database: "reachable" });
  } catch (error) {
    logDiagnostic("error", "health_check_failed", { message: error.message });
    response.status(503).json({ ok: false, error: "database unavailable" });
  }
});

// F.28: Bounded SQL-level directory loading with pagination and server-side filtering.
app.get("/api/students", async (request, response, next) => {
  try {
    await createR2Router.schemaReady;
    const result = await queryStudentsDirectory(pool, request.query);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/skills", async (_request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT name
      FROM skills
      ORDER BY name ASC`
    );

    response.json(result.rows.map((row) => row.name));
  } catch (error) {
    next(error);
  }
});
app.get("/api/students/:id", async (request, response, next) => {
  try {
    await createR2Router.schemaReady;
    const result = await queryStudentDetail(pool, request.params.id);
    response.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:id", async (request, response, next) => {
  try {
    const { id } = request.params;

    const projectResult = await pool.query(
      `
      SELECT
        p.id,
        p.title,
        p.description,
        p.domain,
        p.technologies,
        p.links
      FROM projects p
      WHERE p.id = $1
      `,
      [id]
    );

    if (projectResult.rows.length === 0) {
      response.status(404).json({
        error: "Project not found",
      });
      return;
    }

    const contributorResult = await pool.query(
      `
      SELECT
        s.id,
        s.name,
        s.headline,
        pc.role
      FROM project_contributors pc
      JOIN students s
        ON s.id = pc.student_id
      WHERE pc.project_id = $1
      ORDER BY s.name ASC
      `,
      [id]
    );

    response.json({
      ...projectResult.rows[0],
      contributors: contributorResult.rows,
    });
  } catch (error) {
    next(error);
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

// Account pages share the API hostname so the signed session is first-party.
app.use("/r4-fixtures", express.static(path.join(__dirname, "../fixtures/r4")));
app.use(express.static(path.join(__dirname, "../frontend")));

app.use((error, request, response, _next) => {
  logDiagnostic("error", "unexpected_api_error", {
    requestId: request.requestId,
    method: request.method,
    path: request.originalUrl,
    message: error.message,
  });
  response.status(500).json({ error: "unexpected server error", request_id: request.requestId });
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on port ${port}`);
});
