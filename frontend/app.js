const API = window.API_BASE_URL;

const studentsContainer = document.getElementById("students");
const statusText = document.getElementById("status");
const searchInput = document.getElementById("search");
const skillFilters = document.getElementById("skillFilters");
const availabilityStateSelect = document.getElementById("availabilityState");
const clearFiltersButton = document.getElementById("clearFilters");
const paginationNav = document.getElementById("pagination");
const prevPageButton = document.getElementById("prevPage");
const nextPageButton = document.getElementById("nextPage");
const pageInfo = document.getElementById("pageInfo");

let allSkills = [];
let currentPage = 1;
let totalPages = 1;
const PAGE_LIMIT = 20;
const FILTER_STORAGE_KEY = "talent-directory-filters";
let fetchRevision = 0;
let searchTimer = null;

function selectedFilters() {
  return {
    search: searchInput.value,
    skills: getSelectedValues("skill"),
    availability: getSelectedValues("availability"),
    statuses: getSelectedValues("status"),
    availability_state: availabilityStateSelect ? availabilityStateSelect.value : "",
    page: currentPage,
  };
}

function saveFilters() {
  try {
    sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(selectedFilters()));
  } catch (error) {
    console.warn("Filter preferences could not be stored:", error);
  }
}

function restoreFilters() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(FILTER_STORAGE_KEY) || "null");
    if (!saved) return;
    searchInput.value = saved.search || "";
    if (availabilityStateSelect && typeof saved.availability_state === "string") {
      availabilityStateSelect.value = saved.availability_state;
    }
    if (Number.isInteger(saved.page) && saved.page >= 1) {
      currentPage = saved.page;
    }
    for (const [name, values] of [
      ["skill", saved.skills],
      ["availability", saved.availability],
      ["status", saved.statuses],
    ]) {
      if (!Array.isArray(values)) continue;
      document.querySelectorAll('input[name="' + name + '"]').forEach((input) => {
        input.checked = values.includes(input.value);
      });
    }
  } catch (error) {
    console.warn("Saved filters could not be restored:", error);
  }
}

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

function getSelectedValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
}

function buildDirectoryUrl(page) {
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("limit", String(PAGE_LIMIT));
  const search = searchInput.value.trim();
  if (search) qs.set("search", search);
  for (const s of getSelectedValues("skill")) qs.append("skill", s);
  for (const a of getSelectedValues("availability")) qs.append("availability", a);
  for (const st of getSelectedValues("status")) qs.append("status", st);
  if (availabilityStateSelect && availabilityStateSelect.value) {
    qs.set("availability_state", availabilityStateSelect.value);
  }
  return `${API}/api/students?${qs.toString()}`;
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
    .map((student) => {
      const isShowcase = student.availability_state === "showcase" || !(student.availability || []).length;
      const availabilityLabel = isShowcase
        ? (student.availability_stale ? "Showcase Only (availability needs reconfirmation)" : "Showcase Only")
        : `Active Talent (${student.availability.join(", ")})`;
      return `
        <article class="card">
          <h2>${escapeHtml(student.name)}</h2>
          <p><strong>${escapeHtml(student.headline)}</strong></p>
          <div class="skills">
            ${(student.skills || [])
              .map((skill) => `<span class="skill">${escapeHtml(skill)}</span>`)
              .join("")}
          </div>
          <p><strong>Availability:</strong> ${escapeHtml(availabilityLabel)}</p>
          <p><strong>Status:</strong> ${escapeHtml(student.status)}</p>
          <p><strong>Project evidence:</strong> ${escapeHtml(student.project_count)}</p>
          <button
            type="button"
            class="profile-button"
            data-student-id="${escapeHtml(student.id)}"
          >
            View Profile
          </button>
        </article>
      `;
    })
    .join("");
}

function renderPagination(total, page, pages) {
  totalPages = pages;
  if (!paginationNav) return;
  if (total <= PAGE_LIMIT) {
    paginationNav.hidden = true;
    return;
  }
  paginationNav.hidden = false;
  pageInfo.textContent = `Page ${page} of ${pages} (${total} matching profiles)`;
  prevPageButton.disabled = page <= 1;
  nextPageButton.disabled = page >= pages;
}

async function fetchDirectoryPage(page = currentPage) {
  const rev = ++fetchRevision;
  currentPage = Math.max(1, page);
  saveFilters();
  statusText.textContent = "Loading talent…";

  try {
    const response = await fetch(buildDirectoryUrl(currentPage));
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    if (rev !== fetchRevision) return;

    // Supports both bounded paginated payload {students, total, page, total_pages} and legacy arrays.
    const students = Array.isArray(data) ? data : (data.students || []);
    const total = Array.isArray(data) ? data.length : (data.total ?? students.length);
    const actualPage = Array.isArray(data) ? 1 : (data.page || 1);
    const pages = Array.isArray(data) ? 1 : (data.total_pages || 1);

    currentPage = actualPage;
    renderStudents(students);
    renderPagination(total, actualPage, pages);
    statusText.textContent =
      total > students.length
        ? `Showing ${students.length} of ${total} matching profile(s) (page ${actualPage} of ${pages}).`
        : `${total} matching profile(s).`;
  } catch (error) {
    if (rev !== fetchRevision) return;
    console.error(error);
    statusText.textContent = "Could not load the Talent Directory. Please try again.";
    studentsContainer.innerHTML = "";
    if (paginationNav) paginationNav.hidden = true;
  }
}

async function initDirectory() {
  statusText.textContent = "Loading talent…";
  try {
    const skillsResponse = await fetch(`${API}/api/skills`);
    if (skillsResponse.ok) {
      allSkills = await skillsResponse.json();
      renderSkillFilters();
    }
    restoreFilters();
    await fetchDirectoryPage(currentPage);
  } catch (error) {
    console.error(error);
    statusText.textContent = "Could not load the Talent Directory. Please try again.";
    studentsContainer.innerHTML = "";
  }
}

function clearFilters() {
  searchInput.value = "";
  if (availabilityStateSelect) availabilityStateSelect.value = "";
  document
    .querySelectorAll('input[name="skill"], input[name="availability"], input[name="status"]')
    .forEach((input) => {
      input.checked = false;
    });
  fetchDirectoryPage(1);
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => fetchDirectoryPage(1), 200);
});

if (availabilityStateSelect) {
  availabilityStateSelect.addEventListener("change", () => fetchDirectoryPage(1));
}

document.addEventListener("change", (event) => {
  if (event.target.matches('input[name="skill"], input[name="availability"], input[name="status"]')) {
    fetchDirectoryPage(1);
  }
});

clearFiltersButton.addEventListener("click", clearFilters);

if (prevPageButton) {
  prevPageButton.addEventListener("click", () => {
    if (currentPage > 1) fetchDirectoryPage(currentPage - 1);
  });
}
if (nextPageButton) {
  nextPageButton.addEventListener("click", () => {
    if (currentPage < totalPages) fetchDirectoryPage(currentPage + 1);
  });
}

studentsContainer.addEventListener("click", (event) => {
  const button = event.target.closest(".profile-button");
  if (!button) return;
  const studentId = button.dataset.studentId;
  window.location.href = `/student.html?id=${encodeURIComponent(studentId)}`;
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    restoreFilters();
    fetchDirectoryPage(currentPage);
  }
});

initDirectory();
