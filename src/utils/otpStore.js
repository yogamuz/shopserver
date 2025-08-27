// utils/otpStore.js
const crypto = require('crypto');
const logger = require('./logger');


// In-memory storage untuk OTP codes
const otpStorage = new Map(); // email -> { otp, expiresAt, attempts }

/**
 * Generate OTP code 6 digit menggunakan crypto
 * @param {number} length - Panjang OTP (default: 6)
 * @returns {string} OTP code
 */
const generateOTP = (length = 6) => {
  const digits = '0123456789';
  let otp = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, digits.length);
    otp += digits[randomIndex];
  }
  
  return otp;
};

/**
 * Simpan OTP code untuk email tertentu
 * @param {string} email - Email user
 * @param {number} expiryMinutes - Expiry dalam menit (default: 5)
 * @returns {string} Generated OTP code
 */
const storeOTP = (email, expiryMinutes = 5) => {
  const otp = generateOTP(6);
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
  
  // Simpan atau update OTP untuk email ini
  otpStorage.set(email.toLowerCase(), {
    otp,
    expiresAt,
    attempts: 0,
    createdAt: new Date()
  });
  
 logger.info(`🔑 OTP stored for ${email}: ${otp} (expires: ${expiresAt.toISOString()})`);
  
  return otp;
};

/**
 * Validasi OTP code
 * @param {string} email - Email user
 * @param {string} otpCode - OTP code yang diinput user
 * @returns {Object} { valid: boolean, message: string, attemptsLeft?: number }
 */
const validateOTP = (email, otpCode) => {
  const normalizedEmail = email.toLowerCase();
  const storedData = otpStorage.get(normalizedEmail);
  
  // Cek apakah OTP exists
  if (!storedData) {
    return {
      valid: false,
      message: 'OTP not found. Please request a new one.'
    };
  }
  
  // Cek apakah expired
  if (new Date() > storedData.expiresAt) {
    // Hapus OTP yang expired
    otpStorage.delete(normalizedEmail);
    return {
      valid: false,
      message: 'OTP has expired. Please request a new one.'
    };
  }
  
  // Increment attempts
  storedData.attempts += 1;
  
  // Cek maximum attempts (5 attempts)
  const maxAttempts = 5;
  if (storedData.attempts > maxAttempts) {
    // Hapus OTP setelah terlalu banyak attempts
    otpStorage.delete(normalizedEmail);
    return {
      valid: false,
      message: 'Too many failed attempts. Please request a new OTP.'
    };
  }
  
  // Validasi OTP code
  if (storedData.otp !== otpCode) {
    const attemptsLeft = maxAttempts - storedData.attempts;
    return {
      valid: false,
      message: `Invalid OTP code. ${attemptsLeft} attempts remaining.`,
      attemptsLeft
    };
  }
  
  // OTP valid - hapus dari storage
  otpStorage.delete(normalizedEmail);
 logger.info(`✅ OTP validated successfully for ${email}`);
  
  return {
    valid: true,
    message: 'OTP validation successful'
  };
};

/**
 * Hapus OTP untuk email tertentu
 * @param {string} email - Email user
 * @returns {boolean} True jika berhasil dihapus
 */
const removeOTP = (email) => {
  const normalizedEmail = email.toLowerCase();
  const deleted = otpStorage.delete(normalizedEmail);
  
  if (deleted) {
   logger.info(`🗑️  OTP removed for ${email}`);
  }
  
  return deleted;
};

/**
 * Cek apakah OTP masih valid untuk email tertentu
 * @param {string} email - Email user
 * @returns {Object} { exists: boolean, expiresAt?: Date, attemptsUsed?: number }
 */
const checkOTPStatus = (email) => {
  const normalizedEmail = email.toLowerCase();
  const storedData = otpStorage.get(normalizedEmail);
  
  if (!storedData) {
    return { exists: false };
  }
  
  const isExpired = new Date() > storedData.expiresAt;
  
  return {
    exists: true,
    expired: isExpired,
    expiresAt: storedData.expiresAt,
    attemptsUsed: storedData.attempts,
    createdAt: storedData.createdAt
  };
};

/**
 * Cleanup expired OTPs (untuk maintenance)
 * @returns {number} Jumlah OTP yang dihapus
 */
const cleanupExpiredOTPs = () => {
  const now = new Date();
  let cleanedCount = 0;
  
  for (const [email, data] of otpStorage.entries()) {
    if (now > data.expiresAt) {
      otpStorage.delete(email);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
   logger.info(`🧹 Cleaned up ${cleanedCount} expired OTPs`);
  }
  
  return cleanedCount;
};

/**
 * Get statistics untuk debugging (development only)
 * @returns {Object} Statistics object
 */
const getOTPStats = () => {
  if (process.env.NODE_ENV !== 'development') {
    return { message: 'Stats only available in development mode' };
  }
  
  const stats = {
    totalOTPs: otpStorage.size,
    otps: []
  };
  
  for (const [email, data] of otpStorage.entries()) {
    const isExpired = new Date() > data.expiresAt;
    stats.otps.push({
      email: email.replace(/(.{2})(.*)(@.*)/, '$1***$3'), // Mask email
      expired: isExpired,
      attempts: data.attempts,
      timeRemaining: isExpired ? 0 : Math.max(0, data.expiresAt - new Date()) / 1000
    });
  }
  
  return stats;
};

// Auto cleanup setiap 10 menit
if (process.env.NODE_ENV !== 'test') {
  setInterval(cleanupExpiredOTPs, 10 * 60 * 1000);
}

module.exports = {
  generateOTP,
  storeOTP,
  validateOTP,
  removeOTP,
  checkOTPStatus,
  cleanupExpiredOTPs,
  getOTPStats
};