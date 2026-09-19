#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_FILES = [
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".gitignore",
  "CHECKPOINTS.md",
  "PHASE0_SUBMISSION_TEMPLATE.md",
  "README.md",
  "schema.sql",
  "backend/.env.example",
  "backend/package.json",
  "backend/server.js",
  "frontend/app.js",
  "frontend/config.js",
  "frontend/index.html",
  "frontend/package.json",
];

export class Reporter {
  constructor({ quiet = false } = {}) {
    this.quiet = quiet;
    this.failures = [];
    this.warnings = [];
  }

  pass(message) {
    if (!this.quiet) console.log(`PASS  ${message}`);
  }

  fail(message) {
    this.failures.push(message);
    if (!this.quiet) console.log(`FAIL  ${message}`);
  }

  warn(message) {
    this.warnings.push(message);
    if (!this.quiet) console.log(`WARN  ${message}`);
  }

  check(condition, passMessage, failMessage = passMessage) {
    if (condition) this.pass(passMessage);
    else this.fail(failMessage);
    return condition;
  }

  finish() {
    if (!this.quiet) {
      console.log("");
      console.log(this.failures.length === 0 ? "RESULT: PASS" : "RESULT: FAIL");
    }
    return this.failures.length === 0;
  }
}

function baseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

export async function verifyApp({ backendUrl, frontendUrl, expect, reporter = new Reporter() }) {
  const backend = baseUrl(backendUrl);
  const frontend = baseUrl(frontendUrl);

  reporter.check(/^https?:\/\//.test(backend), "Backend URL is absolute", "Backend URL must start with http:// or https://");
  reporter.check(/^https?:\/\//.test(frontend), "Frontend URL is absolute", "Frontend URL must start with http:// or https://");
  if (reporter.failures.length) return reporter.finish();

  try {
    const response = await fetch(frontend);
    const html = await response.text();
    reporter.check(response.ok, `Frontend responded with HTTP ${response.status}`, `Frontend returned HTTP ${response.status}`);
    reporter.check(html.includes('id="health"') && html.includes('id="items"'),
      "Frontend contains the Phase 0 application",
      "Frontend response does not contain the expected Phase 0 page");
  } catch (error) {
    reporter.fail(`Could not reach frontend: ${error.message}`);
  }

  try {
    const { response, body } = await fetchJson(`${backend}/api/health`);
    reporter.check(response.ok, `Health endpoint responded with HTTP ${response.status}`, `Health endpoint returned HTTP ${response.status}`);
    reporter.check(body?.ok === true && body?.database === "reachable",
      "Health endpoint confirms the database is reachable",
      "Health response did not confirm database reachability");
  } catch (error) {
    reporter.fail(`Could not reach backend health endpoint: ${error.message}`);
    return reporter.finish();
  }

  let before = [];
  try {
    const { response, body } = await fetchJson(`${backend}/api/items`);
    reporter.check(response.ok, `Items endpoint responded with HTTP ${response.status}`, `Items endpoint returned HTTP ${response.status}`);
    reporter.check(Array.isArray(body), "Items endpoint returned an array", "Items endpoint did not return a JSON array");
    before = Array.isArray(body) ? body : [];
  } catch (error) {
    reporter.fail(`Could not load items: ${error.message}`);
    return reporter.finish();
  }

  const normalTitle = `phase0-verifier-${Date.now()}`;
  try {
    const { response, body } = await fetchJson(`${backend}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: frontend },
      body: JSON.stringify({ title: normalTitle }),
    });
    reporter.check(response.status === 201, "Backend accepted a normal item", `Normal item returned HTTP ${response.status}, expected 201`);
    reporter.check(body?.title === normalTitle, "Backend returned the created item", "Created item response did not preserve its title");
    const allowOrigin = response.headers.get("access-control-allow-origin");
    reporter.check(allowOrigin === "*" || allowOrigin === frontend,
      "Backend allows the frontend origin",
      "Backend response is missing a usable Access-Control-Allow-Origin header");
  } catch (error) {
    reporter.fail(`Could not create a normal item: ${error.message}`);
  }

  try {
    const { response, body } = await fetchJson(`${backend}/api/items`);
    const items = Array.isArray(body) ? body : [];
    reporter.check(response.ok && items.some((item) => item?.title === normalTitle),
      "Created item can be loaded again",
      "Created item was not returned by the items endpoint");
  } catch (error) {
    reporter.fail(`Could not reload the created item: ${error.message}`);
  }

  const blanksBefore = before.filter((item) => typeof item?.title === "string" && item.title.trim() === "").length;
  try {
    const { response } = await fetchJson(`${backend}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: frontend },
      body: JSON.stringify({ title: "   " }),
    });
    const afterResult = await fetchJson(`${backend}/api/items`);
    const after = Array.isArray(afterResult.body) ? afterResult.body : [];
    const blanksAfter = after.filter((item) => typeof item?.title === "string" && item.title.trim() === "").length;

    if (expect === "defect") {
      reporter.check(response.status === 201 && blanksAfter > blanksBefore,
        "Intentional whitespace defect is still reproducible",
        `Expected the intentional defect, but whitespace returned HTTP ${response.status} without a new blank row`);
    } else if (expect === "fixed") {
      reporter.check(response.status >= 400 && response.status < 500 && blanksAfter === blanksBefore,
        "Backend rejects whitespace and stores no invalid row",
        `Expected the fixed boundary, but whitespace returned HTTP ${response.status} or changed the blank-row count`);
    } else {
      reporter.fail("--expect must be defect or fixed");
    }
  } catch (error) {
    reporter.fail(`Could not test the whitespace boundary: ${error.message}`);
  }

  return reporter.finish();
}

