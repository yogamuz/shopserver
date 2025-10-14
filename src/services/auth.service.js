// authservice
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const logger = require("../utils/logger");

// In-memory storage dengan cleanup mechanism
const validRefreshTokens = new Map(); // userId -> Set of valid refresh tokens
const tokenTimestamps = new Map(); // userId -> timestamp
const tokenMetadata = new Map(); // tokenId -> { createdAt, lastUsed, userId, refreshToken }

class AuthService {
  static generateTokens(userId, role) {
    const accessTokenExpiry = role === "admin" ? "2h" : "15m";
    const tokenId = crypto.randomUUID();

    const accessToken = jwt.sign({ userId, role }, process.env.JWT_SECRET, {
      expiresIn: accessTokenExpiry,
    });

    const refreshToken = jwt.sign(
      { userId, tokenId },
      process.env.REFRESH_SECRET,
      { expiresIn: "30d" } // Max absolute expiry
    );

    // Store metadata for sliding expiration
    const now = Date.now();
    tokenMetadata.set(tokenId, {
      createdAt: now,
      lastUsed: now,
      userId: userId,
      refreshToken: refreshToken,
    });

    return { accessToken, refreshToken, tokenId };
  }

  static generateAccessToken(userId, role, expiresIn) {
    // Default expiry based on role if not specified
    if (!expiresIn) {
      expiresIn = role === "admin" ? "2h" : "15m";
    }

    return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn });
  }

  static verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.REFRESH_SECRET);

      // Check sliding expiration
      const metadata = tokenMetadata.get(decoded.tokenId);
      if (!metadata) {
        throw new Error("Token metadata not found");
      }

      const now = Date.now();
      const slidingExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days
      const absoluteExpiry = 30 * 24 * 60 * 60 * 1000; // 30 days

      // Check absolute expiry
      if (now - metadata.createdAt > absoluteExpiry) {
        throw new Error("Refresh token exceeded absolute expiry (30 days)");
      }

      // Check sliding expiry (inactivity)
      if (now - metadata.lastUsed > slidingExpiry) {
        throw new Error("Refresh token expired due to inactivity (7 days)");
      }

      // Update last used time for sliding expiration
      metadata.lastUsed = now;
      tokenMetadata.set(decoded.tokenId, metadata);

      return decoded;
    } catch (error) {
      throw new Error(`Invalid refresh token: ${error.message}`);
    }
  }

  static addRefreshToken(userId, refreshToken, tokenId) {
    if (!validRefreshTokens.has(userId)) {
      validRefreshTokens.set(userId, new Set());
    }

    // Store tokenId instead of full token
    validRefreshTokens.get(userId).add(tokenId);
    tokenTimestamps.set(userId, Date.now());
    logger.info(`Added sliding refresh token for user: ${userId}`);
  }

  static removeUserRefreshTokens(userId) {
    if (validRefreshTokens.has(userId)) {
      const tokenIds = validRefreshTokens.get(userId);

      // Remove metadata for all user tokens
      for (const tokenId of tokenIds) {
        tokenMetadata.delete(tokenId);
      }

      validRefreshTokens.delete(userId);
      tokenTimestamps.delete(userId);
      logger.info(`Removed all sliding refresh tokens for user: ${userId}`);
    }
  }

  static removeRefreshToken(userId, refreshToken) {
    try {
      const decoded = jwt.decode(refreshToken);
      if (!decoded || !decoded.tokenId) return;

      if (validRefreshTokens.has(userId)) {
        validRefreshTokens.get(userId).delete(decoded.tokenId);
        tokenMetadata.delete(decoded.tokenId);

        // Clean up if no tokens left
        if (validRefreshTokens.get(userId).size === 0) {
          validRefreshTokens.delete(userId);
          tokenTimestamps.delete(userId);
        }

        logger.info(`Removed sliding refresh token for user: ${userId}`);
      }
    } catch (error) {
      logger.warn(`Error removing refresh token: ${error.message}`);
    }
  }

  static isValidRefreshToken(userId, refreshToken) {
    try {
      const decoded = jwt.decode(refreshToken);
      if (!decoded || !decoded.tokenId) return false;

      return (
        validRefreshTokens.has(userId) &&
        validRefreshTokens.get(userId).has(decoded.tokenId) &&
        tokenMetadata.has(decoded.tokenId)
      );
    } catch {
      return false;
    }
  }

  static cleanupExpiredTokens() {
    const now = Date.now();
    const slidingExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days
    const absoluteExpiry = 30 * 24 * 60 * 60 * 1000; // 30 days

    let cleanedCount = 0;

    for (const [tokenId, metadata] of tokenMetadata.entries()) {
      const isAbsoluteExpired = now - metadata.createdAt > absoluteExpiry;
      const isSlidingExpired = now - metadata.lastUsed > slidingExpiry;

      if (isAbsoluteExpired || isSlidingExpired) {
        // Remove from user's token set
        if (validRefreshTokens.has(metadata.userId)) {
          validRefreshTokens.get(metadata.userId).delete(tokenId);

          if (validRefreshTokens.get(metadata.userId).size === 0) {
            validRefreshTokens.delete(metadata.userId);
            tokenTimestamps.delete(metadata.userId);
          }
        }

        // Remove metadata
        tokenMetadata.delete(tokenId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired sliding tokens`);
    }
  }

  // **NEW**: Initialize cleanup interval
  static initCleanupScheduler() {
    // Run cleanup every 24 hours
    setInterval(() => {
      this.cleanupExpiredTokens();
    }, 24 * 60 * 60 * 1000);

    logger.info("🔧 Token cleanup scheduler initialized");
  }

  // **NEW**: Get stats for monitoring
  static getTokenStats() {
    return {
      totalUsers: validRefreshTokens.size,
      totalTokens: Array.from(validRefreshTokens.values()).reduce(
        (sum, tokenSet) => sum + tokenSet.size,
        0
      ),
    };
  }
}

// Initialize cleanup scheduler when module loads
AuthService.initCleanupScheduler();

module.exports = AuthService;
