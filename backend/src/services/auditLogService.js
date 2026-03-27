const { AuditLog } = require("../models");
const { encrypt } = require("../utils/encryption");

class AuditLogService {
  /**
   * Create an audit log entry
   */
  static async logAction({
    userId,
    action,
    entityType,
    entityId,
    oldValues,
    newValues,
    ipAddress,
    userAgent,
    justification = "SYSTEM_ACTION", // Default justification
  }) {
    try {
      // CNPD Requirement: Separation of duties.
      // If the log contains sensitive data, encrypt the values payload.
      const safeOldValues = oldValues
        ? encrypt(JSON.stringify(oldValues))
        : null;
      const safeNewValues = newValues
        ? encrypt(JSON.stringify(newValues))
        : null;

      const logEntry = await AuditLog.create({
        userId,
        action,
        entityType,
        entityId,
        oldValues: safeOldValues ? { encrypted: safeOldValues } : null,
        newValues: safeNewValues ? { encrypted: safeNewValues } : null,
        ipAddress,
        userAgent,
        metadata: {
          complianceStandard: "CNPD-58/2019",
          justification: justification,
          timestamp: new Date().toISOString(),
        },
      });
      return logEntry;
    } catch (error) {
      console.error("Failed to create audit log:", error);
      // In a strict CNPD environment, if audit fails, the action might need to rollback.
      // For this demo, we allow it to proceed but log the failure to stderr.
      return null;
    }
  }

  /**
   * Get audit logs for a specific user
   */
  static async getUserAuditLogs(userId) {
    return await AuditLog.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });
  }

  /**
   * Get audit logs for a specific entity
   */
  static async getEntityAuditLogs(entityType, entityId) {
    return await AuditLog.findAll({
      where: { entityType, entityId },
      order: [["createdAt", "DESC"]],
    });
  }

  /**
   * Get all audit logs (for admin purposes)
   */
  static async getAllAuditLogs() {
    return await AuditLog.findAll({
      order: [["createdAt", "DESC"]],
    });
  }
}

module.exports = AuditLogService;
