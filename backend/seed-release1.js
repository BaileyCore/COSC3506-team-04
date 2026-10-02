require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
console.error("DATABASE_URL is missing.");
process.exit(1);
}

const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

const students = JSON.parse(
fs.readFileSync(path.join(__dirname, "../fixtures/students.json"), "utf8")
);

const projects = JSON.parse(
fs.readFileSync(path.join(__dirname, "../fixtures/projects.json"), "utf8")
);

const skills = JSON.parse(
fs.readFileSync(path.join(__dirname, "../fixtures/skills.json"), "utf8")
);

async function seed() {
    try {
    console.log("Starting Release 1 import...");

    for (const skill of skills) {
    await pool.query(
        `INSERT INTO skills (name)
        VALUES ($1)
        ON CONFLICT (name) DO NOTHING`,
        [skill]
    );
    }

    for (const student of students) {
    await pool.query(
        `INSERT INTO students
        (id, name, headline, program, status, profile_status, availability, links)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id)
        DO UPDATE SET
        name = EXCLUDED.name,
        headline = EXCLUDED.headline,
        program = EXCLUDED.program,
        status = EXCLUDED.status,
        profile_status = EXCLUDED.profile_status,
        availability = EXCLUDED.availability,
        links = EXCLUDED.links`,
        [
        student.id,
        student.name,
        student.headline,
        student.program,
        student.status,
        student.profile_status,
        JSON.stringify(student.availability),
        JSON.stringify(student.links),
        ]
    );

    for (const skill of student.skills) {
        await pool.query(
        `INSERT INTO student_skills (student_id, skill_name)
        VALUES ($1,$2)
        ON CONFLICT DO NOTHING`,
        [student.id, skill]
        );
    }
    }

    for (const project of projects) {
    await pool.query(
        `INSERT INTO projects
        (id, title, description, domain, technologies, links)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (id)
        DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        domain = EXCLUDED.domain,
        technologies = EXCLUDED.technologies,
        links = EXCLUDED.links`,
        [
        project.id,
        project.title,
        project.description,
        project.domain,
        JSON.stringify(project.technologies),
        JSON.stringify(project.links),
        ]
    );

    for (const contributor of project.contributors) {
        await pool.query(
        `INSERT INTO project_contributors
            (project_id, student_id, role)
        VALUES ($1,$2,$3)
        ON CONFLICT (project_id, student_id)
        DO UPDATE SET role = EXCLUDED.role`,
        [project.id, contributor.student_id, contributor.role]
        );
    }
    }

    console.log("Release 1 fixture import complete!");
} catch (error) {
    console.error("Import failed:", error);
} finally {
    await pool.end();
}
}

seed();