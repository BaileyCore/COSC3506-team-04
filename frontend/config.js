// Point this at your deployed backend. No trailing slash.
// Local development:  http://localhost:3000
// Deployed:           https://your-api.onrender.com
window.API_BASE_URL = "https://cosc3506-team-04-ey5d.onrender.com"; 

// Use the session on its own hostname for all signed-in workflows.
const accountPages = ["/profile.html", "/r3-projects.html", "/r4-staff.html"];
const accountOrigin = new URL(window.API_BASE_URL).origin;
if (window.location.protocol === "https:" && accountPages.includes(window.location.pathname)
    && window.location.origin !== accountOrigin) {
  window.location.replace(accountOrigin + window.location.pathname + window.location.search + window.location.hash);
}

