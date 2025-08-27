// ========================================
// FILE: src/services/auditService.js
// ========================================
const AuditLog = require("../models/audit-log.model");
const logger = require("../utils/logger");

class AuditService {
  static getClientIP(req) {
    // Production: Prioritas trust proxy
    if (req.ip && req.app.get('trust proxy')) {
      return req.ip;
    }
    
    // Fallback untuk x-forwarded-for (multiple proxies)
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }
    
    // Alternative proxy headers
    const realIP = req.headers['x-real-ip'];
    if (realIP) {
      return realIP;
    }
    
    // Direct connection fallbacks
    return (
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.connection?.socket?.remoteAddress ||
      'unknown'
    );
  }

  static async logUserActivity(
    userId,
    action,
    ipAddress,
    userAgent = null,
    additionalData = {}
  ) {
    try {
      // Format waktu Indonesia (WIB)
      const actionTime = new Date();
      const indonesiaTime = new Date(actionTime.getTime() + (60 * 1000)); // UTC + 7 untuk WIB
      const formattedTime = indonesiaTime.toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      // Tentukan field waktu berdasarkan action
      const timeField = action === 'LOGIN' ? 'loginTimeIndonesia' : 
                        action === 'LOGOUT' ? 'logoutTimeIndonesia' : 
                        'actionTimeIndonesia';

      const auditLog = new AuditLog({
        userId,
        action,
        ipAddress,
        userAgent,
        timestamp: new Date(),
        additionalData: {
          ...additionalData,
          [timeField]: formattedTime,
          timezone: 'Asia/Jakarta (WIB)'
        },
      });

      await auditLog.save();
      
      // PERUBAHAN: Gunakan logger.audit untuk aktivitas audit
      logger.audit(`User activity logged: ${action}`, {
        userId,
        action,
        ipAddress,
        userAgent,
        formattedTime,
        timezone: 'Asia/Jakarta (WIB)',
        ...additionalData
      });
      
    } catch (error) {
      // TETAP: Gunakan logger.error untuk system errors
      logger.error("Failed to create audit log:", {
        error: error.message,
        stack: error.stack,
        userId,
        action,
        ipAddress
      });
    }
  }
}

module.exports = AuditService;