import assert from "node:assert/strict";
import http from "node:http";
import { afterEach, test } from "node:test";

import {
  Reporter,
  checkMarker,
  createMarker,
  verifyApp,
} from "../scripts/verify-phase0.mjs";

const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function startFixture({ fixed }) {
  const items = [{ id: 1, title: "First item", created_at: new Date().toISOString() }];
  const server = http.createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    if (request.url === "/" && request.method === "GET") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end('<p id="health"></p><ul id="items"></ul>');
      return;
    }
    if (request.url === "/api/health" && request.method === "GET") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, database: "reachable" }));
      return;
    }
    if (request.url === "/api/items" && request.method === "GET") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify([...items].reverse()));
      return;
    }
    if (request.url === "/api/items" && request.method === "POST") {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const title = JSON.parse(raw).title;
      if (fixed && String(title).trim().length === 0) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "title is required" }));
        return;
      }
      const item = { id: items.length + 1, title, created_at: new Date().toISOString() };
      items.push(item);
      response.writeHead(201, { "Content-Type": "application/json" });
      response.end(JSON.stringify(item));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

test("baseline verifier confirms the intentional defect", async () => {
  const url = await startFixture({ fixed: false });
  const reporter = new Reporter({ quiet: true });
  const ok = await verifyApp({ backendUrl: url, frontendUrl: url, expect: "defect", reporter });
  assert.equal(ok, true, reporter.failures.join("\n"));
});

test("fixed verifier confirms server-side rejection", async () => {
  const url = await startFixture({ fixed: true });
  const reporter = new Reporter({ quiet: true });
  const ok = await verifyApp({ backendUrl: url, frontendUrl: url, expect: "fixed", reporter });
  assert.equal(ok, true, reporter.failures.join("\n"));
});

test("fixed verifier rejects a still-defective backend", async () => {
  const url = await startFixture({ fixed: false });
  const reporter = new Reporter({ quiet: true });
  const ok = await verifyApp({ backendUrl: url, frontendUrl: url, expect: "fixed", reporter });
  assert.equal(ok, false);
  assert.match(reporter.failures.join("\n"), /Expected the fixed boundary/);
});

test("persistence marker can be created and found", async () => {
  const url = await startFixture({ fixed: false });
  const createReporter = new Reporter({ quiet: true });
  const created = await createMarker({ backendUrl: url, reporter: createReporter });
  assert.equal(created.ok, true, createReporter.failures.join("\n"));

  const checkReporter = new Reporter({ quiet: true });
  const found = await checkMarker({ backendUrl: url, marker: created.marker, reporter: checkReporter });
  assert.equal(found, true, checkReporter.failures.join("\n"));
});
