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
        project_date: fields.get("project_date") || null,
        project_status: fields.get("project_status") || null,
        source_url: fields.get("source_url") || null,
        demo_url: fields.get("demo_url") || null,
        fallback_url: fields.get("fallback_url") || null,
        video_url: fields.get("video_url") || null,
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
    form.elements.namedItem("project_date").value = project.project_date ?? "";
    form.elements.namedItem("project_status").value = project.project_status ?? "";
    form.elements.namedItem("source_url").value = project.source_url ?? "";
    form.elements.namedItem("demo_url").value = project.demo_url ?? "";
    form.elements.namedItem("fallback_url").value = project.fallback_url ?? "";
    form.elements.namedItem("video_url").value = project.video_url ?? "";
    saveButton.textContent = "Save Changes";
    cancelEditButton.hidden = false;
    feedback.textContent = `Editing “${project.title}”.`;
    form.elements.namedItem("title").focus();
    });

    item.append(" ", editButton);
    
    const publishButton = document.createElement("button");
publishButton.type = "button";
publishButton.textContent = "Publish";
publishButton.setAttribute("aria-label", `Publish ${project.title}`);

publishButton.addEventListener("click", async () => {
    if (editingProject?.id === project.id) {
    feedback.textContent = "Save or cancel your edits before publishing.";
    return;
    }

    if (!window.confirm(`Make “${project.title}” and its saved links public?`)) {
    return;
    }

    publishButton.disabled = true;
    try {
        const response = await fetch(
        `${window.API_BASE_URL}/api/r3/projects/${encodeURIComponent(project.id)}/publish`,
        { method: "POST", credentials: "include" }
    );
    const result = await response.json();

    if (!response.ok) {
        feedback.textContent = result.error || "Could not publish this draft.";
        return;
    }

    feedback.textContent = `Published “${result.project.title}”.`;
    await loadProjects();
    } catch {
    feedback.textContent = "Could not publish this draft. Try refreshing My Projects.";
    } finally {
    publishButton.disabled = false;
    }
});

item.append(" ", publishButton);

const deleteButton = document.createElement("button");
deleteButton.type = "button";
deleteButton.textContent = "Delete Draft";
deleteButton.setAttribute("aria-label", `Delete draft ${project.title}`);

deleteButton.addEventListener("click", async () => {
    if (editingProject?.id === project.id) {
        feedback.textContent = "Save or cancel your edits before deleting this draft.";
    return;
    }

    if (!window.confirm(`Permanently delete “${project.title}”?`)) return;

    deleteButton.disabled = true;
    try {
        const response = await fetch(
        `${window.API_BASE_URL}/api/r3/projects/${encodeURIComponent(project.id)}`,
        { method: "DELETE", credentials: "include" }
    );

    if (!response.ok) {
        feedback.textContent = "Could not delete this draft. Refresh and try again.";
    return;
    }

    feedback.textContent = `Deleted “${project.title}”.`;
    await loadProjects();
    } catch {
    feedback.textContent = "Could not reach the server. Refresh to check the draft.";
    } finally {
    deleteButton.disabled = false;
    }
});

item.append(" ", deleteButton);
}
if (project.is_published) {
    const publicLink = document.createElement("a");
    publicLink.href = `./r3-project.html?id=${encodeURIComponent(project.id)}`;
    publicLink.textContent = "View Public Project";
    item.append(" ", publicLink);

    const unpublishButton = document.createElement("button");
    unpublishButton.type = "button";
    unpublishButton.textContent = "Unpublish";
    unpublishButton.setAttribute("aria-label", `Unpublish ${project.title}`);

    unpublishButton.addEventListener("click", async () => {
    unpublishButton.disabled = true;

    try {
        const response = await fetch(
            `${window.API_BASE_URL}/api/r3/projects/${encodeURIComponent(project.id)}/unpublish`,
        { method: "POST", credentials: "include" }
    );
    const result = await response.json();

    if (!response.ok) {
        feedback.textContent = result.error || "Could not unpublish this project.";
    return;
    }

    feedback.textContent = `Moved “${result.project.title}” back to Draft.`;
    await loadProjects();
    } catch {
    feedback.textContent = "Could not unpublish this project. Try refreshing.";
    } finally {
    unpublishButton.disabled = false;
    }
});

item.append(" ", unpublishButton);
}
    list.append(item);
    }

    status.textContent = result.projects.length ? "" : "No projects yet.";
} catch {
    status.textContent = "Could not load your projects. Try refreshing.";
}
}

const githubImportButton = document.getElementById("import-github");
const githubImportStatus = document.getElementById("github-import-status");

githubImportButton.addEventListener("click", async () => {
    if (!document.getElementById("cancel-edit").hidden) {
        githubImportStatus.textContent =
            "Finish editing or click Cancel Edit before importing a new project.";
    return;
    }

const input = window.prompt("Paste a public GitHub repository URL.");
    if (input === null) return;

const match = input.trim().match(
    /^https:\/\/github\.com\/([a-z0-9-]+)\/([a-z0-9_.-]+)\/?$/i
);

    if (!match) {
        githubImportStatus.textContent =
            "Enter a repository URL in the format https://github.com/owner/repo.";
    return;
    }

const [, owner, repository] = match;
const repo = repository.replace(/\.git$/i, "");

if (!repo || repo === "." || repo === "..") {
    githubImportStatus.textContent = "Enter a valid repository name.";
    return;
}

githubImportButton.disabled = true;
githubImportStatus.textContent = "Loading repository details…";

    try {
        const response = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        { headers: { Accept: "application/vnd.github+json" } }
    );

    if (response.status === 404) {
        githubImportStatus.textContent =
            "Repository unavailable. Check the URL and make sure the repository is public.";
    return;
    }

    if (!response.ok) {
        githubImportStatus.textContent =
            `GitHub returned an error (${response.status}). Try again later.`;
    return;
    }

    const data = await response.json();

    if (!document.getElementById("cancel-edit").hidden) {
        githubImportStatus.textContent =
        "Import canceled because you opened a draft for editing.";
    return;
    }

    const { elements } = githubImportButton.form;
    elements.namedItem("title").value = data.name.slice(0, 150);
    elements.namedItem("short_description").value =
        (data.description ?? "").slice(0, 500);
    elements.namedItem("source_url").value = data.html_url;

    githubImportStatus.textContent =
        "Repository details loaded. Review them, then click Save Draft.";
} catch {
    githubImportStatus.textContent =
        "Could not import the repository. Check your connection and try again.";
} finally {
    githubImportButton.disabled = false;
}
});

loadProjects();