export async function createMarker({ backendUrl, reporter = new Reporter() }) {
  const marker = `phase0-persistence-${Date.now()}`;
  try {
    const { response, body } = await fetchJson(`${baseUrl(backendUrl)}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: marker }),
    });
    reporter.check(response.status === 201 && body?.title === marker,
      "Persistence marker was stored",
      `Could not store persistence marker; HTTP ${response.status}`);
    if (reporter.failures.length === 0 && !reporter.quiet) console.log(`MARKER=${marker}`);
  } catch (error) {
    reporter.fail(`Could not create persistence marker: ${error.message}`);
  }
  return { ok: reporter.finish(), marker };
}

export async function checkMarker({ backendUrl, marker, reporter = new Reporter() }) {
  try {
    const { response, body } = await fetchJson(`${baseUrl(backendUrl)}/api/items`);
    const items = Array.isArray(body) ? body : [];
    reporter.check(response.ok && items.some((item) => item?.title === marker),
      "Persistence marker is still present after redeployment",
      "Persistence marker is missing after redeployment");
  } catch (error) {
    reporter.fail(`Could not check persistence marker: ${error.message}`);
  }
  return reporter.finish();
}

function trackedFiles(root) {
  try {
    return execFileSync("git", ["-C", root, "ls-files"], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return null;
  }
}

export function verifyRepository({ root = process.cwd(), production = false, requireTag = null, reporter = new Reporter() }) {
  const absoluteRoot = resolve(root);
  for (const relative of REQUIRED_FILES) {
    reporter.check(existsSync(resolve(absoluteRoot, relative)), `Found ${relative}`, `Missing required file: ${relative}`);
  }

  const tracked = trackedFiles(absoluteRoot);
  if (tracked === null) {
    reporter.fail("This folder is not inside a Git repository");
  } else {
    const trackedSecrets = tracked.filter((file) => basename(file) === ".env");
    reporter.check(trackedSecrets.length === 0,
      "No .env file is tracked by Git",
      `Secret file is tracked by Git: ${trackedSecrets.join(", ")}`);
  }

  const envExample = existsSync(resolve(absoluteRoot, "backend/.env.example"))
    ? readFileSync(resolve(absoluteRoot, "backend/.env.example"), "utf8")
    : "";
  const hasObviousPlaceholders = /USER|PASSWORD|HOST|PORT|DATABASE|YOUR|PROJECT_REF|POOLER/i.test(envExample);
  reporter.check(envExample.includes("DATABASE_URL=") && hasObviousPlaceholders,
    "Environment example names DATABASE_URL without a real credential",
    "backend/.env.example is missing DATABASE_URL or appears to contain a real connection string");

  if (production && existsSync(resolve(absoluteRoot, "frontend/config.js"))) {
    const config = readFileSync(resolve(absoluteRoot, "frontend/config.js"), "utf8");
    reporter.check(!config.includes("localhost") && /https:\/\//.test(config),
      "Frontend configuration points to an HTTPS backend",
      "frontend/config.js still points to localhost or a non-HTTPS backend");
  }

  if (requireTag) {
    try {
      const tagCommit = execFileSync("git", ["-C", absoluteRoot, "rev-list", "-n", "1", requireTag], { encoding: "utf8" }).trim();
      const headCommit = execFileSync("git", ["-C", absoluteRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      reporter.check(Boolean(tagCommit), `Found release tag ${requireTag}`, `Release tag ${requireTag} does not exist`);
      reporter.check(tagCommit === headCommit,
        `${requireTag} points to the current commit`,
        `${requireTag} does not point to the current commit`);
    } catch {
      reporter.fail(`Release tag ${requireTag} does not exist`);
    }
  }

  return reporter.finish();
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    if (key === "production") values[key] = true;
    else values[key] = rest[++i];
  }
  return values;
}

function usage() {
  console.log(`Usage:
  node scripts/verify-phase0.mjs repo [--production] [--require-tag phase0-complete]
  node scripts/verify-phase0.mjs app --backend-url URL --frontend-url URL --expect defect|fixed
  node scripts/verify-phase0.mjs marker-create --backend-url URL
  node scripts/verify-phase0.mjs marker-check --backend-url URL --marker VALUE`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    usage();
    return 2;
  }

  if (args.command === "repo") {
    return verifyRepository({ production: Boolean(args.production), requireTag: args.requireTag }) ? 0 : 1;
  }
  if (args.command === "app") {
    if (!args.backendUrl || !args.frontendUrl || !args.expect) {
      usage();
      return 2;
    }
    return await verifyApp(args) ? 0 : 1;
  }
  if (args.command === "marker-create") {
    if (!args.backendUrl) {
      usage();
      return 2;
    }
    return (await createMarker(args)).ok ? 0 : 1;
  }
  if (args.command === "marker-check") {
    if (!args.backendUrl || !args.marker) {
      usage();
      return 2;
    }
    return await checkMarker(args) ? 0 : 1;
  }

  usage();
  return 2;
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  process.exitCode = await main();
}
