const { pool } = require('../db/db');

async function logAudit(req, action, resource, details) {
  const user = req.user || { id: null, username: 'Anonymous', role: 'anonymous' };
  const logEntry = {
    userId: user.id,
    username: user.username,
    role: user.role,
    action,
    resource,
    details,
    timestamp: new Date().toISOString(),
  };

  // 1. Output structured JSON log to stdout (ideal for log shippers)
  console.log(JSON.stringify({ type: 'AUDIT', ...logEntry }));

  // 2. Persist to PostgreSQL database
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, username, role, action, resource, details, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [logEntry.userId, logEntry.username, logEntry.role, logEntry.action, logEntry.resource, logEntry.details, logEntry.timestamp]
    );
  } catch (err) {
    console.error('Failed to write audit log to database:', err.message);
  }
}

// Middleware to audit sensitive operations on demand
function auditAction(action, resource) {
  return async (req, res, next) => {
    // We capture details from req.params or req.body when the response finishes
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        let details = `Method: ${req.method}, Path: ${req.originalUrl}`;
        if (req.params.id) details += `, ID: ${req.params.id}`;
        if (req.body && Object.keys(req.body).length > 0) {
          // Exclude password and keys for security
          const sanitizedBody = { ...req.body };
          delete sanitizedBody.password;
          delete sanitizedBody.token;
          details += `, Data: ${JSON.stringify(sanitizedBody)}`;
        }
        logAudit(req, action, resource, details);
      }
    });
    next();
  };
}

module.exports = {
  logAudit,
  auditAction,
};
