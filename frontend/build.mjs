import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const file of ["index.html", "app.js", "config.js"]) {
  await cp(file, `dist/${file}`);
}
console.log("Built static frontend in frontend/dist");
