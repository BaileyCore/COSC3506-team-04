const API = window.API_BASE_URL;

const projectContainer = document.getElementById("project");
const contributorsContainer = document.getElementById("contributors");

function escapeHtml(value) {
return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
    };

    return entities[character];
});
}

const params = new URLSearchParams(window.location.search);
const projectId = params.get("id");

async function loadProject() {
if (!projectId) {
    projectContainer.innerHTML = "<p>Project not found.</p>";
    contributorsContainer.innerHTML = "";
    return;
}

try {
    const response = await fetch(
    `${API}/api/projects/${encodeURIComponent(projectId)}`
    );

    if (response.status === 404) {
    projectContainer.innerHTML = `
        <h2>Project not found</h2>
        <p>The requested project does not exist.</p>
    `;

    contributorsContainer.innerHTML = "";
    return;
    }

    if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
    }

    const project = await response.json();

    projectContainer.innerHTML = `
    <h2>${escapeHtml(project.title)}</h2>

    <p>${escapeHtml(project.description)}</p>

    <p>
        <strong>Domain:</strong>
        ${escapeHtml(project.domain || "Not specified")}
    </p>

    <p>
        <strong>Technologies:</strong>
        ${escapeHtml(
        Array.isArray(project.technologies)
            ? project.technologies.join(", ")
            : project.technologies
        )}
    </p>

    <div>
<strong>Project Links / Media:</strong>
<div>
    ${
    project.links && Object.keys(project.links).length > 0
        ? Object.entries(project.links)
            .map(
            ([label, url]) => `
                <a
                href="${escapeHtml(url)}"
                target="_blank"
                rel="noopener noreferrer"
                >
                ${escapeHtml(label)}
                </a>
            `
            )
            .join("<br>")
        : "None provided"
    }
</div>
</div>

    <button id="projectInquiryButton" type="button">
        Interested in this project
    </button>
    `;

    renderContributors(project.contributors || []);

    document
    .getElementById("projectInquiryButton")
    .addEventListener("click", () => {
        const query = new URLSearchParams({
        source_type: "project",
        source_id: project.id,
        source_name: project.title,
        source_url: window.location.href,
        });

        window.location.href =
        `/inquiry.html?${query.toString()}`;
    });

} catch (error) {
    console.error(error);

    projectContainer.innerHTML =
    "<p>Could not load this project.</p>";

    contributorsContainer.innerHTML = "";
}
}

function renderContributors(contributors) {
if (contributors.length === 0) {
    contributorsContainer.innerHTML =
    "<p>No contributors available.</p>";
    return;
}

contributorsContainer.innerHTML = contributors
    .map(
    (contributor) => `
        <article class="contributor">
        <h3>${escapeHtml(contributor.name)}</h3>

        <p>
            <strong>Role:</strong>
            ${escapeHtml(contributor.role)}
        </p>

        <p>
            ${escapeHtml(contributor.headline)}
        </p>
        </article>
    `
    )
    .join("");
}

loadProject();