'use strict';
const crypto = require('node:crypto');

const SECRET_KEYS = /secret|token|password|cookie|authorization|api[_-]?key|code_hash|verification/i;

function sanitize(value, depth = 0) {
  if (depth > 3) return '[truncated]';
  if (value == null) return value;
  if (typeof value === 'string') {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
      .replace(/r2_session=[^;\s]+/gi, 'r2_session=[redacted]')
      .slice(0, 400);
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEYS.test(k) ? '[redacted]' : sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

function attachRequestId(req, res, next) {
  req.requestId = crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

function logDiagnostic(level, event, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitize(context),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  return entry;
}

module.exports = { attachRequestId, logDiagnostic, sanitize };
