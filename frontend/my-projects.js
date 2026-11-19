const form = document.getElementById("project-form");
const feedback = document.getElementById("project-feedback");
const saveButton = form.querySelector('button[type="submit"]');

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const fields = new FormData(form);
    saveButton.disabled = true;
    feedback.textContent = "Saving draft…";

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/r3/projects`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: fields.get("title"),
                short_description: fields.get("short_description"),
    }),
    });

    const result = await response.json();

    if (!response.ok) {
        feedback.textContent = result.error || "Could not save the draft.";
        return;
    }

    feedback.textContent = `Saved “${result.project.title}” as a private draft.`;
    form.reset();
} catch {
    feedback.textContent = "Could not save the draft. Check that your local backend is running.";
} finally {
    saveButton.disabled = false;

async function loadProjects() {
    const list = document.getElementById("saved-projects");
    const status = document.getElementById("projects-status");

    status.textContent = "Loading projects…";

    try {
    const response = await fetch(`${window.API_BASE_URL}/api/r3/projects`, {
        credentials: "include",
    });
    const result = await response.json();

    if (!response.ok) {
        status.textContent = result.error || "Could not load your projects.";
        return;
    }

    list.replaceChildren();

    for (const project of result.projects) {
        const item = document.createElement("li");
        const label = project.is_published ? "Published" : "Draft";
        item.textContent = `${project.title} (${label})`;
        list.append(item);
    }

    status.textContent = result.projects.length ? "" : "No projects yet.";
} catch {
    status.textContent = "Could not load your projects. Try refreshing.";
}
}

loadProjects();
}
});