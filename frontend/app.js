const API = window.API_BASE_URL;
const $ = (id) => document.getElementById(id);

async function health() {
  try {
    const r = await fetch(`${API}/api/health`);
    const d = await r.json();
    $("health").textContent = d.ok ? "Backend reachable." : "Backend unhealthy.";
  } catch {
    $("health").textContent = `Cannot reach the backend at ${API}.`;
  }
}

async function load() {
  $("status").textContent = "";
  try {
    const r = await fetch(`${API}/api/items`);
    const items = await r.json();
    $("items").innerHTML = items
      .map((i) => `<li>${i.title.replace(/[<>&]/g, (c) =>
        ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</li>`)
      .join("");
  } catch {
    $("status").textContent = "Could not load items.";
  }
}

$("add").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("title").value;
  try {
    const r = await fetch(`${API}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      $("status").textContent = d.error || `Request failed (${r.status}).`;
      return;
    }
    $("title").value = "";
    await load();
  } catch {
    $("status").textContent = "Could not reach the backend.";
  }
});

health();
load();
