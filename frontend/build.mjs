import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

const files = [
  "index.html",
  "profile.html",
  "profile.js",
  "profile.css",
  "app.js",
  "config.js",
  "student.html",
  "student.js",
  "project.html",
  "project.js",
  "inquiry.html",
  "inquiry.js",
  "my-projects.html",
  "my-projects.js",
  "r3-project.html",
  "r3-project.js",
];

for (const file of files) {
  await cp(file, `dist/${file}`);
}

console.log("Built static frontend in frontend/dist");
