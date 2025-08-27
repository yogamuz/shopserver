// utils/emailTemplates.js

const createResetEmailTemplate = (user, verificationCode, senderInfo) => {
  const companyName = process.env.COMPANY_NAME
  const companyLogo = process.env.COMPANY_LOGO_URL
const companyWebsite = process.env.COMPANY_WEBSITE 
  const supportContact = senderInfo.supportEmail;

  return`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset - ${companyName}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 0;">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #007bff, #0056b3); padding: 30px; text-align: center;">
                <img src="${companyLogo}" alt="${companyName}" style="max-height: 60px; margin-bottom: 10px;">
                <h1 style="color: white; margin: 0; font-size: 28px;">${companyName}</h1>
                <p style="color: #e3f2fd; margin: 5px 0 0 0; font-size: 16px;">Password Reset Request</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 40px 30px;">
                <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${
                  user.username
                }! 👋</h2>
                
                <p style="font-size: 16px; line-height: 1.6; color: #555;">
                    We received a request to reset the password for your ${companyName} account. 
                    To proceed with resetting your password, please use the verification code below:
                </p>
                
                <!-- Verification Code Box -->
                <div style="background: linear-gradient(135deg, #28a745, #20c997); 
                           padding: 30px; text-align: center; margin: 30px 0; 
                           border-radius: 15px; border: 3px solid #1e7e34;">
                    <p style="color: white; margin: 0 0 15px 0; font-size: 16px; font-weight: bold;">
                        🔐 Your Verification Code
                    </p>
                    <div style="background-color: rgba(255,255,255,0.2); 
                               padding: 20px; border-radius: 10px; display: inline-block;">
                        <span style="color: white; font-size: 42px; font-weight: bold; 
                                    letter-spacing: 10px; font-family: 'Courier New', monospace;">
                            ${verificationCode}
                        </span>
                    </div>
                </div>
                
                <!-- Warning Box -->
                <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; 
                           padding: 20px; margin: 25px 0; border-radius: 5px;">
                    <div style="display: flex; align-items: center;">
                        <span style="font-size: 24px; margin-right: 15px;">⚠️</span>
                        <div>
                            <p style="margin: 0; color: #856404; font-weight: bold;">Important Security Notice</p>
                            <p style="margin: 5px 0 0 0; color: #856404;">
                                This verification code will expire in <strong>5 minutes</strong>. 
                                Please use it immediately to reset your password.
                            </p>
                        </div>
                    </div>
                </div>
                
                <!-- Security Tips -->
                <div style="background-color: #e7f3ff; border-left: 4px solid #007bff; 
                           padding: 20px; margin: 25px 0; border-radius: 5px;">
                    <h3 style="color: #0056b3; margin: 0 0 15px 0; font-size: 18px;">
                        🔒 Security Reminders
                    </h3>
                    <ul style="color: #0056b3; margin: 0; padding-left: 20px; line-height: 1.6;">
                        <li>Never share this verification code with anyone</li>
                        <li>Our team will never ask for this code via phone, email, or social media</li>
                        <li>This code can only be used once</li>
                        <li>If you didn't request this reset, please contact us immediately</li>
                    </ul>
                </div>
                
                <!-- Didn't Request Box -->
                <div style="background-color: #f8f9fa; padding: 20px; 
                           border-radius: 5px; text-align: center; margin: 30px 0;">
                    <p style="margin: 0; color: #6c757d; font-size: 16px;">
                        <strong>Didn't request this password reset?</strong><br>
                        Your account is still secure. You can safely ignore this email, 
                        or <a href="mailto:${supportContact}" style="color: #007bff; text-decoration: none;">
                        contact our support team</a> if you have concerns.
                    </p>
                </div>
                
                <p style="font-size: 16px; color: #555; margin-top: 30px;">
                    Need help? Our support team is here to assist you 24/7.
                </p>
                
                <p style="font-size: 16px; color: #555;">
                    Best regards,<br>
                    <strong>The ${companyName} Security Team</strong>
                </p>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #2c3e50; color: white; padding: 30px; text-align: center;">
                <p style="margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">${companyName}</p>
                
                <div style="margin: 20px 0;">
                    <a href="${companyWebsite}" style="color: #3498db; text-decoration: none; margin: 0 10px;">
                        🌐 Visit Website
                    </a>
                    <a href="mailto:${supportContact}" style="color: #3498db; text-decoration: none; margin: 0 10px;">
                        📧 Contact Support
                    </a>
                </div>
                
                <hr style="border: none; border-top: 1px solid #34495e; margin: 20px 0;">
                
                <p style="color: #95a5a6; font-size: 12px; margin: 0;">
                    This is an automated security message. Please do not reply to this email.<br>
                    © ${new Date().getFullYear()} ${companyName}. All rights reserved.
                </p>
                
                <p style="color: #7f8c8d; font-size: 11px; margin: 15px 0 0 0;">
                    This email was sent to ${
                      user.email
                    } for account security purposes.
                </p>
            </div>
        </div>
    </body>
    </html>
  `;
};

