require("dotenv").config();

const cors = require("cors");
const express = require("express");
const { Pool } = require("pg");

const crypto = require("node:crypto");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);

const nodemailer = require("nodemailer");

const multer = require("multer");

const { PDFParse } = require("pdf-parse");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Copy backend/.env.example to backend/.env and set it.");
  process.exit(1);
}


const app = express();

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN,
  credentials: true
}));

app.use(express.json());


const isLocalDatabase = process.env.DATABASE_URL.includes("localhost");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
});


if (!process.env.R2_SESSION_SECRET) {
  throw new Error("R2_SESSION_SECRET is required");
}

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(
  session({
    store: new PgSession({
      pool,
      createTableIfMissing: true,
    }),
    name: "immxrsive.sid",
    secret: process.env.R2_SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);


app.get("/api/auth/github", (request, response, next) => {
  // Generate a random value to protect the OAuth flow.
  const state = crypto.randomBytes(32).toString("hex");

  // Save it in the student's server-side session.
  request.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: process.env.GITHUB_CALLBACK_URL,
    scope: "read:user",
    state,
  });

  // Save the session before redirecting.
  request.session.save((error) => {
    if (error) {
      return next(error);
    }

    response.redirect(
      `https://github.com/login/oauth/authorize?${params.toString()}`
    );
  });
});


// 1. GitHub OAuth callback
app.get("/api/auth/github/callback", async (request, response, next) => {
  try {
    const { code, state } = request.query;
    const expectedState = request.session.oauthState;

    // Each OAuth state is valid for one callback only.
    delete request.session.oauthState;

    if (
      typeof code !== "string" ||
      typeof state !== "string" ||
      !expectedState ||
      state !== expectedState
    ) {
      return response.status(400).json({
        error: "Invalid or expired GitHub sign-in. Please try again.",
      });
    }

    if (!process.env.GITHUB_CLIENT_ID ||
        !process.env.GITHUB_CLIENT_SECRET) {
      throw new Error("GitHub OAuth credentials are not configured");
    }

    // Exchange the temporary code for a GitHub access token.
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: process.env.GITHUB_CALLBACK_URL,
        }),
      }
    );

    if (!tokenResponse.ok) {
      throw new Error("GitHub token exchange failed");
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return response.status(401).json({
        error: "GitHub authorization was unsuccessful.",
      });
    }

    // Retrieve the authenticated GitHub account.
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "ImmXrsive-Student-Platform",
      },
    });

    if (!userResponse.ok) {
      throw new Error("Unable to retrieve GitHub account");
    }

    const githubUser = await userResponse.json();

    if (
      !Number.isSafeInteger(githubUser.id) ||
      typeof githubUser.login !== "string"
    ) {
      throw new Error("Invalid GitHub identity response");
    }

    // Find an existing account or create a new internal identity.
    const result = await pool.query(
    `INSERT INTO student_accounts (github_id, github_username)
      VALUES ($1, $2)
      ON CONFLICT (github_id)
      DO UPDATE SET
        github_username = EXCLUDED.github_username,
        updated_at = NOW()
      RETURNING id, github_username, email_verified_at`,
      [githubUser.id, githubUser.login]
    );

    const account = result.rows[0];

    // Regenerate the session ID after authentication.
    request.session.regenerate((error) => {
      if (error) return next(error);

      request.session.accountId = account.id;

      request.session.save((saveError) => {
        if (saveError) return next(saveError);

        response.redirect(
          `${process.env.FRONTEND_ORIGIN}/profile.html`
        );
      });
    });
  } catch (error) {
    next(error);
  }
});


// 2. NEW: Check authenticated student
app.get("/api/auth/me", async (request, response, next) => {
  try {
    if (!request.session.accountId) {
      return response.status(401).json({
        authenticated: false,
        error: "Please sign in with GitHub."
      });
    }

    const result = await pool.query(
      `SELECT id, github_username, email_verified_at
      FROM student_accounts
      WHERE id = $1`,
      [request.session.accountId]
    );

    if (result.rows.length === 0) {
      return response.status(401).json({
        authenticated: false,
        error: "Account not found. Please sign in again."
      });
    }

    const account = result.rows[0];

    response.json({
      authenticated: true,
      github_username: account.github_username,
      verified: account.email_verified_at !== null
    });
  } catch (error) {
    next(error);
  }
});

//
function isApprovedAlgomaEmail(email) {
  if (typeof email !== "string") {
    return false;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const parts = normalizedEmail.split("@");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return false;
  }

  const approvedDomains = (
    process.env.ALGOMA_EMAIL_DOMAINS || "algomau.ca"
  )
    .split(",")
    .map(domain => domain.trim().toLowerCase())
    .filter(Boolean);

  return approvedDomains.includes(parts[1]);
}


function generateVerificationCode() {
  return crypto.randomInt(0, 1000000)
    .toString()
    .padStart(6, "0");
}

function hashVerificationCode(accountId, code) {
  return crypto
    .createHmac(
      "sha256",
      process.env.R2_SESSION_SECRET
    )
    .update(`${accountId}:${code}`)
    .digest("hex");
}

function getVerificationExpiry() {
  const configuredMinutes = Number(
    process.env.VERIFICATION_CODE_TTL_MINUTES || 15
  );

  const minutes = Number.isFinite(configuredMinutes)
    ? Math.max(1, Math.min(30, configuredMinutes))
    : 15;

  return new Date(Date.now() + minutes * 60 * 1000);
}


function createEmailTransporter() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD
  } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error("SMTP email settings are incomplete");
  }

  const port = Number(SMTP_PORT || 465);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid SMTP port");
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD
    }
  });
}


