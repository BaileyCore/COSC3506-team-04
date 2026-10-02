const params = new URLSearchParams(window.location.search);

const sourceType = params.get("source_type");
const sourceId = params.get("source_id");
const sourceName = params.get("source_name");
const sourceUrl = params.get("source_url");

const context = document.getElementById("context");
const form = document.getElementById("inquiryForm");
const success = document.getElementById("success");

function escapeHtml(value) {
return String(value || "").replace(/[&<>"']/g, (character) => {
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

if (!sourceType || !sourceId || !sourceName) {
context.innerHTML = `
    <strong>Inquiry context unavailable.</strong>
`;
} else {
context.innerHTML = `
    <strong>Inquiry about:</strong>
    ${escapeHtml(sourceName)}
    <br>
    <strong>Type:</strong>
    ${escapeHtml(sourceType)}
    <br>
    <strong>ID:</strong>
    ${escapeHtml(sourceId)}
`;
}

form.addEventListener("submit", (event) => {
event.preventDefault();

const inquiry = {
    source_type: sourceType,
    source_id: sourceId,
    source_name: sourceName,
    source_url: sourceUrl,
    company_name: document.getElementById("companyName").value.trim(),
    contact_name: document.getElementById("contactName").value.trim(),
    contact_email: document.getElementById("contactEmail").value.trim(),
    message: document.getElementById("message").value.trim(),
};

console.log("Simulated employer inquiry:", inquiry);

success.textContent =
    "Inquiry submitted successfully for this Release 1 simulation.";

form.reset();
});