// Template konfirmasi password berhasil direset
const createPasswordChangedNotificationTemplate = (user, senderInfo) => {
  const companyName = process.env.COMPANY_NAME || "Shop Cart";
  const companyLogo = process.env.COMPANY_LOGO_URL || "https://via.placeholder.com/200x60/007bff/ffffff?text=SHOP+CART";
  const companyWebsite = process.env.CLIENT_URL || "http://localhost:5173";
  const supportContact = senderInfo.supportEmail;
  const resetTime = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Successfully Changed - ${companyName}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 0;">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #28a745, #20c997); padding: 30px; text-align: center;">
                <img src="${companyLogo}" alt="${companyName}" style="max-height: 60px; margin-bottom: 10px;">
                <h1 style="color: white; margin: 0; font-size: 28px;">${companyName}</h1>
                <p style="color: #d4edda; margin: 5px 0 0 0; font-size: 16px;">Password Successfully Changed</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 40px 30px;">
                <!-- Success Banner -->
                <div style="background: linear-gradient(135deg, #28a745, #34ce57); 
                           padding: 25px; text-align: center; margin-bottom: 30px; 
                           border-radius: 15px; border: 2px solid #1e7e34;">
                    <div style="color: white; font-size: 48px; margin-bottom: 15px;">✅</div>
                    <h2 style="color: white; margin: 0; font-size: 24px;">Password Changed Successfully!</h2>
                </div>

                <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${user.username}! 👋</h2>
                
                <p style="font-size: 16px; line-height: 1.6; color: #555;">
                    We're writing to confirm that your ${companyName} account password has been successfully changed.
                </p>

                <!-- Details Box -->
                <div style="background-color: #f8f9fa; border-left: 4px solid #28a745; 
                           padding: 20px; margin: 25px 0; border-radius: 5px;">
                    <h3 style="color: #155724; margin: 0 0 15px 0; font-size: 18px;">
                        📋 Change Details
                    </h3>
                    <p style="margin: 5px 0; color: #155724;"><strong>Account:</strong> ${user.email}</p>
                    <p style="margin: 5px 0; color: #155724;"><strong>Changed on:</strong> ${resetTime}</p>
                    <p style="margin: 5px 0; color: #155724;"><strong>Status:</strong> <span style="color: #28a745;">✓ Successful</span></p>
                </div>
                
                <!-- Security Info -->
                <div style="background-color: #e7f3ff; border-left: 4px solid #007bff; 
                           padding: 20px; margin: 25px 0; border-radius: 5px;">
                    <h3 style="color: #0056b3; margin: 0 0 15px 0; font-size: 18px;">
                        🔒 What This Means for Your Security
                    </h3>
                    <ul style="color: #0056b3; margin: 0; padding-left: 20px; line-height: 1.6;">
                        <li>Your account password has been updated</li>
                        <li>You have been logged out from all devices for security</li>
                        <li>Please log in again with your new password</li>
                        <li>Your account remains fully secure</li>
                    </ul>
                </div>

                <!-- Warning Box -->
                <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; 
                           padding: 20px; margin: 25px 0; border-radius: 5px;">
                    <div style="display: flex; align-items: center;">
                        <span style="font-size: 24px; margin-right: 15px;">⚠️</span>
                        <div>
                            <p style="margin: 0; color: #856404; font-weight: bold;">Didn't Change Your Password?</p>
                            <p style="margin: 5px 0 0 0; color: #856404;">
                                If you didn't request this password change, your account may have been compromised. 
                                <a href="mailto:${supportContact}" style="color: #856404; font-weight: bold;">
                                Contact our support team immediately</a>.
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Next Steps -->
                <div style="background-color: #d1ecf1; border-left: 4px solid #17a2b8; 
                           padding: 20px; margin: 25px 0; border-radius: 5px;">
                    <h3 style="color: #0c5460; margin: 0 0 15px 0; font-size: 18px;">
                        🚀 Next Steps
                    </h3>
                    <ol style="color: #0c5460; margin: 0; padding-left: 20px; line-height: 1.6;">
                        <li>Log in to your account with your new password</li>
                        <li>Update any saved passwords in your password manager</li>
                        <li>Consider enabling two-factor authentication for extra security</li>
                    </ol>
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="${companyWebsite}" 
                           style="background-color: #17a2b8; color: white; padding: 12px 30px; 
                                  text-decoration: none; border-radius: 5px; font-weight: bold;">
                            Login to Your Account
                        </a>
                    </div>
                </div>
                
                <p style="font-size: 16px; color: #555; margin-top: 30px;">
                    If you have any questions or need assistance, our support team is available 24/7.
                </p>
                
                <p style="font-size: 16px; color: #555;">
                    Best regards,<br>
                    <strong>The ${companyName} Security Team</strong>
                </p>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #2c3e50; color: white; padding: 30px; text-align: center;">
                <p style="margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">${companyName}</p>
                
                <div style="margin: 20px 0;">
                    <a href="${companyWebsite}" style="color: #3498db; text-decoration: none; margin: 0 10px;">
                        🌐 Visit Website
                    </a>
                    <a href="mailto:${supportContact}" style="color: #3498db; text-decoration: none; margin: 0 10px;">
                        📧 Contact Support
                    </a>
                </div>
                
                <hr style="border: none; border-top: 1px solid #34495e; margin: 20px 0;">
                
                <p style="color: #95a5a6; font-size: 12px; margin: 0;">
                    This is an automated security notification. Please do not reply to this email.<br>
                    © ${new Date().getFullYear()} ${companyName}. All rights reserved.
                </p>
                
                <p style="color: #7f8c8d; font-size: 11px; margin: 15px 0 0 0;">
                    This email was sent to ${user.email} for account security purposes.
                </p>
            </div>
        </div>
    </body>
    </html>
  `;
};

module.exports = {
  createResetEmailTemplate,
  createPasswordChangedNotificationTemplate,
};