async function requireVerifiedStudent(request, response, next) {
  try {
    const accountId = request.session?.accountId;

    if (!accountId) {
      return response.status(401).json({
        error: "Please sign in with GitHub."
      });
    }

    const result = await pool.query(
      `SELECT id, email_verified_at
        FROM student_accounts
        WHERE id = $1`,
      [accountId]
    );

    if (result.rows.length === 0) {
      return response.status(401).json({
        error: "Student account not found."
      });
    }

    if (!result.rows[0].email_verified_at) {
      return response.status(403).json({
        error: "Verify your Algoma email first."
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}

//
const resumeUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },

  fileFilter: (_request, file, callback) => {
    if (file.mimetype !== "application/pdf") {
      return callback(
        new Error("Only PDF résumés are accepted.")
      );
    }

    callback(null, true);
  }
});

//
function createPublicProfile(profile) {
  const visibility = profile.field_visibility || {};

  const publicProfile = {
    id: profile.id,
    profile_status: profile.profile_status
  };


const publicFields = [
    "display_name",
    "headline",
    "biography",
    "program",
    "location_text",
    "availability",
    "skills",
    "professional_links",
    "education_details",
    "experience_details"
];


  for (const field of publicFields) {
    if (visibility[field] === true) {
      publicProfile[field] = profile[field];
    }
  }

  return publicProfile;
}


function createDirectoryStudent(profile) {
  const publicProfile = createPublicProfile(profile);

  return {
    id: publicProfile.id,

    name: publicProfile.display_name || "Student",

    headline: publicProfile.headline || "",

    program: publicProfile.program || "",

    status: "unspecified",

    profile_status: "published",

    availability: publicProfile.availability || [],

    skills: publicProfile.skills || [],

    links: publicProfile.professional_links || {}
  };
}

//
async function sendVerificationEmail(email, code) {
  const transporter = createEmailTransporter();

  const fromEmail = process.env.VERIFICATION_FROM_EMAIL;

  if (!fromEmail) {
    throw new Error("Verification sender address is missing");
  }

  await transporter.sendMail({
    from: fromEmail,
    to: email,
    subject: "ImmXrsive - Verify Your Algoma Email",
    text: [
      "Welcome to ImmXrsive!",
      "",
      "Your verification code is:",
      code,
      "",
      "This code expires shortly.",
      "If you did not request this code, ignore this email."
    ].join("\n")
  });
}

// Prepare for Publishing
app.get("/api/public/profiles", async (_request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        display_name,
        headline,
        biography,
        program,
        location_text,
        availability,
        skills,
        professional_links,
        education_details,
        experience_details,
        field_visibility,
        profile_status
      FROM student_profile_drafts
      WHERE profile_status = 'published'
      ORDER BY updated_at DESC`
    );

    response.json(
      result.rows.map(createPublicProfile)
    );
  } catch (error) {
    next(error);
  }
});

//Protect Private Information
app.get("/api/public/profiles/:id", async (request, response, next) => {
  try {
    const profileId = request.params.id;

    // Validate the profile ID before querying PostgreSQL.
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(profileId)) {
      return response.status(404).json({
        error: "Public profile not found."
      });
    }

    const result = await pool.query(
      `SELECT
        id,
        display_name,
        headline,
        biography,
        program,
        location_text,
        availability,
        skills,
        professional_links,
        education_details,
        experience_details,
        field_visibility,
        profile_status
      FROM student_profile_drafts
      WHERE id = $1
        AND profile_status = 'published'`,
      [profileId]
    );

    if (result.rows.length === 0) {
      return response.status(404).json({
        error: "Public profile not found."
      });
    }

    const publicProfile = createPublicProfile(result.rows[0]);

    return response.json(publicProfile);
  } catch (error) {
    next(error);
  }
});
//Profile Preview

app.get(
  "/api/profile/preview",
  requireVerifiedStudent,
  async (request, response, next) => {
    try {
      const accountId = request.session.accountId;


const result = await pool.query(
  `SELECT
    id,
    display_name,
    headline,
    biography,
    program,
    location_text,
    availability,
    skills,
    professional_links,
    education_details,
    experience_details,
    field_visibility,
    profile_status
  FROM student_profile_drafts
  WHERE account_id = $1`,
  [accountId]
);

      if (result.rows.length === 0) {
        return response.status(404).json({
          error: "Create a profile draft first."
        });
      }

      const preview = createPublicProfile(result.rows[0]);

      return response.json({
        preview: true,
        published: false,
        profile: preview
      });
    } catch (error) {
      next(error);
    }
  }
);

//

app.post(
  "/api/profile/publish",
  requireVerifiedStudent,
  async (request, response, next) => {
    try {
      if (request.get("Origin") !== process.env.FRONTEND_ORIGIN) {
        return response.status(403).json({
          error: "Request origin is not allowed."
        });
      }

      const accountId = request.session.accountId;

      const result = await pool.query(
        `UPDATE student_profile_drafts
          SET profile_status = 'published',
            updated_at = NOW()
          WHERE account_id = $1
            AND TRIM(display_name) <> ''
          RETURNING id, profile_status`,
        [accountId]
      );

      if (result.rows.length === 0) {
        return response.status(400).json({
          error: "Create a profile with a professional name before publishing."
        });
      }

      return response.json({
        message: "Your profile has been published successfully.",
        profile: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/profile/unpublish",
  requireVerifiedStudent,
  async (request, response, next) => {
    try {
      if (request.get("Origin") !== process.env.FRONTEND_ORIGIN) {
        return response.status(403).json({
          error: "Request origin is not allowed."
        });
      }

      const accountId = request.session.accountId;

      const result = await pool.query(
      `UPDATE student_profile_drafts
        SET profile_status = 'draft',
            updated_at = NOW()
        WHERE account_id = $1
        RETURNING id, profile_status`,
        [accountId]
      );

      if (result.rows.length === 0) {
        return response.status(404).json({
          error: "Create a profile draft first."
        });
      }

      return response.json({
        message: "Your profile is now private.",
        profile: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

//API.POST RESUME UPLOAD
app.post(
  "/api/profile/resume/upload",
  requireVerifiedStudent,

  (request, response, next) => {
    if (request.get("Origin") !== process.env.FRONTEND_ORIGIN) {
      return response.status(403).json({
        error: "Request origin is not allowed."
      });
    }

    next();
  },

  resumeUpload.single("resume"),

  async (request, response, next) => {
    try {
      const file = request.file;

      if (!file) {
        return response.status(400).json({
          error: "Select a PDF résumé to upload."
        });
      }

      // Check the actual file signature.
      const header = file.buffer
        .subarray(0, 5)
        .toString("ascii");

      if (header !== "%PDF-") {
        return response.status(400).json({
          error: "The uploaded file is not a valid PDF."
        });
      }

let parser;

try {
  parser = new PDFParse({
    data: new Uint8Array(file.buffer)
  });

  const result = await parser.getText();

  const extractedText =
    typeof result.text === "string"
      ? result.text.trim()
      : "";

  if (!extractedText) {
    return response.status(422).json({
      error:
        "No readable text was found in this PDF. " +
        "Your existing profile remains unchanged."
    });
  }

  // Limit the amount of extracted text returned.
  if (extractedText.length > 30000) {
    return response.status(422).json({
      error:
        "This résumé contains too much text to process."
    });
  }

const catalogueResult = await pool.query(
  "SELECT name FROM skills ORDER BY name ASC"
);

const normalizedResumeText = extractedText.toLowerCase();

const candidateSkills = catalogueResult.rows
  .map(row => row.name)
  .filter(skill => {
    const escapedSkill = skill.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const skillPattern = new RegExp(
      `(^|[^a-z0-9])${escapedSkill}($|[^a-z0-9])`,
      "i"
    );

    return skillPattern.test(normalizedResumeText);
  });


app.get(
  "/api/profile/resume/review/:batchId",
  requireVerifiedStudent,
  async (request, response, next) => {
    try {
      const accountId = request.session.accountId;
      const batchId = request.params.batchId;

      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (!uuidPattern.test(batchId)) {
        return response.status(404).json({
          error: "Review batch not found."
        });
      }

      const result = await pool.query(
        `SELECT id, candidates, expires_at
        FROM resume_review_batches
        WHERE id = $1
          AND account_id = $2
          AND status = 'pending'
          AND expires_at > NOW()`,
        [batchId, accountId]
      );

      if (result.rows.length === 0) {
        return response.status(404).json({
          error: "Review batch not found or expired."
        });
      }

      return response.json({
        batch_id: result.rows[0].id,
        expires_at: result.rows[0].expires_at,
        candidates: result.rows[0].candidates
      });
    } catch (error) {
      next(error);
    }
  }
);


app.post(
  "/api/profile/resume/review/validate",
  requireVerifiedStudent,
  async (request, response, next) => {
    try {
      if (request.get("Origin") !== process.env.FRONTEND_ORIGIN) {
        return response.status(403).json({
          error: "Request origin is not allowed."
        });
      }

const { batch_id, decisions } = request.body || {};

console.log("Résumé review validation diagnostic:", {
  batchIdType: typeof batch_id,
  batchIdLength: batch_id?.length,
  batchIdValid:
    typeof batch_id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batch_id),
  decisionsIsArray: Array.isArray(decisions),
  decisionCount: Array.isArray(decisions)
    ? decisions.length
    : null
});



const uuidPattern =
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

const invalidBatchId =
  typeof batch_id !== "string" ||
  !uuidPattern.test(batch_id);

const invalidDecisions =
  !Array.isArray(decisions) ||
  decisions.length > 100;

console.log("Review validation check:", {
  invalidBatchId,
  invalidDecisions,
  batchMatchesPattern: uuidPattern.test(batch_id)
});

if (invalidBatchId || invalidDecisions) {
  return response.status(400).json({
    error: "Invalid résumé review request."
  });
}


      const allowedActions = new Set([
        "accept",
        "edit",
        "reject",
        "pending"
      ]);

      const allowedCategories = new Set([
        "Suggested Skills",
        "Suggested Professional Links",
        "Suggested Education",
        "Suggested Experience & Projects"
      ]);


for (const [index, decision] of decisions.entries()) {
  const problems = [];

  if (
    !decision ||
    typeof decision !== "object" ||
    Array.isArray(decision)
  ) {
    problems.push("Decision must be an object.");
  } else {
    if (!allowedActions.has(decision.action)) {
      problems.push("Invalid action.");
    }

    if (!allowedCategories.has(decision.category)) {
      problems.push("Invalid category.");
    }

    if (typeof decision.original !== "string") {
      problems.push("Original must be text.");
    } else if (decision.original.length > 15000) {
      problems.push("Original is too long.");
    }

    if (typeof decision.value !== "string") {
      problems.push("Value must be text.");
    } else if (decision.value.length > 15000) {
      problems.push("Value is too long.");
    }
  }

  if (problems.length > 0) {
    console.error("Invalid résumé decision:", {
      index,
      problems
    });

    return response.status(400).json({
      error: "Invalid résumé review decision.",
      decision_index: index,
      reasons: problems
    });
  }
}


      const batchResult = await pool.query(
        `SELECT id, candidates, expires_at
        FROM resume_review_batches
        WHERE id = $1
          AND account_id = $2
          AND status = 'pending'
          AND expires_at > NOW()`,
        [batch_id, request.session.accountId]
      );

      if (batchResult.rows.length === 0) {
        return response.status(404).json({
          error: "Review batch not found or expired."
        });
      }

   //
const storedCandidates = batchResult.rows[0].candidates;

const expectedSuggestions = [
  ...(storedCandidates.skills || []).map(value => ({
    category: "Suggested Skills",
    original: value
  })),

  ...(storedCandidates.professional_links || []).map(link => ({
    category: "Suggested Professional Links",
    original: `${link.type}: ${link.url}`
  })),

  ...(storedCandidates.education
    ? [{
        category: "Suggested Education",
        original: storedCandidates.education
      }]
    : []),

  ...(storedCandidates.experience
    ? [{
        category: "Suggested Experience & Projects",
        original: storedCandidates.experience
      }]
    : [])
];

if (decisions.length !== expectedSuggestions.length) {
  return response.status(400).json({
    error: "Review decisions do not match the uploaded résumé."
  });
}

for (let i = 0; i < decisions.length; i++) {
  const submitted = decisions[i];
  const expected = expectedSuggestions[i];

  if (
    submitted.category !== expected.category ||
    submitted.original !== expected.original
  ) {
    return response.status(400).json({
      error: "A résumé suggestion does not match the stored batch.",
      decision_index: i
    });
  }

  if (
    submitted.action === "accept" &&
    submitted.value !== submitted.original
  ) {
    return response.status(400).json({
      error: "Edited values must use the Edit action.",
      decision_index: i
    });
  }

  if (submitted.category === "Suggested Skills" &&
      ["accept", "edit"].includes(submitted.action)) {

    const approvedSkills = await pool.query(
      "SELECT name FROM skills"
    );

    const validSkills = new Set(
      approvedSkills.rows.map(row => row.name)
    );

    if (!validSkills.has(submitted.value)) {
      return response.status(400).json({
        error: "A selected skill is not in the approved catalogue.",
        decision_index: i
      });
    }
  }
}

      return response.json({
        valid_batch: true,
        message:
          "Your review batch is active. " +
          "No changes have been applied.",
        decisions_received: decisions.length,
        expires_at: batchResult.rows[0].expires_at
      });

    } catch (error) {
      next(error);
    }
  }
);


  // RESUME EXTRACTION
const extractResumeSection = (text, heading, nextHeadings) => {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(
    line => line.trim().toUpperCase() === heading
  );

  if (start === -1) {
    return "";
  }

  const end = lines.findIndex((line, index) =>
    index > start &&
    nextHeadings.includes(line.trim().toUpperCase())
  );

  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .filter(line => !/^-- \d+ of \d+ --$/.test(line.trim()))
    .join("\n")
    .trim();
};

const candidateEducation = extractResumeSection(
  extractedText,
  "EDUCATION",
  [
    "TECHNICAL SKILLS",
    "SKILLS",
    "PROJECTS & EXPERIENCE",
    "EXPERIENCE",
    "LEADERSHIP & ACTIVITIES"
  ]
);

const candidateExperience = extractResumeSection(
  extractedText,
  "PROJECTS & EXPERIENCE",
  [
    "EDUCATION",
    "TECHNICAL SKILLS",
    "LEADERSHIP & ACTIVITIES",
    "CERTIFICATIONS",
    "REFERENCES"
  ]
);

  // Candidate Links
const candidateLinks = [];

const urlPattern =
  /(?:https?:\/\/)?(?:www\.)?(?:github\.com|linkedin\.com\/in\/)[^\s<>"')]+/gi;

const foundUrls = extractedText.match(urlPattern) || [];

for (const rawUrl of foundUrls) {
  const normalizedUrl = rawUrl.startsWith("http")
    ? rawUrl
    : `https://${rawUrl}`;

  try {
    const url = new URL(normalizedUrl);

    if (url.hostname === "github.com" ||
        url.hostname === "www.github.com") {
      candidateLinks.push({
        type: "github",
        url: url.href
      });
    } else if (
      url.hostname === "linkedin.com" ||
      url.hostname === "www.linkedin.com"
    ) {
      candidateLinks.push({
        type: "linkedin",
        url: url.href
      });
    }
  } catch {
    // Ignore malformed URLs.
  }
}

//


const candidates = {
  skills: candidateSkills,
  professional_links: candidateLinks,
  education: candidateEducation,
  experience: candidateExperience
};

// Associate this review batch with the signed-in student.
const accountId = request.session.accountId;

const batchResult = await pool.query(
  `INSERT INTO resume_review_batches
    (account_id, candidates)
  VALUES ($1, $2::jsonb)
  RETURNING id, expires_at`,
  [
    accountId,
    JSON.stringify(candidates)
  ]
);

return response.json({
  message: "Résumé suggestions are ready for review.",
  filename: file.originalname,
  pages: result.total,
  batch_id: batchResult.rows[0].id,
  expires_at: batchResult.rows[0].expires_at,
  candidates
});


} catch (error) {
  console.error(
    "Résumé PDF extraction failed:",
    error.message
  );

  return response.status(422).json({
    error:
      "Unable to read this PDF résumé. " +
      "Your saved profile has not been changed."
  });

} finally {
  if (parser) {
    await parser.destroy();
  }
}

    } catch (error) {
      next(error);
    }
  }
);

