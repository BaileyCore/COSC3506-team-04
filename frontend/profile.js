
const API_BASE =
    window.API_BASE_URL || "http://localhost:3000";


const statusMessage = document.getElementById("auth-status");
const loginLink = document.getElementById("github-login");
loginLink.href = `${API_BASE}/api/auth/github`;
const verificationSection = document.getElementById("verification-section");
const requestForm = document.getElementById("request-code-form");
const confirmForm = document.getElementById("confirm-code-form");
const verificationMessage = document.getElementById("verification-message");


const profileEditor = document.getElementById("profile-editor");
const profileForm = document.getElementById("profile-form");
const profileMessage = document.getElementById("profile-message");


//
async function loadSkillsCatalogue() {
    const response = await fetch(`${API_BASE}/api/skills`);

    if (!response.ok) {
        throw new Error("Unable to load the skills catalogue.");
}

    const skills = await response.json();

const container = document.getElementById("skills-options");

if (!container) {
    throw new Error(
        "Missing #skills-options in profile.html"
    );
}

container.replaceChildren();

    skills.forEach(skill => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.name = "skills";
    checkbox.value = skill;

    label.append(checkbox, document.createTextNode(` ${skill}`));
    container.appendChild(label);
});
}


//
const publicationStatus =
    document.getElementById("publication-status");

const publicationMessage =
    document.getElementById("publication-message");

const publishButton =
    document.getElementById("publish-profile");

const unpublishButton =
    document.getElementById("unpublish-profile");

function updatePublicationControls(status) {
    const isPublished = status === "published";

    publicationStatus.textContent = isPublished
    ? "Your profile is currently published."
    : "Your profile is currently private.";

    publishButton.hidden = isPublished;
    unpublishButton.hidden = !isPublished;
}

//
async function loadProfileDraft() {
    const response = await fetch(
    `${API_BASE}/api/profile/draft`,
    { credentials: "include" }
    );

    if (!response.ok) {
    throw new Error("Unable to load your profile draft.");
}

const result = await response.json();

    if (result.exists) {

    updatePublicationControls(result.profile.profile_status);

    document.getElementById("display-name").value =
    result.profile.display_name || "";

    document.getElementById("headline").value =
    result.profile.headline || "";

    document.getElementById("biography").value =
    result.profile.biography || "";

    document.getElementById("program").value =
    result.profile.program || "";

    document.getElementById("location-text").value =
    result.profile.location_text || "";

const savedAvailability = result.profile.availability || [];

document.querySelectorAll(
    'input[name="availability"]'
).forEach(input => {
    input.checked = savedAvailability.includes(input.value);
});

//
const savedSkills = result.profile.skills || [];

document.querySelectorAll(
    'input[name="skills"]'
).forEach(input => {
    input.checked = savedSkills.includes(input.value);
});

//
const links = result.profile.professional_links || {};

document.getElementById("github-url").value =
    links.github || "";

document.getElementById("linkedin-url").value =
    links.linkedin || "";

document.getElementById("portfolio-url").value =
    links.portfolio || "";


const savedVisibility = result.profile.field_visibility || {};

document.querySelectorAll(
    'input[name="visibility"]'
).forEach(input => {
    input.checked = savedVisibility[input.value] === true;
});


} else {
    publicationStatus.textContent =
        "Create and save your private draft before publishing.";

    publishButton.hidden = true;
    unpublishButton.hidden = true;
}
}

// checkAuthentication()
async function checkAuthentication() {
try {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: "include"
    });

    if (response.status === 401) {
        statusMessage.textContent =
        "Please sign in with GitHub to manage your profile.";

        loginLink.hidden = false;
        verificationSection.hidden = true;
        profileEditor.hidden = true;
        return;
    }

    if (!response.ok) {
        throw new Error("Unable to check authentication.");
    }

    const account = await response.json();

    loginLink.hidden = true;


if (account.verified) {
    statusMessage.textContent =
    `Welcome, ${account.github_username}! ` +
    "Your Algoma affiliation is verified.";


verificationSection.hidden = true;
profileEditor.hidden = false;

await loadSkillsCatalogue();
await loadProfileDraft();

} else {
    statusMessage.textContent =
    `Welcome, ${account.github_username}! ` +
    "Next, verify your Algoma University email.";

    verificationSection.hidden = false;
    profileEditor.hidden = true;
}

} catch (error) {
    statusMessage.textContent =
        "Unable to check your sign-in. Please try again.";
    verificationSection.hidden = true;
    profileEditor.hidden = true;

    console.error(error);
    }
}

requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = requestForm.querySelector("button");
    button.disabled = true;
    verificationMessage.textContent = "Sending verification code...";

