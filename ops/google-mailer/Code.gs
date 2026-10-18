// Run setupMailer once, then deploy as a web app executing as you.
function setupMailer() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty("MAILER_SECRET")) {
    properties.setProperty("MAILER_SECRET",
      (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ""));
  }
}

function reply(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return reply({ ok: true, service: "Team 04 verification mailer" });
}

function sameSignature(left, right) {
  if (typeof right !== "string" || left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

function doPost(event) {
  try {
    const raw = event && event.postData && event.postData.contents;
    if (typeof raw !== "string" || raw.length > 8192) {
      return reply({ ok: false, error: "Invalid request." });
    }
    const request = JSON.parse(raw);
    const secret = PropertiesService.getScriptProperties().getProperty("MAILER_SECRET");
    if (!secret || !request || typeof request.payload !== "string" ||
        request.payload.length > 4000) {
      return reply({ ok: false, error: "Unauthorized." });
    }
    const expected = Utilities.base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(request.payload, secret)
    ).replace(/=+$/, "");
    if (!sameSignature(expected, request.signature)) {
      return reply({ ok: false, error: "Unauthorized." });
    }

    const data = JSON.parse(request.payload);
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@,;<>]+@algomau\.ca$/.test(email) ||
        typeof data.code !== "string" || !/^\d{6}$/.test(data.code) ||
        !Number.isInteger(data.ttl_minutes) || data.ttl_minutes < 1 || data.ttl_minutes > 30 ||
        !Number.isInteger(data.timestamp) || Math.abs(Date.now() - data.timestamp) > 300000 ||
        typeof data.request_id !== "string" || !/^[a-f0-9]{32}$/.test(data.request_id)) {
      return reply({ ok: false, error: "Invalid verification request." });
    }

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return reply({ ok: false, error: "Mailer busy." });
    try {
      const cache = CacheService.getScriptCache();
      const key = "sent:" + data.request_id;
      if (cache.get(key)) return reply({ ok: true });
      if (MailApp.getRemainingDailyQuota() < 1) {
        return reply({ ok: false, error: "Daily email quota reached." });
      }
      MailApp.sendEmail({
        to: email,
        subject: "Your Algoma verification code",
        body: "Your one-time verification code is " + data.code +
          ". It expires in " + data.ttl_minutes + " minutes.",
        name: "Team 04 Talent Directory"
      });
      cache.put(key, "sent", 600);
    } finally {
      lock.releaseLock();
    }
    return reply({ ok: true });
  } catch {
    // Never log requests: they contain private verification codes.
    return reply({ ok: false, error: "Could not send verification email." });
  }
}