// APP.POST - API/PROFILE/RESUME/REVIEW/APPLY
app.post(
  "/api/profile/resume/review/apply",
  requireVerifiedStudent,
  async (request, response, next) => {
    if (request.get("Origin") !== process.env.FRONTEND_ORIGIN) {
      return response.status(403).json({
        error: "Request origin is not allowed."
      });
    }

    const { batch_id, decisions } = request.body || {};

    const uuidPattern =
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

    if (
      typeof batch_id !== "string" ||
      !uuidPattern.test(batch_id) ||
      !Array.isArray(decisions) ||
      decisions.length > 100
    ) {
      return response.status(400).json({
        error: "Invalid résumé application request."
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const batchResult = await client.query(
        `SELECT candidates
        FROM resume_review_batches
        WHERE id = $1
          AND account_id = $2
          AND status = 'pending'
          AND expires_at > NOW()
        FOR UPDATE`,
        [batch_id, request.session.accountId]
      );

      if (batchResult.rows.length === 0) {
        throw Object.assign(
          new Error("Review batch not found, expired, or already used."),
          { status: 409 }
        );
      }

      const candidates = batchResult.rows[0].candidates;

      const expected = [
        ...(candidates.skills || []).map(value => ({
          category: "Suggested Skills",
          original: value
        })),
        ...(candidates.professional_links || []).map(link => ({
          category: "Suggested Professional Links",
          original: `${link.type}: ${link.url}`
        })),
        ...(candidates.education
          ? [{
              category: "Suggested Education",
              original: candidates.education
            }]
          : []),
        ...(candidates.experience
          ? [{
              category: "Suggested Experience & Projects",
              original: candidates.experience
            }]
          : [])
      ];

      if (decisions.length !== expected.length) {
        throw Object.assign(
          new Error("Review decisions do not match the résumé."),
          { status: 400 }
        );
      }

      const allowedActions =
        new Set(["accept", "edit", "reject", "pending"]);

      const profileResult = await client.query(
        `SELECT skills, professional_links,
                education_details, experience_details
        FROM student_profile_drafts
        WHERE account_id = $1
        FOR UPDATE`,
        [request.session.accountId]
      );

      if (profileResult.rows.length === 0) {
        throw Object.assign(
          new Error("Create a profile draft before applying suggestions."),
          { status: 404 }
        );
      }

      const profile = profileResult.rows[0];
      const skills = [...(profile.skills || [])];
      const links = { ...(profile.professional_links || {}) };
      let education = profile.education_details || "";
      let experience = profile.experience_details || "";

      const catalogue = await client.query(
        "SELECT name FROM skills"
      );

      const validSkills = new Set(
        catalogue.rows.map(row => row.name)
      );

      let appliedCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < decisions.length; i++) {
        const decision = decisions[i];
        const original = expected[i];

        if (
          !decision ||
          typeof decision !== "object" ||
          Array.isArray(decision) ||
          decision.category !== original.category ||
          decision.original !== original.original ||
          !allowedActions.has(decision.action) ||
          typeof decision.value !== "string" ||
          decision.value.length > 15000
        ) {
          throw Object.assign(
            new Error(`Invalid résumé decision at index ${i}.`),
            { status: 400 }
          );
        }

        if (decision.action === "accept" &&
            decision.value !== decision.original) {
          throw Object.assign(
            new Error(`Accepted decision ${i} was modified.`),
            { status: 400 }
          );
        }

        if (["pending", "reject"].includes(decision.action)) {
          skippedCount++;
          continue;
        }

        const value = decision.value.trim();

        if (!value) {
          throw Object.assign(
            new Error(`Approved suggestion ${i} is empty.`),
            { status: 400 }
          );
        }

        if (decision.category === "Suggested Skills") {
          if (!validSkills.has(value)) {
            throw Object.assign(
              new Error(`Skill at index ${i} is not approved.`),
              { status: 400 }
            );
          }

          if (!skills.includes(value)) {
            skills.push(value);
            appliedCount++;
          } else {
            skippedCount++;
          }
        }

        if (decision.category === "Suggested Professional Links") {
          const storedLink = candidates.professional_links[
            i - candidates.skills.length
          ];

          if (!storedLink) {
            throw Object.assign(
              new Error("Professional link mismatch."),
              { status: 400 }
            );
          }

          const type = storedLink.type;

          if (!["github", "linkedin"].includes(type)) {
            throw Object.assign(
              new Error("Unsupported professional link."),
              { status: 400 }
            );
          }

          const editedUrl = decision.action === "edit"
            ? value.replace(
                new RegExp(`^${type}:\\s*`, "i"),
                ""
              )
            : storedLink.url;

          let url;
          try {
            url = new URL(editedUrl);
          } catch {
            throw Object.assign(
              new Error("Invalid professional link URL."),
              { status: 400 }
            );
          }

          const allowedHosts = type === "github"
            ? ["github.com", "www.github.com"]
            : ["linkedin.com", "www.linkedin.com"];

          if (
            url.protocol !== "https:" ||
            !allowedHosts.includes(url.hostname) ||
            (type === "linkedin" &&
              !url.pathname.startsWith("/in/")) ||
            url.href.length > 500
          ) {
            throw Object.assign(
              new Error("Unsupported professional link URL."),
              { status: 400 }
            );
          }

          if (!links[type]) {
            links[type] = url.href;
            appliedCount++;
          } else {
            skippedCount++;
          }
        }

        if (decision.category === "Suggested Education") {
          if (!education.includes(value)) {
            education = education
              ? `${education}\n\n${value}`
              : value;
            appliedCount++;
          } else {
            skippedCount++;
          }
        }

        if (
          decision.category ===
          "Suggested Experience & Projects"
        ) {
          if (!experience.includes(value)) {
            experience = experience
              ? `${experience}\n\n${value}`
              : value;
            appliedCount++;
          } else {
            skippedCount++;
          }
        }
      }


await client.query(
  `UPDATE student_profile_drafts
  SET skills = $2::text[],
      professional_links = $3::jsonb,
      education_details = $4,
      experience_details = $5,
      updated_at = NOW()
  WHERE account_id = $1`,
  [
    request.session.accountId,
    skills,
    JSON.stringify(links),
    education,
    experience
  ]
);


      await client.query(
        `UPDATE resume_review_batches
        SET status = 'applied',
            used_at = NOW()
        WHERE id = $1 AND account_id = $2`,
        [batch_id, request.session.accountId]
      );

      await client.query("COMMIT");

      return response.json({
        message: "Approved résumé suggestions applied successfully.",
        applied_count: appliedCount,
        skipped_count: skippedCount
      });

    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});

      if (error.status) {
        return response.status(error.status).json({
          error: error.message
        });
      }

      next(error);
    } finally {
      client.release();
    }
  }
);