try {
    const email = document.getElementById("algoma-email").value;

    const response = await fetch(
        `${API_BASE}/api/verification/request`,
        {
        method: "POST",
        credentials: "include",
        headers: {
        "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
    }
    );

    const result = await response.json();

    if (!response.ok) {
    throw new Error(result.error || "Unable to send code.");
    }

    verificationMessage.textContent =
        "Check your Algoma email for the verification code.";

    confirmForm.hidden = false;
} catch (error) {
    verificationMessage.textContent = error.message;
} finally {
    button.disabled = false;
}
});

confirmForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = confirmForm.querySelector("button");
    button.disabled = true;
    verificationMessage.textContent = "Verifying your code...";

try {
    const code = document.getElementById("verification-code").value;

    const response = await fetch(
    `${API_BASE}/api/verification/confirm`,
        {
        method: "POST",
        credentials: "include",
        headers: {
        "Content-Type": "application/json"
        },
        body: JSON.stringify({ code })
    }
    );

    const result = await response.json();

    if (!response.ok) {
    throw new Error(result.error || "Verification failed.");
    }

    verificationMessage.textContent =
    "Your Algoma email has been verified successfully!";

    confirmForm.hidden = true;
    await checkAuthentication();
} catch (error) {
    verificationMessage.textContent = error.message;
} finally {
    button.disabled = false;
}
});

profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const isPrivacySave =
        event.submitter?.id === "save-privacy-settings";

    const button = event.submitter ||
        document.getElementById("save-profile");

    button.disabled = true;

    profileMessage.textContent = isPrivacySave
        ? "Saving your privacy settings..."
        : "Saving your private draft...";

    try {

const profile = {
    display_name: document.getElementById("display-name").value,
    headline: document.getElementById("headline").value,
    biography: document.getElementById("biography").value,
    program: document.getElementById("program").value,
    location_text: document.getElementById("location-text").value,

    availability: Array.from(
        document.querySelectorAll('input[name="availability"]:checked')
    ).map(input => input.value),

    skills: Array.from(
        document.querySelectorAll('input[name="skills"]:checked')
    ).map(input => input.value),

    professional_links: {
        github: document.getElementById("github-url").value.trim(),
        linkedin: document.getElementById("linkedin-url").value.trim(),
        portfolio: document.getElementById("portfolio-url").value.trim()
    },

    field_visibility: Object.fromEntries(
        Array.from(
            document.querySelectorAll('input[name="visibility"]')
        ).map(input => [input.value, input.checked])
    ),

    education_details:
        document.getElementById("education-details").value,

    experience_details:
        document.getElementById("experience-details").value
};

//Availablity Post
console.log("Availability being sent:", profile.availability);

    const response = await fetch(
        `${API_BASE}/api/profile/draft`,
    {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(profile)
    }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error || "Unable to save your profile.");
    }


profileMessage.textContent = isPrivacySave
    ? "Your privacy settings were saved successfully!"
    : "Your private profile draft was saved successfully!";

} catch (error) {
    profileMessage.textContent = error.message;
} finally {
    button.disabled = false;
}
});

// Function and Event handler:
document.getElementById("preview-profile").addEventListener(
    "click",
    async () => {
        const previewSection =
            document.getElementById("profile-preview");

        const previewContent =
            document.getElementById("preview-content");

    previewContent.replaceChildren();

    try {
        const response = await fetch(
        `${API_BASE}/api/profile/preview`,
        { credentials: "include" }
    );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
            result.error || "Unable to load profile preview."
        );
    }

        const profile = result.profile;


const fields = [
    ["display_name", "Professional Name"],
    ["headline", "Headline"],
    ["biography", "About Me"],
    ["program", "Academic Program"],
    ["location_text", "Location"],
    ["availability", "Availability"],
    ["skills", "Skills"],
    ["professional_links", "Professional Links"],
    ["education_details", "Education"],
    ["experience_details", "Experience & Projects"]
];


    fields.forEach(([key, title]) => {
        if (!Object.hasOwn(profile, key)) {
            return;
        }

        const heading = document.createElement("h3");
        heading.textContent = title;

        const paragraph = document.createElement("p");

        const value = profile[key];

        paragraph.textContent = Array.isArray(value)
            ? value.join(", ")
            : typeof value === "object" && value !== null
            ? Object.entries(value)
                .filter(([, url]) => url)
                .map(([type, url]) => `${type}: ${url}`)
                .join(" | ")
            : String(value ?? "");

        previewContent.append(heading, paragraph);
    });

    previewSection.hidden = false;
    } catch (error) {
    previewContent.textContent = error.message;
    previewSection.hidden = false;
    }
}
);


