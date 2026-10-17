const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

const router = express.Router();
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const pendingStates = new Map();
const DOMAINS = (process.env.ALGOMA_EMAIL_DOMAINS || process.env.ALGOMA_EMAIL_DOMAIN || "algomau.ca").split(",").map((domain) => domain.trim().toLowerCase()).filter(Boolean);
const CODE_TTL_MINUTES = Math.min(30, Math.max(1, Number.parseInt(process.env.VERIFICATION_CODE_TTL_MINUTES || "30", 10) || 30));
const COOKIE = "r2_session";

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function signature(value) {
  return crypto.createHmac("sha256", process.env.R2_SESSION_SECRET).update(value).digest("base64url");
}
function setSession(res, userId) {
  const payload = Buffer.from(JSON.stringify({ sub: String(userId), exp: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url");
  res.cookie(COOKIE, payload + "." + signature(payload), { httpOnly: true, secure: true, sameSite: "lax", maxAge: 8 * 60 * 60 * 1000, path: "/" });
}
function getSession(req) {
  const raw = (req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  if (!raw || !process.env.R2_SESSION_SECRET) return null;
  const [payload, supplied] = raw.split(".");
  if (!payload || !supplied) return null;
  const expected = signature(payload);
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.exp > Date.now() ? session.sub : null;
  } catch { return null; }
}
function requireSession(req, res, next) {
  req.userId = getSession(req);
  if (!req.userId) return res.status(401).json({ error: "Sign in with GitHub first." });
  next();
}
function requireOrigin(req, res, next) {
  const allowed = process.env.FRONTEND_ORIGIN;
  if (!allowed || req.get("origin") !== allowed) return res.status(403).json({ error: "Request origin is not allowed." });
  next();
}
function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function cookie(req, name) {
  return (req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="))?.slice(name.length + 1);
}

module.exports = function createR2Router(pool) {
  // All statements in the root schema are additive and use IF NOT EXISTS.
  // Applying it here makes the R2 account tables available on a fresh deploy.
  const schemaSql = fs.readFileSync(path.join(__dirname, "../schema.sql"), "utf8");
  const schemaReady = pool.query(schemaSql);
  router.use((_req, _res, next) => {
    schemaReady.then(() => next()).catch(next);
  });

  router.get("/auth/github", (req, res) => {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CALLBACK_URL) return res.status(503).send("GitHub OAuth is not configured.");
    const state = crypto.randomBytes(24).toString("hex");
    pendingStates.set(state, Date.now() + 10 * 60 * 1000);
    res.cookie("r2_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 10 * 60 * 1000, path: "/api/auth" });
    for (const [key, expires] of pendingStates) if (expires < Date.now()) pendingStates.delete(key);
    const params = new URLSearchParams({ client_id: process.env.GITHUB_CLIENT_ID, redirect_uri: process.env.GITHUB_CALLBACK_URL, scope: "read:user", state });
    res.redirect("https://github.com/login/oauth/authorize?" + params);
  });

  router.get("/auth/github/callback", asyncHandler(async (req, res) => {
    try {
      const expires = pendingStates.get(req.query.state);
      pendingStates.delete(req.query.state);
      const stateCookie = cookie(req, "r2_oauth_state");
      res.clearCookie("r2_oauth_state", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth" });
      if (!expires || expires < Date.now() || stateCookie !== req.query.state || !req.query.code) return res.status(400).send("Sign-in expired. Return to the profile page and try again.");
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code: req.query.code, redirect_uri: process.env.GITHUB_CALLBACK_URL })
      });
      const token = await tokenResponse.json();
      if (!token.access_token) return res.status(401).send("GitHub sign-in failed.");
      const userResponse = await fetch("https://api.github.com/user", { headers: { Authorization: "Bearer " + token.access_token, Accept: "application/vnd.github+json", "User-Agent": "COSC3506-Team04" } });
      const user = await userResponse.json();
      if (!user.id) return res.status(401).send("Could not confirm the GitHub account.");
      const account = await pool.query("INSERT INTO r2_accounts (github_id, github_login) VALUES ($1, $2) ON CONFLICT (github_id) DO UPDATE SET github_login = EXCLUDED.github_login RETURNING user_id", [String(user.id), user.login || ""]);
      setSession(res, account.rows[0].user_id);
      res.redirect((process.env.FRONTEND_ORIGIN || "/") + "/profile.html");
    } catch (error) {
      console.error("GitHub sign-in failed:", error.message);
      res.status(500).send("Sign-in failed. Please try again.");
    }
  }));;

  router.get("/auth/me", asyncHandler(async (req, res) => {
    const id = getSession(req);
    if (!id) return res.status(401).json({ authenticated: false });
    const result = await pool.query("SELECT github_login, email, verified_at FROM r2_accounts WHERE user_id=$1", [id]);
    if (!result.rows[0]) return res.status(401).json({ authenticated: false });
    res.json({ authenticated: true, github_login: result.rows[0].github_login, email: result.rows[0].email, verified: Boolean(result.rows[0].verified_at) });
  }));;

  router.post("/auth/logout", requireOrigin, (_req, res) => {
    res.clearCookie(COOKIE, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    res.json({ ok: true });
  });

  router.post("/affiliation/request", requireOrigin, requireSession, asyncHandler(async (req, res) => {
    const email = text(req.body.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(email) || !DOMAINS.includes(email.slice(email.lastIndexOf("@") + 1))) return res.status(400).json({ error: "Enter your Algoma email address." });
    const existingAccount = await pool.query("SELECT verified_at FROM r2_accounts WHERE user_id=$1", [req.userId]);
    if (existingAccount.rows[0]?.verified_at) return res.status(409).json({ error: "This GitHub account already has a verified Algoma email. Contact support if it needs correction." });
    if (!process.env.RESEND_API_KEY || !process.env.VERIFICATION_FROM_EMAIL) return res.status(503).json({ error: "Email verification is not configured yet." });
    const rateLimit = await pool.query(`
      INSERT INTO r2_verification_limits (user_id, window_started_at, request_count, last_requested_at)
      VALUES ($1, NOW(), 1, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        request_count = CASE WHEN r2_verification_limits.window_started_at < NOW() - INTERVAL '1 hour' THEN 1 ELSE r2_verification_limits.request_count + 1 END,
        window_started_at = CASE WHEN r2_verification_limits.window_started_at < NOW() - INTERVAL '1 hour' THEN NOW() ELSE r2_verification_limits.window_started_at END,
        last_requested_at = NOW()
      WHERE r2_verification_limits.last_requested_at <= NOW() - INTERVAL '60 seconds'
        AND (r2_verification_limits.window_started_at < NOW() - INTERVAL '1 hour' OR r2_verification_limits.request_count < 5)
      RETURNING user_id
    `, [req.userId]);
    if (!rateLimit.rows.length) return res.status(429).json({ error: "Wait one minute between verification emails; at most five can be requested per hour." });
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
    await pool.query("INSERT INTO r2_verification_challenges (user_id, email, code_hash, expires_at, attempts) VALUES ($1,$2,$3,$4,0) ON CONFLICT (user_id) DO UPDATE SET email=EXCLUDED.email, code_hash=EXCLUDED.code_hash, expires_at=EXCLUDED.expires_at, attempts=0, used_at=NULL", [req.userId, email, hash(code), expiresAt]);
    const sent = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.VERIFICATION_FROM_EMAIL, to: [email], subject: "Your Algoma verification code", text: "Your one-time verification code is " + code + ". It expires in 30 minutes." }) });
    if (!sent.ok) return res.status(502).json({ error: "Could not send the verification email." });
    res.json({ ok: true, message: "Check your Algoma email for a verification code." });
  }));;

  router.post("/affiliation/verify", requireOrigin, requireSession, asyncHandler(async (req, res) => {
    const code = text(req.body.code, 6);
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the six-digit code." });
    const result = await pool.query("SELECT email, code_hash, expires_at, used_at, attempts FROM r2_verification_challenges WHERE user_id=$1", [req.userId]);
    const challenge = result.rows[0];
    if (!challenge || challenge.used_at || new Date(challenge.expires_at) < new Date()) return res.status(400).json({ error: "Code expired or already used. Request a new code." });
    if (challenge.attempts >= 5) return res.status(429).json({ error: "Too many attempts. Request a new code." });
    const submittedHash = Buffer.from(hash(code));
    const savedHash = Buffer.from(challenge.code_hash);
    if (submittedHash.length !== savedHash.length || !crypto.timingSafeEqual(submittedHash, savedHash)) {
      const failedAttempt = await pool.query("UPDATE r2_verification_challenges SET attempts=attempts+1 WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL AND expires_at>NOW() AND attempts<5 RETURNING attempts", [req.userId, challenge.code_hash]);
      if (!failedAttempt.rows.length) return res.status(429).json({ error: "Too many attempts or the challenge changed. Request a new code." });
      return res.status(400).json({ error: "That code is incorrect." });
    }
    const consumed = await pool.query("UPDATE r2_verification_challenges SET used_at=NOW() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL AND expires_at>NOW() AND attempts<5 RETURNING email", [req.userId, challenge.code_hash]);
    if (!consumed.rows.length) return res.status(400).json({ error: "Code expired, changed, or already used. Request a new code." });
    await pool.query("UPDATE r2_accounts SET email=$2, verified_at=NOW() WHERE user_id=$1", [req.userId, consumed.rows[0].email]);
    await pool.query("INSERT INTO r2_profiles (user_id, profile) VALUES ($1, '{}'::jsonb) ON CONFLICT (user_id) DO NOTHING", [req.userId]);
    res.json({ ok: true });
  }));;

  router.get("/profile", requireSession, asyncHandler(async (req, res) => {
    const account = await pool.query("SELECT verified_at FROM r2_accounts WHERE user_id=$1", [req.userId]);
    if (!account.rows[0]?.verified_at) return res.status(403).json({ error: "Verify your Algoma email first." });
    const result = await pool.query("SELECT profile, published FROM r2_profiles WHERE user_id=$1", [req.userId]);
    res.json(result.rows[0] || { profile: {}, published: false });
  }));;

  router.put("/profile", requireOrigin, requireSession, asyncHandler(async (req, res) => {
    const account = await pool.query("SELECT verified_at FROM r2_accounts WHERE user_id=$1", [req.userId]);
    if (!account.rows[0]?.verified_at) return res.status(403).json({ error: "Verify your Algoma email first." });
    const source = req.body || {};
    const skills = Array.isArray(source.skills) ? [...new Set(source.skills.map((v) => text(v, 60)).filter(Boolean))].slice(0, 20) : [];
    if (skills.length) {
      const known = await pool.query("SELECT name FROM skills WHERE name = ANY($1::text[])", [skills]);
      if (known.rows.length !== skills.length) return res.status(400).json({ error: "Choose skills from the shared skill list." });
    }
    const links = {};
    if (source.links && typeof source.links === "object" && !Array.isArray(source.links)) {
      for (const [key, value] of Object.entries(source.links).slice(0, 8)) {
        const url = text(value, 500);
        try { if (new URL(url).protocol === "https:") links[text(key, 40)] = url; } catch {}
      }
    }
    const profile = {
      name: text(source.name, 100), headline: text(source.headline, 180), program: text(source.program, 120),
      biography: text(source.biography, 2000), location: text(source.location, 120),
      show_availability: source.show_availability !== false, show_links: source.show_links !== false,
      availability: Array.isArray(source.availability) ? [...new Set(source.availability.map((v) => text(v, 40)).filter((v) => ["internship", "full-time", "contract"].includes(v)))] : [],
      skills, links
    };
    await pool.query("INSERT INTO r2_profiles (user_id, profile) VALUES ($1,$2::jsonb) ON CONFLICT (user_id) DO UPDATE SET profile=EXCLUDED.profile, updated_at=NOW()", [req.userId, JSON.stringify(profile)]);
    res.json({ ok: true, profile });
  }));;

  router.post("/profile/publish", requireOrigin, requireSession, asyncHandler(async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const account = await client.query("SELECT verified_at FROM r2_accounts WHERE user_id=$1 FOR UPDATE", [req.userId]);
      if (!account.rows[0]?.verified_at) { await client.query("ROLLBACK"); return res.status(403).json({ error: "Verify your Algoma email first." }); }
      const profileResult = await client.query("SELECT profile FROM r2_profiles WHERE user_id=$1 FOR UPDATE", [req.userId]);
      const p = profileResult.rows[0]?.profile || {};
      if (!p.name || !p.headline || !p.program) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Add your name, headline, and program before publishing." }); }
      const studentId = "U" + String(req.userId);
      await client.query("INSERT INTO students (id,name,headline,program,biography,location,status,profile_status,availability,links) VALUES ($1,$2,$3,$4,$5,$6,'current','published',$7::jsonb,$8::jsonb) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,headline=EXCLUDED.headline,program=EXCLUDED.program,biography=EXCLUDED.biography,location=EXCLUDED.location,profile_status='published',availability=EXCLUDED.availability,links=EXCLUDED.links", [studentId,p.name,p.headline,p.program,p.biography,p.location,JSON.stringify(p.show_availability === false ? [] : p.availability || []),JSON.stringify(p.show_links === false ? {} : p.links || {})]);
      await client.query("DELETE FROM student_skills WHERE student_id=$1", [studentId]);
      for (const skill of p.skills || []) await client.query("INSERT INTO student_skills (student_id,skill_name) VALUES ($1,$2) ON CONFLICT DO NOTHING", [studentId,skill]);
      await client.query("UPDATE r2_profiles SET published=TRUE, updated_at=NOW() WHERE user_id=$1", [req.userId]);
      await client.query("COMMIT");
      res.json({ ok: true, url: "/student.html?id=" + encodeURIComponent(studentId) });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Profile publish failed:", error.message);
      res.status(500).json({ error: "Could not publish profile." });
    } finally { client.release(); }
  }));;

  router.post("/profile/unpublish", requireOrigin, requireSession, asyncHandler(async (req, res) => {
    const studentId = "U" + String(req.userId);
    await pool.query("UPDATE students SET profile_status='draft' WHERE id=$1", [studentId]);
    await pool.query("UPDATE r2_profiles SET published=FALSE, updated_at=NOW() WHERE user_id=$1", [req.userId]);
    res.json({ ok: true });
  }));;

  return router;
};
