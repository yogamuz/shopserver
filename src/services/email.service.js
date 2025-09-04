// utils/emailService.js
require('dotenv').config();
const { Resend } = require('resend');
const { createResetEmailTemplate, createPasswordChangedNotificationTemplate } = require('../utils/email.helper');

class EmailService {
  /**
   * Initialize Resend dengan API key dari environment variable
   */
  static resend = new Resend(process.env.RESEND_API_KEY);
  static logger = require('../utils/logger');

  /**
   * Informasi sender untuk email
   */
  static senderInfo = {
    name: process.env.SENDER_NAME,
    email: process.env.SENDER_EMAIL,
    supportEmail: process.env.SUPPORT_EMAIL
  };

  /**
   * Kirim email OTP untuk reset password menggunakan Resend API
   * @param {Object} user - User object dengan properties: username, email
   * @param {string} otpCode - 6 digit OTP code
   * @returns {Promise<Object>} Result object dengan method dan messageId
   */
  static async sendPasswordResetOTP(user, otpCode) {
    try {
      EmailService.logger.info(`📧 Preparing to send password reset OTP email to: ${user.email}`);
      
      // Validasi input
      if (!user || !user.email || !user.username) {
        throw new Error('User object must contain email and username');
      }
      
      if (!otpCode || otpCode.length !== 6) {
        throw new Error('OTP code must be 6 digits');
      }
      
      // Validasi API key
      if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY environment variable is required');
      }
      
      // Generate HTML content menggunakan template
      const htmlContent = createResetEmailTemplate(user, otpCode, EmailService.senderInfo);
      
      // Subject email
      const subject = `🔐 Password Reset Code - ${process.env.COMPANY_NAME || 'Shop Cart'}`;
      
      // Email payload
      const emailPayload = {
        from: `${EmailService.senderInfo.name} <${EmailService.senderInfo.email}>`,
        to: [user.email],
        subject: subject,
        html: htmlContent,
        // Text version sebagai fallback
        text: `
          Password Reset Request for ${user.username}
          
          Your verification code is: ${otpCode}
          
          This code will expire in 5 minutes.
          
          If you didn't request this password reset, please ignore this email.
          
          Best regards,
          ${EmailService.senderInfo.name}
        `.trim()
      };
      
      EmailService.logger.info(`📨 Sending email via Resend API...`);
      
      // Kirim email menggunakan Resend
      const response = await EmailService.resend.emails.send(emailPayload);
      
      // Log success
      EmailService.logger.info(`✅ Email sent successfully via Resend:`, {
        messageId: response?.data?.id,
        to: user.email,
        subject: subject
      });
      
      return {
        success: true,
        method: 'resend',
        messageId: response?.data?.id,
        to: user.email,
        subject: subject,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      EmailService.logger.error('❌ Failed to send password reset email:', error);
      
      // Return error object instead of throwing
      return {
        success: false,
        method: 'resend',
        messageId: null,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Kirim notifikasi email ketika password berhasil diubah menggunakan Resend API
   * @param {Object} user - User object dengan properties: username, email
   * @returns {Promise<Object>} Result object dengan method dan messageId
   */
  static async sendPasswordChangedNotification(user) {
    try {
      EmailService.logger.info(`📧 Preparing to send password changed notification to: ${user.email}`);
      
      // Validasi input
      if (!user || !user.email || !user.username) {
        throw new Error('User object must contain email and username');
      }
      
      // Validasi API key
      if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY environment variable is required');
      }
      
      // Generate HTML content menggunakan template
      const htmlContent = createPasswordChangedNotificationTemplate(user, EmailService.senderInfo);
      
      // Subject email
      const subject = `🔒 Password Successfully Changed - ${process.env.COMPANY_NAME || 'Shop Cart'}`;
      
      // Email payload
      const emailPayload = {
        from: `${EmailService.senderInfo.name} <${EmailService.senderInfo.email}>`,
        to: [user.email],
        subject: subject,
        html: htmlContent,
        // Text version sebagai fallback
        text: `
          Password Successfully Changed for ${user.username}
          
          Your ${process.env.COMPANY_NAME || 'Shop Cart'} account password has been successfully changed.
          
          Changed on: ${new Date().toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
          })}
          
          If you didn't make this change, please contact our support team immediately.
          
          For security, you have been logged out from all devices. Please log in again with your new password.
          
          Best regards,
          ${EmailService.senderInfo.name} Security Team
        `.trim()
      };
      
      EmailService.logger.info(`📨 Sending password changed notification via Resend API...`);
      
      // Kirim email menggunakan Resend
      const response = await EmailService.resend.emails.send(emailPayload);
      
      // Log success
      EmailService.logger.info(`✅ Password changed notification sent successfully via Resend:`, {
        messageId: response?.data?.id,
        to: user.email,
        subject: subject
      });
      
      return {
        success: true,
        method: 'resend',
        messageId: response?.data?.id,
        to: user.email,
        subject: subject,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      EmailService.logger.error('❌ Failed to send password changed notification:', error);
      
      // Return error object instead of throwing
      return {
        success: false,
        method: 'resend',
        messageId: null,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Verifikasi konfigurasi email service
   * @returns {Object} Configuration status
   */
  static verifyEmailConfig() {
    const config = {
      hasApiKey: !!process.env.RESEND_API_KEY,
      senderName: EmailService.senderInfo.name,
      senderEmail: EmailService.senderInfo.email,
      supportEmail: EmailService.senderInfo.supportEmail,
      companyName: process.env.COMPANY_NAME || 'Shop Cart'
    };
    
    const isValid = config.hasApiKey && config.senderEmail;
    
    return {
      valid: isValid,
      config: config,
      warnings: [
        !config.hasApiKey && 'RESEND_API_KEY is not set',
        !config.senderEmail && 'SENDER_EMAIL is not configured'
      ].filter(Boolean)
    };
  }

  /**
   * Test email service dengan pengiriman test email (development only)
   * @param {string} testEmail - Email tujuan untuk test
   * @returns {Promise<Object>} Test result
   */
  static async testEmailService(testEmail) {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Test email service only available in development mode');
    }
    
    try {
      const testUser = {
        username: 'Test User',
        email: testEmail
      };
      
      const testOTP = '123456';
      
      const result = await EmailService.sendPasswordResetOTP(testUser, testOTP);
      
      return {
        success: true,
        message: 'Test email sent successfully',
        result: result
      };
      
    } catch (error) {
      return {
        success: false,
        message: 'Test email failed',
        error: error.message || error
      };
    }
  }

  /**
   * Test password changed notification (development only)
   * @param {string} testEmail - Email tujuan untuk test
   * @returns {Promise<Object>} Test result
   */
  static async testPasswordChangedNotification(testEmail) {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Test password changed notification only available in development mode');
    }
    
    try {
      const testUser = {
        username: 'Test User',
        email: testEmail
      };
      
      const result = await EmailService.sendPasswordChangedNotification(testUser);
      
      return {
        success: true,
        message: 'Test password changed notification sent successfully',
        result: result
      };
      
    } catch (error) {
      return {
        success: false,
        message: 'Test password changed notification failed',
        error: error.message || error
      };
    }
  }
}

module.exports = EmailService;