async function changePublicationStatus(action) {
    const button = action === "publish"
    ? publishButton
    : unpublishButton;

button.disabled = true;
publicationMessage.textContent =
    action === "publish"
    ? "Publishing your profile..."
    : "Unpublishing your profile...";

try {
    const response = await fetch(
        `${API_BASE}/api/profile/${action}`,
    {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({})
    }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
        result.error || "Unable to change publication status."
    );
    }

    updatePublicationControls(result.profile.profile_status);
    publicationMessage.textContent = result.message;

    // Hide any existing preview until the student requests it again.
    document.getElementById("profile-preview").hidden = true;
} catch (error) {
    publicationMessage.textContent = error.message;
} finally {
    button.disabled = false;
}
}

publishButton.addEventListener("click", () => {
changePublicationStatus("publish");
});

unpublishButton.addEventListener("click", () => {
changePublicationStatus("unpublish");
});


const resumeUploadForm =
document.getElementById("resume-upload-form");

const resumeMessage =
document.getElementById("resume-message");

resumeUploadForm.addEventListener("submit", async (event) => {
event.preventDefault();

const uploadButton =
document.getElementById("upload-resume");

const resumeFile =
document.getElementById("resume-file").files[0];

if (!resumeFile) {
    resumeMessage.textContent =
    "Choose a PDF résumé first.";
    return;
}

if (
    resumeFile.type !== "application/pdf" ||
    resumeFile.size > 5 * 1024 * 1024
) {
    resumeMessage.textContent =
    "Please select a PDF file no larger than 5 MB.";
    return;
}

const formData = new FormData();
formData.append("resume", resumeFile);

activeResumeBatchId = null;

document.getElementById("resume-review-section").hidden = true;

uploadButton.disabled = true;
resumeMessage.textContent = "Uploading your résumé...";

try {
    const response = await fetch(
        `${API_BASE}/api/profile/resume/upload`,
    {
        method: "POST",
        credentials: "include",
        body: formData
    }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
        result.error || "Résumé upload failed."
    );
    }


resumeMessage.textContent =
    "Your résumé was processed successfully. Review the suggestions below.";

activeResumeBatchId = result.batch_id;

displayResumeCandidates(result.candidates || {});

} catch (error) {
    resumeMessage.textContent = error.message;
} finally {
    uploadButton.disabled = false;
}
});

//Display Resume Candidates
let activeResumeBatchId = null;


let resumeReviewDecisions = [];

function displayResumeCandidates(candidates) {
    const reviewSection =
    document.getElementById("resume-review-section");

const container =
    document.getElementById("resume-candidates");

const reviewMessage =
    document.getElementById("resume-review-message");

container.replaceChildren();
reviewMessage.textContent = "";

resumeReviewDecisions = [];

function addSection(title, values) {
    const section = document.createElement("section");
    const heading = document.createElement("h3");

    heading.textContent = title;
    section.appendChild(heading);

    if (values.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No suggestions found.";
        section.appendChild(empty);
    }


values.forEach(value => {
    const decision = {
        category: title,
        original: value,
        value: value,
        action: "pending"
    };

    resumeReviewDecisions.push(decision);

    const item = document.createElement("div");

    const paragraph = document.createElement("p");
    paragraph.textContent = value;
    paragraph.style.whiteSpace = "pre-wrap";
    paragraph.style.overflowWrap = "anywhere";

    const decisionMessage = document.createElement("p");
    decisionMessage.textContent = "Decision: Pending";

    const acceptButton = document.createElement("button");
    acceptButton.type = "button";
    acceptButton.textContent = "Accept";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";

    const rejectButton = document.createElement("button");
    rejectButton.type = "button";
    rejectButton.textContent = "Reject";

    const editInput = document.createElement("textarea");
    editInput.value = value;
    editInput.rows = 4;
    editInput.hidden = true;

    const confirmEditButton = document.createElement("button");
    confirmEditButton.type = "button";
    confirmEditButton.textContent = "Confirm Edit";
    confirmEditButton.hidden = true;

    acceptButton.addEventListener("click", () => {
        decisionMessage.textContent = "Decision: Accepted for review";
        editInput.hidden = true;
        confirmEditButton.hidden = true;
        decision.action = "accept";
        decision.value = paragraph.textContent;

    });

    rejectButton.addEventListener("click", () => {
    decisionMessage.textContent = "Decision: Rejected";
    editInput.hidden = true;
    confirmEditButton.hidden = true;
    decision.action = "reject";

    });

    editButton.addEventListener("click", () => {
        decision.action = "pending";
        editInput.hidden = false;
        confirmEditButton.hidden = false;
        decisionMessage.textContent = "Decision: Editing";
    });

    confirmEditButton.addEventListener("click", () => {
        const editedValue = editInput.value.trim();

// Validate standardized skills.
if (title === "Suggested Skills") {
    const allowedSkills = Array.from(
    document.querySelectorAll('input[name="skills"]')
    ).map(input => input.value);

if (!allowedSkills.includes(editedValue)) {
    decisionMessage.textContent =
        "Please choose a skill from the approved catalogue.";
    return;
}
}

    if (!editedValue) {
        decisionMessage.textContent =
        "Please enter a value before confirming.";
        return;
    }

    paragraph.textContent = editedValue;
    decision.action = "edit";
    decision.value = editedValue;

    decisionMessage.textContent =
        "Decision: Edited for review";

    editInput.hidden = true;
    confirmEditButton.hidden = true;
});

    item.append(
        paragraph,
        acceptButton,
        editButton,
        rejectButton,
        editInput,
        confirmEditButton,
        decisionMessage
    );

    section.appendChild(item);
});


    container.appendChild(section);
}

addSection(
    "Suggested Skills",
    candidates.skills || []
);

addSection(
    "Suggested Professional Links",
    (candidates.professional_links || []).map(
        link => `${link.type}: ${link.url}`
    )
);

addSection(
    "Suggested Education",
    candidates.education
        ? [candidates.education]
        : []
);

addSection(
    "Suggested Experience & Projects",
    candidates.experience
        ? [candidates.experience]
        : []
);

reviewMessage.textContent =
    "These are suggestions only. Nothing has been saved to your profile.";

reviewSection.hidden = false;
}


