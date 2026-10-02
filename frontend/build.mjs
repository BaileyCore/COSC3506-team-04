import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

const files = [
  "index.html",
  "app.js",
  "config.js",
  "student.html",
  "student.js",
  "project.html",
  "project.js",
  "inquiry.html",
  "inquiry.js",
];

for (const file of files) {
  await cp(file, `dist/${file}`);
}

console.log("Built static frontend in frontend/dist");