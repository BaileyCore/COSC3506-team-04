async function showPublicProject() {
    const message = document.getElementById("project-message");
    const id = new URLSearchParams(window.location.search).get("id");

    if (!id) {
    message.textContent = "No project was specified.";
    return;
    }

    try {
        const response = await fetch(
            `${window.API_BASE_URL}/api/r3/public/projects/${encodeURIComponent(id)}`,
            { credentials: "omit" }
    );

    if (response.status === 404) {
        message.textContent = "Project not found.";
    return;
    }

    if (!response.ok) {
        message.textContent = "Could not load this project.";
    return;
    }

    const { project } = await response.json();
    document.title = `${project.title} | ImmXrsive`;
    document.getElementById("project-title").textContent = project.title;
    document.getElementById("project-description").textContent =
        project.short_description ?? "";

    const details = document.getElementById("project-details");
    for (const [label, value] of [
        ["Domain / Type", project.domain],
        ["Technologies", project.technologies?.join(", ")],
        ["Project Date", project.project_date],
        ["Project Status", project.project_status?.replaceAll("_", " ")],
    ]) {
        if (!value) continue;
        const term = document.createElement("dt");
        const definition = document.createElement("dd");
        term.textContent = label;
        definition.textContent = value;
        const detail = document.createElement("div");
        detail.className = "project-detail";
        detail.append(term, definition);
        details.append(detail);
    }

    const links = document.getElementById("project-links");
    for (const [label, value] of [
        ["Play Demo", project.demo_url],
        ["View Source", project.source_url],
        ["Fallback Evidence", project.fallback_url],
        ["Watch Demo", project.video_url],
    ]) {
        if (typeof value !== "string" || !/^https:\/\//i.test(value)) continue;

        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = value;
        link.textContent = label;
        if (label === "Play Demo") {
        link.classList.add("primary-action");
}
        item.append(link);
        links.append(item);
    }

    message.textContent = "";
    document.getElementById("public-project").hidden = false;
    } catch {
    message.textContent = "Could not load this project. Try refreshing.";
    }
}

showPublicProject();