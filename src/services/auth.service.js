const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const logger = require("../utils/logger");

// In-memory storage untuk valid refresh tokens
const validRefreshTokens = new Map(); // userId -> Set of valid refresh tokens

class AuthService {
  static generateTokens(userId, role) {
    const accessToken = jwt.sign(
      { userId, role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const refreshToken = jwt.sign(
      { userId, tokenId: crypto.randomUUID() },
      process.env.REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    return { accessToken, refreshToken };
  }

  static generateAccessToken(userId, role, expiresIn = "1h") {
    return jwt.sign(
      { userId, role },
      process.env.JWT_SECRET,
      { expiresIn }
    );
  }

  static verifyRefreshToken(token) {
    try {
      return jwt.verify(token, process.env.REFRESH_SECRET);
    } catch (error) {
      throw new Error(`Invalid refresh token: ${error.message}`);
    }
  }

  static addRefreshToken(userId, refreshToken) {
    if (!validRefreshTokens.has(userId)) {
      validRefreshTokens.set(userId, new Set());
    }
    validRefreshTokens.get(userId).add(refreshToken);
    logger.info(`✅ Added refresh token for user: ${userId}`);
  }

  static removeUserRefreshTokens(userId) {
    if (validRefreshTokens.has(userId)) {
      validRefreshTokens.delete(userId);
      logger.info(`🗑️ Removed all refresh tokens for user: ${userId}`);
    }
  }

  static removeRefreshToken(userId, refreshToken) {
    if (validRefreshTokens.has(userId)) {
      validRefreshTokens.get(userId).delete(refreshToken);
      logger.info(`🗑️ Removed refresh token for user: ${userId}`);
    }
  }

  static isValidRefreshToken(userId, refreshToken) {
    return (
      validRefreshTokens.has(userId) &&
      validRefreshTokens.get(userId).has(refreshToken)
    );
  }
}

module.exports = AuthService;
