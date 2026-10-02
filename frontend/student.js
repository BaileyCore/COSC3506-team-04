const API = window.API_BASE_URL;

const profileContainer = document.getElementById("profile");
const projectsContainer = document.getElementById("projects");

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
const studentId = params.get("id");

async function loadStudent() {
if (!studentId) {
    profileContainer.innerHTML = "<p>Student not found.</p>";
    projectsContainer.innerHTML = "";
    return;
}

try {
    const response = await fetch(
    `${API}/api/students/${encodeURIComponent(studentId)}`
    );

    if (response.status === 404) {
    profileContainer.innerHTML = `
        <h2>Student not found</h2>
        <p>The requested student profile does not exist.</p>
    `;

    projectsContainer.innerHTML = "";
    return;
    }

    if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
    }

    const student = await response.json();

    profileContainer.innerHTML = `
    <h2>${escapeHtml(student.name)}</h2>

    <p><strong>${escapeHtml(student.headline)}</strong></p>

    <p>
        <strong>Status:</strong>
        ${escapeHtml(student.status)}
    </p>

    <p>
        <strong>Program:</strong>
        ${escapeHtml(student.program)}
    </p>

    <p>
        <strong>Availability:</strong>
        ${escapeHtml(
        Array.isArray(student.availability)
            ? student.availability.join(", ")
            : student.availability
        )}
    </p>

    <div class="skills">
        ${(student.skills || [])
        .map(
            (skill) =>
            `<span class="skill">${escapeHtml(skill)}</span>`
        )
        .join("")}
    </div>

    <div>
<strong>Professional Links:</strong>
<div>
    ${
    student.links && Object.keys(student.links).length > 0
        ? Object.entries(student.links)
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

    <button
        id="inquiryButton"
        type="button"
    >
        Interested in working with this student
    </button>
    `;

    renderProjects(student.projects || []);

    document
    .getElementById("inquiryButton")
    .addEventListener("click", () => {
        const query = new URLSearchParams({
        source_type: "student",
        source_id: student.id,
        source_name: student.name,
        source_url: window.location.href,
        });

        window.location.href =
        `/inquiry.html?${query.toString()}`;
    });
} catch (error) {
    console.error(error);

    profileContainer.innerHTML = `
    <p>Could not load this student profile.</p>
    `;

    projectsContainer.innerHTML = "";
}
}

function renderProjects(projects) {
if (projects.length === 0) {
    projectsContainer.innerHTML =
    "<p>No project evidence available.</p>";
    return;
}

projectsContainer.innerHTML = projects
    .map(
    (project) => `
        <article class="project-card">
        <h3>${escapeHtml(project.title)}</h3>

        <p>${escapeHtml(project.description)}</p>

        <p>
            <strong>Role:</strong>
            ${escapeHtml(project.role)}
        </p>

        <p>
            <strong>Technologies:</strong>
            ${escapeHtml(
            Array.isArray(project.technologies)
                ? project.technologies.join(", ")
                : project.technologies
            )}
        </p>

        <button
            type="button"
            class="project-button"
            data-project-id="${escapeHtml(project.id)}"
        >
            View Project
        </button>
        </article>
    `
    )
    .join("");
}

projectsContainer.addEventListener("click", (event) => {
const button = event.target.closest(".project-button");

if (!button) {
    return;
}

const projectId = button.dataset.projectId;

window.location.href =
    `/project.html?id=${encodeURIComponent(projectId)}`;
});

loadStudent();