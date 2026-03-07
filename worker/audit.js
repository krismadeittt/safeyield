// Audit log helper — logs write operations to D1

export async function logAudit(db, userId, action, resourceType, resourceId, ip) {
  try {
    await db.prepare(
      'INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, ip_address) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      crypto.randomUUID().replace(/-/g, ''),
      userId, action, resourceType, resourceId || null, ip || null
    ).run();
  } catch (e) {
    // Audit logging should never break the request
    console.error('Audit log failed:', e.message);
  }
}
