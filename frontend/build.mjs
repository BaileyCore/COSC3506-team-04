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
  "profile.html",
  "profile.js",
  "r3-projects.html",
  "r3-project.html",
  "r3.js",
  "r3-public.js",
  "r3-profile-projects.js",
  "r3.css",
  "r3-working-demo.html",
  "fallback.svg",
];

for (const file of files) {
  await cp(file, `dist/${file}`);
}

console.log("Built static frontend in frontend/dist");