const validateResumeButton =
    document.getElementById("validate-resume-review");

validateResumeButton.addEventListener("click", async () => {
    const reviewMessage =
        document.getElementById("resume-review-message");

    if (!activeResumeBatchId) {
    reviewMessage.textContent =
        "Upload a résumé before validating your selections.";
    return;
    }

    const button = validateResumeButton;
    button.disabled = true;

    reviewMessage.textContent =
        "Validating your résumé review...";

    try {
    const response = await fetch(
        `${API_BASE}/api/profile/resume/review/validate`,
        {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            batch_id: activeResumeBatchId,
            decisions: resumeReviewDecisions
        })
        }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
        result.error || "Unable to validate your selections."
    );
    }

    reviewMessage.textContent =
        `${result.message} ` +
        `${result.decisions_received} decisions received.`;

} catch (error) {
    reviewMessage.textContent = error.message;
} finally {
    button.disabled = false;
}
});

document
    .getElementById("apply-resume-review")
    ?.addEventListener("click", async () => {
    const message = document.getElementById(
        "resume-review-message"
    );

    if (!activeResumeBatchId) {
        message.textContent =
            "Upload a résumé before applying suggestions.";
        return;
    }

    const approvedCount = resumeReviewDecisions.filter(
        decision =>
        decision.action === "accept" ||
        decision.action === "edit"
    ).length;

    if (approvedCount === 0) {
        message.textContent =
            "Select at least one suggestion to accept or edit.";
        return;
    }

    const confirmed = window.confirm(
        `Apply ${approvedCount} approved résumé suggestion(s) ` +
        "to your private profile? Existing information will be preserved."
    );

    if (!confirmed) return;

    const button = document.getElementById(
        "apply-resume-review"
    );

    button.disabled = true;

    try {
        const response = await fetch(
            `${API_BASE}/api/profile/resume/review/apply`,
        {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                batch_id: activeResumeBatchId,
                decisions: resumeReviewDecisions
            })
        }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.error || "Unable to apply résumé suggestions."
        );
    }

    message.textContent =
        `${result.applied_count} suggestion(s) applied. ` +
        `${result.skipped_count} skipped.`;

    activeResumeBatchId = null;

    document.getElementById(
        "resume-review-section"
    ).hidden = true;

      // Refresh the form after a successful application.
    window.location.reload();

    } catch (error) {
        message.textContent = error.message;
    } finally {
        button.disabled = false;
    }
});

async function loadBackgroundDetails() {
    const educationField =
        document.getElementById("education-details");

    const experienceField =
        document.getElementById("experience-details");

    if (!educationField || !experienceField) {
        return;
    }

    try {
        const response = await fetch(
        `${API_BASE}/api/profile/draft`,
        {
        credentials: "include"
        }
    );

    if (!response.ok) {
        throw new Error("Unable to load education and experience.");
    }

    const data = await response.json();

    educationField.value =
        data.profile?.education_details || "";

    experienceField.value =
        data.profile?.experience_details || "";

    } catch (error) {
    const message = document.getElementById(
        "background-details-message"
    );

    if (message) {
        message.textContent = error.message;
    }
    }
}

checkAuthentication().then(() => {
    loadBackgroundDetails();
}
);