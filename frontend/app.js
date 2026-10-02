const API = window.API_BASE_URL;

const studentsContainer = document.getElementById("students");
const statusText = document.getElementById("status");
const searchInput = document.getElementById("search");
const skillFilters = document.getElementById("skillFilters");
const clearFiltersButton = document.getElementById("clearFilters");

let allStudents = [];
let allSkills = [];

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

async function loadStudents() {
  statusText.textContent = "Loading talent...";

  try {
    const response = await fetch(`${API}/api/students`);

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    allStudents = await response.json();

  const skillsResponse = await fetch(`${API}/api/skills`);

if (!skillsResponse.ok) {
  throw new Error(`Skills request failed with status ${skillsResponse.status}`);
}

allSkills = await skillsResponse.json();

    renderSkillFilters();
    renderStudents(allStudents);

    statusText.textContent = `${allStudents.length} published talent profiles found.`;
  } catch (error) {
    console.error(error);

    statusText.textContent =
      "Could not load the Talent Directory. Please try again.";

    studentsContainer.innerHTML = "";
  }
}

function renderSkillFilters() {
  skillFilters.innerHTML = allSkills
    .map(
      (skill) => `
        <label>
          <input
            type="checkbox"
            name="skill"
            value="${escapeHtml(skill)}"
          >
          ${escapeHtml(skill)}
        </label>
      `
    )
    .join("");
}

function renderStudents(students) {
  if (students.length === 0) {
    studentsContainer.innerHTML = `
      <div class="message">
        No students match the selected filters.
      </div>
    `;
    return;
  }

  studentsContainer.innerHTML = students
    .map(
      (student) => `
        <article class="card">
          <h2>${escapeHtml(student.name)}</h2>

          <p>
            <strong>${escapeHtml(student.headline)}</strong>
          </p>

          <div class="skills">
            ${(student.skills || [])
              .map(
                (skill) =>
                  `<span class="skill">${escapeHtml(skill)}</span>`
              )
              .join("")}
          </div>

          <p>
            <strong>Availability:</strong>
            ${escapeHtml(
              Array.isArray(student.availability)
                ? student.availability.join(", ")
                : student.availability
            )}
          </p>

          <p>
            <strong>Status:</strong>
            ${escapeHtml(student.status)}
          </p>

          <p>
            <strong>Project evidence:</strong>
            ${escapeHtml(student.project_count)}
          </p>

          <button
            type="button"
            class="profile-button"
            data-student-id="${escapeHtml(student.id)}"
          >
            View Profile
          </button>
        </article>
      `
    )
    .join("");
}

function getSelectedValues(name) {
  return Array.from(
    document.querySelectorAll(`input[name="${name}"]:checked`)
  ).map((input) => input.value);
}

function applyFilters() {
  const search = searchInput.value.trim().toLowerCase();

  const selectedSkills = getSelectedValues("skill");

  const selectedAvailability =
    getSelectedValues("availability");

  const selectedStatuses =
    getSelectedValues("status");

  const filteredStudents = allStudents.filter((student) => {
    const searchableText = [
      student.name,
      student.headline,
      ...(student.skills || []),
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !search || searchableText.includes(search);

    const matchesSkills =
      selectedSkills.length === 0 ||
      selectedSkills.every((skill) =>
        (student.skills || []).includes(skill)
      );

    const matchesAvailability =
      selectedAvailability.length === 0 ||
      selectedAvailability.some((availability) =>
        (student.availability || []).includes(availability)
      );

    const matchesStatus =
      selectedStatuses.length === 0 ||
      selectedStatuses.includes(student.status);

    return (
      matchesSearch &&
      matchesSkills &&
      matchesAvailability &&
      matchesStatus
    );
  });

  renderStudents(filteredStudents);

  statusText.textContent =
    `${filteredStudents.length} matching profile(s).`;
}

function clearFilters() {
  searchInput.value = "";

  document
    .querySelectorAll(
      'input[name="skill"], input[name="availability"], input[name="status"]'
    )
    .forEach((input) => {
      input.checked = false;
    });

  renderStudents(allStudents);

  statusText.textContent =
    `${allStudents.length} published talent profiles found.`;
}

searchInput.addEventListener("input", applyFilters);

document.addEventListener("change", (event) => {
  if (
    event.target.matches(
      'input[name="skill"], input[name="availability"], input[name="status"]'
    )
  ) {
    applyFilters();
  }
});

clearFiltersButton.addEventListener("click", clearFilters);

studentsContainer.addEventListener("click", (event) => {
  const button = event.target.closest(".profile-button");

  if (!button) {
    return;
  }

  const studentId = button.dataset.studentId;

  window.location.href =
    `/student.html?id=${encodeURIComponent(studentId)}`;
});

loadStudents();