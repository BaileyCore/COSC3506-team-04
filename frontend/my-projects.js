const form = document.getElementById("project-form");
const feedback = document.getElementById("project-feedback");
const saveButton = form.querySelector('button[type="submit"]');

const cancelEditButton = document.getElementById("cancel-edit");
let editingProject = null;

function resetProjectForm() {
    editingProject = null;
    form.reset();
    saveButton.textContent = "Save Draft";
    cancelEditButton.hidden = true;
}

cancelEditButton.addEventListener("click", () => {
    resetProjectForm();
    feedback.textContent = "";
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const draft = editingProject;
    const fields = new FormData(form);
    const body = {
        title: fields.get("title"),
        short_description: fields.get("short_description"),
        domain: fields.get("domain"),
        technologies: fields.get("technologies").split(",").map((name) => name.trim()).filter(Boolean),
    };

    let url = `${window.API_BASE_URL}/api/r3/projects`;
    if (draft) {
        url += `/${encodeURIComponent(draft.id)}`;
        body.version = draft.version;
    }

    saveButton.disabled = true;
    cancelEditButton.disabled = true;
    feedback.textContent = "Saving…";

    try {
        const response = await fetch(url, {
        method: draft ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const result = await response.json();

    if (!response.ok) {
        feedback.textContent = result.error || "Could not save the draft.";
        if (response.status === 409) await loadProjects();
        return;
    }

    resetProjectForm();
    feedback.textContent = draft
        ? `Updated “${result.project.title}”.`
        : `Saved “${result.project.title}” as a private draft.`;
    await loadProjects();
    } catch {
    feedback.textContent = "Could not save the draft. Check that your local backend is running.";
    } finally {
    saveButton.disabled = false;
    cancelEditButton.disabled = false;
    }
});

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
        if (!project.is_published) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit ${project.title}`);

    editButton.addEventListener("click", () => {
        if (saveButton.disabled) return;

    editingProject = project;
    form.elements.namedItem("title").value = project.title;
    form.elements.namedItem("short_description").value =
        project.short_description ?? "";
    form.elements.namedItem("domain").value = project.domain ?? "";
    form.elements.namedItem("technologies").value = (project.technologies ?? []).join(", ");
    saveButton.textContent = "Save Changes";
    cancelEditButton.hidden = false;
    feedback.textContent = `Editing “${project.title}”.`;
    form.elements.namedItem("title").focus();
    });

    item.append(" ", editButton);
}
    list.append(item);
    }

    status.textContent = result.projects.length ? "" : "No projects yet.";
} catch {
    status.textContent = "Could not load your projects. Try refreshing.";
}
}

loadProjects();
