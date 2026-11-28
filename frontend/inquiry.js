'use strict';
const API = (window.API_BASE_URL || "").replace(/\/$/, "");
const params = new URLSearchParams(window.location.search);

const sourceType = (params.get("source_type") || "").trim().toLowerCase();
const sourceId = (params.get("source_id") || "").trim();

const context = document.getElementById("context");
const backLink = document.getElementById("backLink");
const form = document.getElementById("inquiryForm");
const success = document.getElementById("success");

let verifiedContext = null;

function setBackLink(href, label) {
  if (!backLink) return;
  backLink.href = href;
  backLink.textContent = label;
}

function renderPlainContext(heading, detail) {
  context.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = heading;
  context.append(strong);
  if (detail) {
    const p = document.createElement("p");
    p.style.margin = ".35rem 0 0";
    p.textContent = detail;
    context.append(p);
  }
}

async function resolveContext() {
  if (!sourceType || !sourceId) {
    renderPlainContext(
      "Inquiry context unavailable.",
      "Open this form from a published student profile, project, or industry partner page."
    );
    form.hidden = true;
    return;
  }

  try {
    if (sourceType === "student") {
      const r = await fetch(`${API}/api/students/${encodeURIComponent(sourceId)}`, { credentials: "omit" });
      if (!r.ok) throw new Error("Student profile not found.");
      const data = await r.json();
      const targetId = data.merged ? data.merged_into_id : data.id;
      const targetName = data.merged ? data.target_name : data.name;
      verifiedContext = {
        source_type: "student",
        source_id: targetId,
        source_name: targetName,
        source_url: new URL(`/student.html?id=${encodeURIComponent(targetId)}`, window.location.origin).href,
      };
      renderPlainContext(`Inquiry about student: ${targetName}`, "Your message will be routed with this student's verified profile context.");
      setBackLink(`/student.html?id=${encodeURIComponent(targetId)}`, `← Back to ${targetName}`);
      return;
    }

    if (sourceType === "project") {
      let r = await fetch(`${API}/api/projects/${encodeURIComponent(sourceId)}`, { credentials: "omit" });
      let isShared = false;
      if (!r.ok) {
        r = await fetch(`${API}/api/r3/public/projects/${encodeURIComponent(sourceId)}`, { credentials: "omit" });
        isShared = true;
      }
      if (!r.ok) throw new Error("Published project not found.");
      const raw = await r.json();
      const proj = isShared ? raw.project : raw;
      const pagePath = isShared ? `/r3-project.html?id=${encodeURIComponent(proj.id)}` : `/project.html?id=${encodeURIComponent(proj.id)}`;
      verifiedContext = {
        source_type: "project",
        source_id: proj.id,
        source_name: proj.title,
        source_url: new URL(pagePath, window.location.origin).href,
      };
      renderPlainContext(`Inquiry about project: ${proj.title}`, "Your message will be linked to this published project.");
      setBackLink(pagePath, `← Back to ${proj.title}`);
      return;
    }

    if (sourceType === "partner") {
      const r = await fetch(`${API}/api/r4/public/partners/${encodeURIComponent(sourceId)}`, { credentials: "omit" });
      if (!r.ok) throw new Error("Published industry partner not found.");
      const data = await r.json();
      const partnerId = data.merged ? data.merged_into_id : data.partner.id;
      const partnerName = data.merged ? data.target_name : data.partner.name;
      const pagePath = `/r4-partners.html?id=${encodeURIComponent(partnerId)}`;
      verifiedContext = {
        source_type: "partner",
        source_id: partnerId,
        source_name: partnerName,
        source_url: new URL(pagePath, window.location.origin).href,
      };
      renderPlainContext(`Collaboration inquiry for ${partnerName}`, "Your inquiry is tied to this published industry partner.");
      setBackLink(pagePath, `← Back to ${partnerName}`);
      return;
    }

    if (sourceType === "collaboration") {
      const r = await fetch(`${API}/api/r4/public/collaborations/${encodeURIComponent(sourceId)}`, { credentials: "omit" });
      if (!r.ok) throw new Error("Public collaboration not found.");
      const collab = await r.json();
      const pagePath = `/r4-partners.html?id=${encodeURIComponent(collab.partner_id)}`;
      verifiedContext = {
        source_type: "collaboration",
        source_id: collab.id,
        source_name: `${collab.title} — ${collab.partner_name}`,
        source_url: new URL(pagePath, window.location.origin).href,
      };
      renderPlainContext(
        `Collaboration inquiry: ${collab.title}`,
        `Industry partner: ${collab.partner_name} (${collab.period})`
      );
      setBackLink(pagePath, `← Back to ${collab.partner_name}`);
      return;
    }

    throw new Error("Unsupported inquiry context.");
  } catch (err) {
    verifiedContext = null;
    form.hidden = true;
    renderPlainContext(
      "Could not verify the requested inquiry target.",
      "Please return to the Talent Directory or Industry Partners page and open the inquiry link from a published record."
    );
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!verifiedContext) {
    success.textContent = "Inquiry context could not be verified. Please open this form from a published page.";
    return;
  }

  const inquiry = {
    ...verifiedContext,
    company_name: document.getElementById("companyName").value.trim(),
    contact_name: document.getElementById("contactName").value.trim(),
    contact_email: document.getElementById("contactEmail").value.trim(),
    message: document.getElementById("message").value.trim(),
  };

  console.log("Simulated employer inquiry:", inquiry);

  success.textContent = `Inquiry submitted for ${verifiedContext.source_name} (simulation — no email sent).`;
  form.reset();
});

resolveContext();