// APP.GET -- API PROFILE DRAFT
app.get(
  "/api/profile/draft",
  requireVerifiedStudent,
  async (request, response, next) => {
    try {
      const accountId = request.session.accountId;

      const result = await pool.query(
        `SELECT
          id,
          display_name,
          headline,
          biography,
          program,
          location_text,
          availability,
          skills,
          professional_links,
          field_visibility,
          education_details,
          experience_details,
          profile_status,
          created_at,
          updated_at
        FROM student_profile_drafts
        WHERE account_id = $1`,
        [accountId]
      );

      if (result.rows.length === 0) {
        return response.json({
          exists: false,
          profile: null
        });
      }

      response.json({
        exists: true,
        profile: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/profile/draft
app.post(
  "/api/profile/draft",
  requireVerifiedStudent,
  async (request, response, next) => {
    try {
      // Allow requests from our configured frontend.
      if (request.get("Origin") !== process.env.FRONTEND_ORIGIN) {
        return response.status(403).json({
          error: "Request origin is not allowed."
        });
      }

      // Ownership always comes from the server-side session.
      const accountId = request.session.accountId;

      const body = request.body || {};

const backgroundFields = [
  "education_details",
  "experience_details"
];

for (const field of backgroundFields) {
  if (
    body[field] !== undefined &&
    (
      typeof body[field] !== "string" ||
      body[field].length > 15000
    )
  ) {
    return response.status(400).json({
      error: `${field} must be text with at most 15000 characters.`
    });
  }
}

const educationDetails =
  body.education_details === undefined
    ? null
    : body.education_details.trim();

const experienceDetails =
  body.experience_details === undefined
    ? null
    : body.experience_details.trim();


      // Reject attempts to specify someone else's identity.


const allowedFields = new Set([
  "display_name",
  "headline",
  "biography",
  "program",
  "location_text",
  "availability",
  "skills",
  "professional_links",
  "field_visibility",
  "education_details",
  "experience_details"
]);



      if (Object.keys(body).some(key => !allowedFields.has(key))) {
        return response.status(400).json({
          error: "Unexpected profile field."
        });
      }

      if (
        typeof body.display_name !== "string" ||
        typeof body.headline !== "string" ||
        typeof body.biography !== "string"
      ) {
        return response.status(400).json({
          error: "Name, headline and biography must be text."
        });
      }

      const displayName = body.display_name.trim();
      const headline = body.headline.trim();
      const biography = body.biography.trim();


if (
  typeof body.program !== "string" ||
  typeof body.location_text !== "string"
) {
  return response.status(400).json({
    error: "Program and location must be text."
  });
}

const program = body.program.trim();
const locationText = body.location_text.trim();


if (program.length > 200 || locationText.length > 200) {
  return response.status(400).json({
    error: "Program and location must be 200 characters or fewer."
  });
}

// ADD THE AVAILABILITY VALIDATION HERE

const permittedAvailability = new Set([
  "internship",
  "co-op",
  "part-time",
  "full-time",
  "contract"
]);

if (
  !Array.isArray(body.availability) ||
  body.availability.some(
    value => !permittedAvailability.has(value)
  ) ||
  new Set(body.availability).size !== body.availability.length
) {
  return response.status(400).json({
    error: "Invalid employment availability."
  });
}

const availability = body.availability;

      if (
        !displayName ||
        displayName.length > 150 ||
        headline.length > 200 ||
        biography.length > 5000
      ) {
        return response.status(400).json({
          error: "Check your name, headline and biography lengths."
        });
      }


if (
  !Array.isArray(body.skills) ||
  body.skills.some(
    skill => typeof skill !== "string"
  ) ||
  new Set(body.skills).size !== body.skills.length
) {
  return response.status(400).json({
    error: "Invalid skills selection."
  });
}

const skillsResult = await pool.query(
  "SELECT name FROM skills"
);

const validSkills = new Set(
  skillsResult.rows.map(row => row.name)
);

if (body.skills.some(skill => !validSkills.has(skill))) {
  return response.status(400).json({
    error: "Select skills from the approved catalogue."
  });
}

const skills = body.skills;

//
const professionalLinks = body.professional_links;

if (
  !professionalLinks ||
  typeof professionalLinks !== "object" ||
  Array.isArray(professionalLinks)
) {
  return response.status(400).json({
    error: "Invalid professional links."
  });
}

const allowedLinkTypes = new Set([
  "github",
  "linkedin",
  "portfolio"
]);

if (
  Object.keys(professionalLinks).some(
    key => !allowedLinkTypes.has(key)
  )
) {
  return response.status(400).json({
    error: "Unexpected professional link type."
  });
}

for (const type of allowedLinkTypes) {
  const value = professionalLinks[type];

  if (typeof value !== "string" || value.length > 500) {
    return response.status(400).json({
      error: `Invalid ${type} URL.`
    });
  }

  if (value !== "") {
    try {
      const url = new URL(value);

      if (
        !["https:", "http:"].includes(url.protocol) ||
        !url.hostname
      ) {
        return response.status(400).json({
          error: `Invalid ${type} URL.`
        });
      }
    } catch {
      return response.status(400).json({
        error: `Invalid ${type} URL.`
      });
    }
  }
}

//Add validation For Visibility


const visibilityFields = [
    "display_name",
    "headline",
    "biography",
    "program",
    "location_text",
    "availability",
    "skills",
    "professional_links",
    "education_details",
    "experience_details"
];

const fieldVisibility = body.field_visibility;

if (
  !fieldVisibility ||
  typeof fieldVisibility !== "object" ||
  Array.isArray(fieldVisibility) ||
  Object.keys(fieldVisibility).length !== visibilityFields.length ||
  visibilityFields.some(
    field => typeof fieldVisibility[field] !== "boolean"
  ) ||
  Object.keys(fieldVisibility).some(
    field => !visibilityFields.includes(field)
  )
) {
  return response.status(400).json({
    error: "Invalid profile privacy settings."
  });
}


// POOL QUERY : POST /api/profile/draft
const result = await pool.query(
  `INSERT INTO student_profile_drafts (
    account_id,
    display_name,
    headline,
    biography,
    program,
    location_text,
    availability,
    skills,
    professional_links,
    field_visibility,
    education_details,
    experience_details
  )
  VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10,
    COALESCE($11::text, ''),
    COALESCE($12::text, '')
  )
  ON CONFLICT (account_id)
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    headline = EXCLUDED.headline,
    biography = EXCLUDED.biography,
    program = EXCLUDED.program,
    location_text = EXCLUDED.location_text,
    availability = EXCLUDED.availability,
    skills = EXCLUDED.skills,
    professional_links = EXCLUDED.professional_links,
    field_visibility = EXCLUDED.field_visibility,
    education_details = COALESCE(
      $11::text,
      student_profile_drafts.education_details
    ),
    experience_details = COALESCE(
      $12::text,
      student_profile_drafts.experience_details
    ),
    updated_at = NOW()
  RETURNING
    id,
    display_name,
    headline,
    biography,
    program,
    location_text,
    availability,
    skills,
    professional_links,
    field_visibility,
    education_details,
    experience_details,
    profile_status`,
  [
    accountId,
    displayName,
    headline,
    biography,
    program,
    locationText,
    availability,
    skills,
    JSON.stringify(professionalLinks),
    JSON.stringify(fieldVisibility),
    educationDetails,
    experienceDetails
  ]
);

      response.json({
        message: "Profile draft saved successfully.",
        profile: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);


// POST VERIFICATION
app.post("/api/verification/request", async (request, response, next) => {
  const accountId = request.session.accountId;

  if (!accountId) {
    return response.status(401).json({
      error: "Sign in with GitHub first."
    });
  }

  // Only accept requests from our configured frontend.
  if (request.get("Origin") !== process.env.FRONTEND_ORIGIN) {
    return response.status(403).json({
      error: "Request origin is not allowed."
    });
  }

  const email = typeof request.body?.email === "string"
    ? request.body.email.trim().toLowerCase()
    : "";

  if (
    email.length > 254 ||
    !isApprovedAlgomaEmail(email)
  ) {
    return response.status(400).json({
      error: "Enter a valid approved Algoma email address."
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock this account to prevent concurrent requests
    // bypassing the rate limits.
    const accountResult = await client.query(
      `SELECT email_verified_at
        FROM student_accounts
        WHERE id = $1
        FOR UPDATE`,
      [accountId]
    );

    if (accountResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return response.status(401).json({
        error: "Account not found. Sign in again."
      });
    }

    if (accountResult.rows[0].email_verified_at) {
      await client.query("ROLLBACK");
      return response.status(409).json({
        error: "Your Algoma affiliation is already verified."
      });
    }

    const limits = await client.query(
      `SELECT
        COUNT(*)::int AS hourly_count,
        MAX(requested_at) AS last_request
        FROM verification_request_history
        WHERE account_id = $1
        AND requested_at > NOW() - INTERVAL '1 hour'`,
      [accountId]
    );

    const { hourly_count, last_request } = limits.rows[0];

    const cooldownSeconds = Math.max(
      60,
      Number(process.env.VERIFICATION_RESEND_COOLDOWN_SECONDS) || 60
    );

    if (
      last_request &&
      Date.now() - new Date(last_request).getTime()
        < cooldownSeconds * 1000
    ) {
      await client.query("ROLLBACK");
      return response.status(429).json({
        error: "Please wait before requesting another code."
      });
    }

    if (hourly_count >= 5) {
      await client.query("ROLLBACK");
      return response.status(429).json({
        error: "Too many requests. Try again later."
      });
    }

    const code = generateVerificationCode();
    const codeHash = hashVerificationCode(accountId, code);
    const expiresAt = getVerificationExpiry();

    // Record this request before attempting email delivery.
    await client.query(
      `INSERT INTO verification_request_history
        (account_id)
      VALUES ($1)`,
      [accountId]
    );

    // Invalidate older unused challenges.
    await client.query(
      `UPDATE email_verification_challenges
      SET consumed_at = NOW()
      WHERE account_id = $1
        AND consumed_at IS NULL`,
      [accountId]
    );

    await client.query(
      `INSERT INTO email_verification_challenges
        (account_id, email, code_hash, expires_at)
      VALUES ($1, $2, $3, $4)`,
      [accountId, email, codeHash, expiresAt]
    );

    await client.query("COMMIT");

    // Never return the code in the API response.
    try {
      await sendVerificationEmail(email, code);
    } catch (deliveryError) {
      console.error(
        "Verification email delivery failed:",
        deliveryError.message
      );

      return response.status(503).json({
        error: "Unable to send your code. Please try again later."
      });
    }

    return response.json({
      message: "If delivery succeeds, check your Algoma inbox for your code."
    });

  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original database error.
    }

    next(error);
  } finally {
    client.release();
  }
});




app.post("/api/verification/confirm", async (request, response, next) => {
  const accountId = request.session.accountId;

  if (!accountId) {
    return response.status(401).json({
      error: "Sign in with GitHub first."
    });
  }

  if (request.get("Origin") !== process.env.FRONTEND_ORIGIN) {
    return response.status(403).json({
      error: "Request origin is not allowed."
    });
  }

  const code = request.body?.code;

  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return response.status(400).json({
      error: "Enter the six-digit verification code."
    });
  }

  const maxAttempts = Math.max(
    1,
    Math.min(10, Number(process.env.VERIFICATION_MAX_ATTEMPTS) || 5)
  );

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Serialize verification attempts for this account.
    const accountResult = await client.query(
      `SELECT id, email_verified_at
        FROM student_accounts
        WHERE id = $1
        FOR UPDATE`,
      [accountId]
    );

    if (!accountResult.rows.length) {
      await client.query("ROLLBACK");
      return response.status(401).json({
        error: "Account not found. Sign in again."
      });
    }

    if (accountResult.rows[0].email_verified_at) {
      await client.query("ROLLBACK");
      return response.status(409).json({
        error: "Your Algoma affiliation is already verified."
      });
    }

    const challengeResult = await client.query(
      `SELECT id, email, code_hash, expires_at,
              failed_attempts
        FROM email_verification_challenges
        WHERE account_id = $1
        AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [accountId]
    );

    if (!challengeResult.rows.length) {
      await client.query("ROLLBACK");
      return response.status(400).json({
        error: "No active code. Request a new one."
      });
    }

    const challenge = challengeResult.rows[0];

    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE email_verification_challenges
          SET consumed_at = NOW()
          WHERE id = $1`,
        [challenge.id]
      );

      await client.query("COMMIT");

      return response.status(400).json({
        error: "This code has expired. Request a new one."
      });
    }

    if (challenge.failed_attempts >= maxAttempts) {
      await client.query("ROLLBACK");
      return response.status(429).json({
        error: "Too many incorrect attempts. Request a new code."
      });
    }

    const submittedHash = hashVerificationCode(accountId, code);

    const expectedHash = Buffer.from(challenge.code_hash, "hex");
    const actualHash = Buffer.from(submittedHash, "hex");

    const matches =
      expectedHash.length === actualHash.length &&
      crypto.timingSafeEqual(expectedHash, actualHash);

    if (!matches) {
      await client.query(
        `UPDATE email_verification_challenges
          SET failed_attempts = failed_attempts + 1
          WHERE id = $1`,
        [challenge.id]
      );

      await client.query("COMMIT");

      return response.status(400).json({
        error: "Incorrect code. Check your email and try again."
      });
    }

    // Mark this exact challenge as used.
    await client.query(
      `UPDATE email_verification_challenges
        SET consumed_at = NOW()
        WHERE id = $1`,
      [challenge.id]
    );

    // Grant affiliation only after a valid code.
    await client.query(
      `UPDATE student_accounts
        SET algoma_email = $1,
          email_verified_at = NOW(),
          updated_at = NOW()
        WHERE id = $2`,
      [challenge.email, accountId]
    );

    await client.query("COMMIT");

    return response.json({
      verified: true,
      message: "Algoma affiliation verified successfully."
    });

  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original error.
    }

    next(error);
  } finally {
    client.release();
  }
});


// 3. Existing health check
app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ ok: true, database: "reachable" });
  } catch (error) {
    console.error("Health check could not reach PostgreSQL:", error.message);
    response.status(503).json({ ok: false, error: "database unavailable" });
  }
});

app.get("/api/students", async (request, response, next) => {
  try {
    const search = (request.query.search || "").toLowerCase();
    const skill = request.query.skill;
    const availability = request.query.availability;
    const status = request.query.status;


const result = await pool.query(
  `SELECT
    s.id,
    s.name,
    s.headline,
    s.program,
    s.status,
    s.profile_status,
    s.availability,
    s.links,
    COALESCE(
      json_agg(DISTINCT ss.skill_name)
      FILTER (WHERE ss.skill_name IS NOT NULL),
      '[]'
    ) AS skills
  FROM students s
  LEFT JOIN student_skills ss
    ON ss.student_id = s.id
  WHERE s.profile_status = 'published'
  GROUP BY s.id
  ORDER BY s.name ASC`
);



    // Load published Release 2 profiles.
    const release2Result = await pool.query(
      `SELECT
        id,
        display_name,
        headline,
        biography,
        program,
        location_text,
        availability,
        skills,
        professional_links,
        field_visibility,
        profile_status
      FROM student_profile_drafts
      WHERE profile_status = 'published'
      ORDER BY updated_at DESC`
    );

    // Apply privacy settings before adding profiles
    // to the public Talent Directory.
    const release2Students =
      release2Result.rows.map(createDirectoryStudent);

    // Combine Release 1 students with published Release 2 profiles.
    let students = [
      ...result.rows,
      ...release2Students
    ];


    if (search) {
      students = students.filter((student) => {
        const searchable = [
          student.name,
          student.headline,
          ...(student.skills || []),
        ]
          .join(" ")
          .toLowerCase();

        return searchable.includes(search);
      });
    }

    if (skill) {
      const requestedSkills = Array.isArray(skill) ? skill : [skill];

      students = students.filter((student) =>
        requestedSkills.every((requestedSkill) =>
          student.skills.includes(requestedSkill)
        )
      );
    }

    if (availability) {
      const requestedAvailability = Array.isArray(availability)
        ? availability
        : [availability];

      students = students.filter((student) =>
        requestedAvailability.some((value) =>
          student.availability.includes(value)
        )
      );
    }

    if (status) {
      const requestedStatuses = Array.isArray(status) ? status : [status];

      students = students.filter((student) =>
        requestedStatuses.includes(student.status)
      );
    }

    response.json(students);
  } catch (error) {
    next(error);
  }
});

app.get("/api/skills", async (_request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT name
      FROM skills
      ORDER BY name ASC`
    );

    response.json(result.rows.map((row) => row.name));
  } catch (error) {
    next(error);
  }
});

app.get("/api/students/:id",
  async (request, response, next) => {
  try {
    const { id } = request.params;


const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Release 2 profiles use UUID identifiers.
if (uuidPattern.test(id)) {
  const release2Result = await pool.query(
    `SELECT
      id,
      display_name,
      headline,
      biography,
      program,
      location_text,
      availability,
      skills,
      professional_links,
      field_visibility,
      profile_status
    FROM student_profile_drafts
    WHERE id = $1
      AND profile_status = 'published'`,
    [id]
  );

  if (release2Result.rows.length === 0) {
    return response.status(404).json({
      error: "Student not found"
    });
  }

  const profile = release2Result.rows[0];
  const directoryStudent = createDirectoryStudent(profile);

  return response.json({
    ...directoryStudent,
    ...(
      profile.field_visibility?.biography === true
        ? { biography: profile.biography }
        : {}
    ),
    ...(
      profile.field_visibility?.location_text === true
        ? { location_text: profile.location_text }
        : {}
    ),
    projects: []
  });
}

    const studentResult = await pool.query(
      `
      SELECT
        s.id,
        s.name,
        s.headline,
        s.program,
        s.status,
        s.profile_status,
        s.availability,
        s.links,
        COALESCE(
          json_agg(DISTINCT ss.skill_name)
          FILTER (WHERE ss.skill_name IS NOT NULL),
          '[]'
        ) AS skills
      FROM students s
      LEFT JOIN student_skills ss
        ON ss.student_id = s.id
      WHERE s.id = $1
        AND s.profile_status = 'published'
      GROUP BY s.id
      `,
      [id]
    );

    if (studentResult.rows.length === 0) {
      response.status(404).json({
        error: "Student not found",
      });
      return;
    }

    const projectResult = await pool.query(
      `
      SELECT
        p.id,
        p.title,
        p.description,
        p.domain,
        p.technologies,
        p.links,
        pc.role
      FROM projects p
      JOIN project_contributors pc
        ON pc.project_id = p.id
      WHERE pc.student_id = $1
      ORDER BY p.title ASC
      `,
      [id]
    );

    response.json({
      ...studentResult.rows[0],
      projects: projectResult.rows,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:id", async (request, response, next) => {
  try {
    const { id } = request.params;

    const projectResult = await pool.query(
      `
      SELECT
        p.id,
        p.title,
        p.description,
        p.domain,
        p.technologies,
        p.links
      FROM projects p
      WHERE p.id = $1
      `,
      [id]
    );

    if (projectResult.rows.length === 0) {
      response.status(404).json({
        error: "Project not found",
      });
      return;
    }

    const contributorResult = await pool.query(
      `
      SELECT
        s.id,
        s.name,
        s.headline,
        pc.role
      FROM project_contributors pc
      JOIN students s
        ON s.id = pc.student_id
      WHERE pc.project_id = $1
      ORDER BY s.name ASC
      `,
      [id]
    );

    response.json({
      ...projectResult.rows[0],
      contributors: contributorResult.rows,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/items", async (_request, response, next) => {
  try {
    const result = await pool.query(
      "SELECT id, title, created_at FROM items ORDER BY created_at DESC",
    );
    response.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/items", async (request, response, next) => {
  try {
    // INTENTIONAL DEFECT: whitespace-only titles are accepted.
    // Leave this in place until a peer outside the team files the GitHub issue.
    const title = typeof request.body.title === "string" ? request.body.title : "";
    if (title.length === 0) {
      response.status(400).json({ error: "title is required" });
      return;
    }

    const result = await pool.query(
      "INSERT INTO items (title) VALUES ($1) RETURNING id, title, created_at",
      [title],
    );
    response.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});


app.use((error, _request, response, _next) => {
  console.error("Unexpected API error:", error);

  response.status(500).json({
    error: "unexpected server error"
  });
});


const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on port ${port}`);
});
