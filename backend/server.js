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

app.get("/api/students", async (request, response, next) => {
  try {
    const search = (request.query.search || "").toLowerCase();
    const skill = request.query.skill;
    const availability = request.query.availability;
    const status = request.query.status;

    const result = await pool.query(`
      SELECT
        s.id,
        s.name,
        s.headline,
        s.program,
        s.status,
        s.profile_status,
        s.availability,
        s.links,
        COALESCE(
          json_agg(DISTINCT ss.skill_name)
          FILTER (WHERE ss.skill_name IS NOT NULL),
          '[]'
        ) AS skills,
        COUNT(DISTINCT pc.project_id)::int AS project_count
      FROM students s
      LEFT JOIN student_skills ss
        ON ss.student_id = s.id
      LEFT JOIN project_contributors pc
        ON pc.student_id = s.id
      WHERE s.profile_status = 'published'
      GROUP BY s.id
      ORDER BY s.name ASC
    `);

    let students = result.rows;

    if (search) {
      students = students.filter((student) => {
        const searchable = [
          student.name,
          student.headline,
          ...(student.skills || []),
        ]
          .join(" ")
          .toLowerCase();

        return searchable.includes(search);
      });
    }

    if (skill) {
      const requestedSkills = Array.isArray(skill) ? skill : [skill];

      students = students.filter((student) =>
        requestedSkills.every((requestedSkill) =>
          student.skills.includes(requestedSkill)
        )
      );
    }

    if (availability) {
      const requestedAvailability = Array.isArray(availability)
        ? availability
        : [availability];

      students = students.filter((student) =>
        requestedAvailability.some((value) =>
          student.availability.includes(value)
        )
      );
    }

    if (status) {
      const requestedStatuses = Array.isArray(status) ? status : [status];

      students = students.filter((student) =>
        requestedStatuses.includes(student.status)
      );
    }

    response.json(students);
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
    const { id } = request.params;

    const studentResult = await pool.query(
      `
      SELECT
        s.id,
        s.name,
        s.headline,
        s.program,
        s.status,
        s.profile_status,
        s.availability,
        s.links,
        COALESCE(
          json_agg(DISTINCT ss.skill_name)
          FILTER (WHERE ss.skill_name IS NOT NULL),
          '[]'
        ) AS skills
      FROM students s
      LEFT JOIN student_skills ss
        ON ss.student_id = s.id
      WHERE s.id = $1
        AND s.profile_status = 'published'
      GROUP BY s.id
      `,
      [id]
    );

    if (studentResult.rows.length === 0) {
      response.status(404).json({
        error: "Student not found",
      });
      return;
    }

    const projectResult = await pool.query(
      `
      SELECT
        p.id,
        p.title,
        p.description,
        p.domain,
        p.technologies,
        p.links,
        pc.role
      FROM projects p
      JOIN project_contributors pc
        ON pc.project_id = p.id
      WHERE pc.student_id = $1
      ORDER BY p.title ASC
      `,
      [id]
    );

    response.json({
      ...studentResult.rows[0],
      projects: projectResult.rows,
    });
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

app.use((error, _request, response, _next) => {
  console.error("Unexpected API error:", error.message);
  response.status(500).json({ error: "unexpected server error" });
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on port ${port}`);
});
