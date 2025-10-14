// Di email.helper.js
const createResetEmailTemplate = (user, verificationCode, senderInfo) => {
  const companyName = process.env.COMPANY_NAME;
  const companyLogo = process.env.COMPANY_LOGO_URL;
  const companyWebsite = process.env.COMPANY_WEBSITE;
  const supportContact = senderInfo.supportEmail;

return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset - ${companyName}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background-color: #f7f9fc;
            font-family: 'Inter', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
        }
        
        .email-container {
            max-width: 600px;
            margin: 30px auto;
            background-color: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
        }
        
        .email-header {
            background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%);
            padding: 35px 30px;
            text-align: center;
            color: white;
            position: relative;
        }
        
        .email-header::after {
            content: '';
            position: absolute;
            bottom: -20px;
            left: 0;
            right: 0;
            height: 20px;
            background-color: #ffffff;
            border-top-left-radius: 20px;
            border-top-right-radius: 20px;
        }
        
        .logo {
            max-height: 60px;
            margin-bottom: 15px;
            display: inline-block;
        }
        
        .company-name {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 5px;
        }
        
        .email-subtitle {
            color: rgba(255, 255, 255, 0.9);
            font-size: 16px;
            font-weight: 400;
        }
        
        .email-content {
            padding: 40px 35px;
        }
        
        .greeting {
            font-size: 24px;
            font-weight: 600;
            color: #1F2937;
            margin-bottom: 25px;
        }
        
        .message {
            font-size: 16px;
            color: #4B5563;
            margin-bottom: 30px;
            line-height: 1.7;
        }
        
        .code-container {
            background: linear-gradient(135deg, #10B981 0%, #059669 100%);
            padding: 35px 20px;
            text-align: center;
            margin: 35px 0;
            border-radius: 16px;
            position: relative;
            overflow: hidden;
        }
        
        .code-container::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
            transform: rotate(30deg);
        }
        
        .code-label {
            color: white;
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 15px;
            position: relative;
        }
        
        .verification-code {
            background-color: rgba(255, 255, 255, 0.15);
            padding: 22px 25px;
            border-radius: 12px;
            display: inline-block;
            backdrop-filter: blur(5px);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .code {
            color: white;
            font-size: 42px;
            font-weight: 700;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .info-box {
            background-color: #FFFBEB;
            border-left: 4px solid #F59E0B;
            padding: 25px;
            margin: 30px 0;
            border-radius: 12px;
            display: flex;
            align-items: flex-start;
        }
        
        .info-icon {
            font-size: 24px;
            margin-right: 15px;
            flex-shrink: 0;
        }
        
        .info-content h3 {
            color: #92400E;
            font-weight: 600;
            margin-bottom: 8px;
            font-size: 18px;
        }
        
        .info-content p {
            color: #92400E;
            margin: 0;
        }
        
        .security-box {
            background-color: #EFF6FF;
            border-left: 4px solid #3B82F6;
            padding: 25px;
            margin: 30px 0;
            border-radius: 12px;
        }
        
        .security-box h3 {
            color: #1E40AF;
            font-weight: 600;
            margin-bottom: 15px;
            font-size: 18px;
        }
        
        .security-list {
            color: #1E40AF;
            padding-left: 20px;
        }
        
        .security-list li {
            margin-bottom: 8px;
        }
        
        .no-request {
            background-color: #F9FAFB;
            padding: 25px;
            border-radius: 12px;
            text-align: center;
            margin: 30px 0;
            border: 1px solid #E5E7EB;
        }
        
        .no-request p {
            color: #6B7280;
            margin: 0;
            font-size: 16px;
        }
        
        .no-request a {
            color: #4F46E5;
            text-decoration: none;
            font-weight: 500;
        }
        
        .closing {
            font-size: 16px;
            color: #4B5563;
            margin-top: 35px;
        }
        
        .email-footer {
            background-color: #1F2937;
            color: white;
            padding: 35px 30px;
            text-align: center;
        }
        
        .footer-company {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 20px;
        }
        
        .footer-links {
            margin: 25px 0;
        }
        
        .footer-links a {
            color: #93C5FD;
            text-decoration: none;
            margin: 0 12px;
            font-weight: 500;
        }
        
        .footer-divider {
            border: none;
            border-top: 1px solid #374151;
            margin: 25px 0;
        }
        
        .footer-disclaimer {
            color: #9CA3AF;
            font-size: 13px;
            line-height: 1.5;
        }
        
        .footer-address {
            color: #6B7280;
            font-size: 12px;
            margin-top: 15px;
        }
        
        @media (max-width: 650px) {
            .email-container {
                margin: 15px;
                border-radius: 12px;
            }
            
            .email-content {
                padding: 30px 25px;
            }
            
            .code {
                font-size: 32px;
                letter-spacing: 5px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="email-header">
            <img src="${companyLogo}" alt="${companyName}" class="logo">
            <h1 class="company-name">${companyName}</h1>
            <p class="email-subtitle">Password Reset Request</p>
        </div>
        
        <!-- Content -->
        <div class="email-content">
            <h2 class="greeting">Hello ${user.username}! 👋</h2>
            
            <p class="message">
                We received a request to reset the password for your ${companyName} account. 
                To proceed with resetting your password, please use the verification code below:
            </p>
            
            <!-- Verification Code Box -->
            <div class="code-container">
                <p class="code-label">🔐 Your Verification Code</p>
                <div class="verification-code">
                    <span class="code">${verificationCode}</span>
                </div>
            </div>
            
            <!-- Warning Box -->
            <div class="info-box">
                <span class="info-icon">⚠️</span>
                <div class="info-content">
                    <h3>Important Security Notice</h3>
                    <p>This verification code will expire in <strong>5 minutes</strong>. Please use it immediately to reset your password.</p>
                </div>
            </div>
            
            <!-- Security Tips -->
            <div class="security-box">
                <h3>🔒 Security Reminders</h3>
                <ul class="security-list">
                    <li>Never share this verification code with anyone</li>
                    <li>Our team will never ask for this code via phone, email, or social media</li>
                    <li>This code can only be used once</li>
                    <li>If you didn't request this reset, please contact us immediately</li>
                </ul>
            </div>
            
            <!-- Didn't Request Box -->
            <div class="no-request">
                <p>
                    <strong>Didn't request this password reset?</strong><br>
                    Your account is still secure. You can safely ignore this email, 
                    or <a href="mailto:${supportContact}">contact our support team</a> if you have concerns.
                </p>
            </div>
            
            <p class="closing">
                Need help? Our support team is here to assist you 24/7.<br><br>
                Best regards,<br>
                <strong>The ${companyName} Security Team</strong>
            </p>
        </div>
        
        <!-- Footer -->
        <div class="email-footer">
            <p class="footer-company">${companyName}</p>
            
            <div class="footer-links">
                <a href="${companyWebsite}">🌐 Visit Website</a>
                <a href="mailto:${supportContact}">📧 Contact Support</a>
            </div>
            
            <hr class="footer-divider">
            
            <p class="footer-disclaimer">
                This is an automated security message. Please do not reply to this email.<br>
                © ${new Date().getFullYear()} ${companyName}. All rights reserved.
            </p>
            
            <p class="footer-address">
                This email was sent to ${user.email} for account security purposes.
            </p>
        </div>
    </div>
</body>
</html>
`
};

// Template konfirmasi password berhasil direset
const createPasswordChangedNotificationTemplate = (user, senderInfo) => {
  const companyName = process.env.COMPANY_NAME;
  const companyLogo = process.env.COMPANY_LOGO_URL;
  const companyWebsite = process.env.CLIENT_URL;
  const supportContact = senderInfo.supportEmail;
  const resetTime = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Successfully Changed - ${companyName}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background-color: #f7f9fc;
            font-family: 'Inter', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
        }
        
        .email-container {
            max-width: 600px;
            margin: 30px auto;
            background-color: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
        }
        
        .email-header {
            background: linear-gradient(135deg, #10B981 0%, #059669 100%);
            padding: 35px 30px;
            text-align: center;
            color: white;
            position: relative;
        }
        
        .email-header::after {
            content: '';
            position: absolute;
            bottom: -20px;
            left: 0;
            right: 0;
            height: 20px;
            background-color: #ffffff;
            border-top-left-radius: 20px;
            border-top-right-radius: 20px;
        }
        
        .logo {
            max-height: 60px;
            margin-bottom: 15px;
            display: inline-block;
        }
        
        .company-name {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 5px;
        }
        
        .email-subtitle {
            color: rgba(255, 255, 255, 0.9);
            font-size: 16px;
            font-weight: 400;
        }
        
        .email-content {
            padding: 40px 35px;
        }
        
        .success-banner {
            background: linear-gradient(135deg, #10B981 0%, #34D399 100%);
            padding: 35px 25px;
            text-align: center;
            margin-bottom: 35px;
            border-radius: 16px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 10px 15px rgba(16, 185, 129, 0.2);
        }
        
        .success-banner::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%);
            transform: rotate(30deg);
        }
        
        .success-icon {
            font-size: 60px;
            margin-bottom: 15px;
            display: block;
            position: relative;
            z-index: 1;
        }
        
        .success-title {
            color: white;
            margin: 0;
            font-size: 26px;
            font-weight: 700;
            position: relative;
            z-index: 1;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .greeting {
            font-size: 24px;
            font-weight: 600;
            color: #1F2937;
            margin-bottom: 20px;
        }
        
        .message {
            font-size: 16px;
            color: #4B5563;
            margin-bottom: 30px;
            line-height: 1.7;
        }
        
        .details-box {
            background-color: #F0FDF4;
            border-left: 4px solid #10B981;
            padding: 25px;
            margin: 30px 0;
            border-radius: 12px;
        }
        
        .details-box h3 {
            color: #065F46;
            font-weight: 600;
            margin-bottom: 15px;
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .detail-item {
            display: flex;
            margin-bottom: 12px;
            color: #065F46;
        }
        
        .detail-label {
            font-weight: 600;
            min-width: 100px;
        }
        
        .status-success {
            color: #10B981;
            font-weight: 600;
        }
        
        .security-box {
            background-color: #EFF6FF;
            border-left: 4px solid #3B82F6;
            padding: 25px;
            margin: 30px 0;
            border-radius: 12px;
        }
        
        .security-box h3 {
            color: #1E40AF;
            font-weight: 600;
            margin-bottom: 15px;
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .security-list {
            color: #1E40AF;
            padding-left: 20px;
        }
        
        .security-list li {
            margin-bottom: 10px;
            line-height: 1.5;
        }
        
        .warning-box {
            background-color: #FFFBEB;
            border-left: 4px solid #F59E0B;
            padding: 25px;
            margin: 30px 0;
            border-radius: 12px;
            display: flex;
            align-items: flex-start;
        }
        
        .warning-icon {
            font-size: 24px;
            margin-right: 15px;
            flex-shrink: 0;
        }
        
        .warning-content h3 {
            color: #92400E;
            font-weight: 600;
            margin-bottom: 8px;
            font-size: 18px;
        }
        
        .warning-content p {
            color: #92400E;
            margin: 0;
        }
        
        .warning-content a {
            color: #92400E;
            font-weight: 600;
            text-decoration: underline;
        }
        
        .next-steps {
            background-color: #ECFDF5;
            border-left: 4px solid #10B981;
            padding: 25px;
            margin: 30px 0;
            border-radius: 12px;
        }
        
        .next-steps h3 {
            color: #065F46;
            font-weight: 600;
            margin-bottom: 15px;
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .steps-list {
            color: #065F46;
            padding-left: 20px;
            margin-bottom: 25px;
        }
        
        .steps-list li {
            margin-bottom: 12px;
            line-height: 1.5;
        }
        
        .login-button {
            display: block;
            background: linear-gradient(135deg, #10B981 0%, #059669 100%);
            color: white;
            padding: 14px 30px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            text-align: center;
            margin: 0 auto;
            width: fit-content;
            transition: all 0.3s ease;
            box-shadow: 0 4px 6px rgba(16, 185, 129, 0.2);
        }
        
        .login-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 12px rgba(16, 185, 129, 0.3);
        }
        
        .closing {
            font-size: 16px;
            color: #4B5563;
            margin-top: 35px;
        }
        
        .email-footer {
            background-color: #1F2937;
            color: white;
            padding: 35px 30px;
            text-align: center;
        }
        
        .footer-company {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 20px;
        }
        
        .footer-links {
            margin: 25px 0;
        }
        
        .footer-links a {
            color: #93C5FD;
            text-decoration: none;
            margin: 0 12px;
            font-weight: 500;
        }
        
        .footer-divider {
            border: none;
            border-top: 1px solid #374151;
            margin: 25px 0;
        }
        
        .footer-disclaimer {
            color: #9CA3AF;
            font-size: 13px;
            line-height: 1.5;
        }
        
        .footer-address {
            color: #6B7280;
            font-size: 12px;
            margin-top: 15px;
        }
        
        @media (max-width: 650px) {
            .email-container {
                margin: 15px;
                border-radius: 12px;
            }
            
            .email-content {
                padding: 30px 25px;
            }
            
            .success-banner {
                padding: 25px 20px;
            }
            
            .success-title {
                font-size: 22px;
            }
            
            .detail-item {
                flex-direction: column;
                margin-bottom: 15px;
            }
            
            .detail-label {
                margin-bottom: 3px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="email-header">
            <img src="${companyLogo}" alt="${companyName}" class="logo">
            <h1 class="company-name">${companyName}</h1>
            <p class="email-subtitle">Password Successfully Changed</p>
        </div>
        
        <!-- Content -->
        <div class="email-content">
            <!-- Success Banner -->
            <div class="success-banner">
                <span class="success-icon">✅</span>
                <h2 class="success-title">Password Changed Successfully!</h2>
            </div>

            <h2 class="greeting">Hello ${user.username}! 👋</h2>
            
            <p class="message">
                We're writing to confirm that your ${companyName} account password has been successfully changed.
            </p>

            <!-- Details Box -->
            <div class="details-box">
                <h3>📋 Change Details</h3>
                <div class="detail-item">
                    <span class="detail-label">Account:</span>
                    <span>${user.email}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Changed on:</span>
                    <span>${resetTime}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Status:</span>
                    <span class="status-success">✓ Successful</span>
                </div>
            </div>
            
            <!-- Security Info -->
            <div class="security-box">
                <h3>🔒 What This Means for Your Security</h3>
                <ul class="security-list">
                    <li>Your account password has been updated</li>
                    <li>You have been logged out from all devices for security</li>
                    <li>Please log in again with your new password</li>
                    <li>Your account remains fully secure</li>
                </ul>
            </div>

            <!-- Warning Box -->
            <div class="warning-box">
                <span class="warning-icon">⚠️</span>
                <div class="warning-content">
                    <h3>Didn't Change Your Password?</h3>
                    <p>
                        If you didn't request this password change, your account may have been compromised. 
                        <a href="mailto:${supportContact}">Contact our support team immediately</a>.
                    </p>
                </div>
            </div>

            <!-- Next Steps -->
            <div class="next-steps">
                <h3>🚀 Next Steps</h3>
                <ol class="steps-list">
                    <li>Log in to your account with your new password</li>
                    <li>Update any saved passwords in your password manager</li>
                    <li>Consider enabling two-factor authentication for extra security</li>
                </ol>
                <a href="${companyWebsite}" class="login-button">Login to Your Account</a>
            </div>
            
            <p class="closing">
                If you have any questions or need assistance, our support team is available 24/7.<br><br>
                Best regards,<br>
                <strong>The ${companyName} Security Team</strong>
            </p>
        </div>
        
        <!-- Footer -->
        <div class="email-footer">
            <p class="footer-company">${companyName}</p>
            
            <div class="footer-links">
                <a href="${companyWebsite}">🌐 Visit Website</a>
                <a href="mailto:${supportContact}">📧 Contact Support</a>
            </div>
            
            <hr class="footer-divider">
            
            <p class="footer-disclaimer">
                This is an automated security notification. Please do not reply to this email.<br>
                © ${new Date().getFullYear()} ${companyName}. All rights reserved.
            </p>
            
            <p class="footer-address">
                This email was sent to ${user.email} for account security purposes.
            </p>
        </div>
    </div>
</body>
</html>
`


};

// Template notifikasi upgrade ke seller
const createSellerUpgradeNotificationTemplate = (user, sellerProfile, senderInfo) => {
  const companyName = process.env.COMPANY_NAME;
  const companyLogo = process.env.COMPANY_LOGO_URL;
  const companyWebsite = process.env.CLIENT_URL;
  const supportContact = senderInfo.supportEmail;
  const upgradeTime = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to ${companyName} Sellers - ${sellerProfile.shopName}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background-color: #f7f9fc;
            font-family: 'Inter', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
        }
        
        .email-container {
            max-width: 600px;
            margin: 30px auto;
            background-color: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
        }
        
        .email-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 35px 30px;
            text-align: center;
            color: white;
            position: relative;
        }
        
        .email-header::after {
            content: '';
            position: absolute;
            bottom: -20px;
            left: 0;
            right: 0;
            height: 20px;
            background-color: #ffffff;
            border-top-left-radius: 20px;
            border-top-right-radius: 20px;
        }
        
        .logo {
            max-height: 60px;
            margin-bottom: 15px;
            display: inline-block;
        }
        
        .company-name {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 5px;
        }
        
        .email-subtitle {
            color: rgba(255, 255, 255, 0.9);
            font-size: 16px;
            font-weight: 400;
        }
        
        .email-content {
            padding: 40px 35px;
        }
        
        .welcome-banner {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 35px 25px;
            text-align: center;
            margin-bottom: 35px;
            border-radius: 16px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 10px 15px rgba(102, 126, 234, 0.2);
        }
        
        .welcome-banner::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%);
            transform: rotate(30deg);
        }
        
        .welcome-icon {
            font-size: 60px;
            margin-bottom: 15px;
            display: block;
            position: relative;
            z-index: 1;
        }
        
        .welcome-title {
            color: white;
            margin: 0;
            font-size: 26px;
            font-weight: 700;
            position: relative;
            z-index: 1;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .greeting {
            font-size: 24px;
            font-weight: 600;
            color: #1F2937;
            margin-bottom: 20px;
        }
        
        .message {
            font-size: 16px;
            color: #4B5563;
            margin-bottom: 30px;
            line-height: 1.7;
        }
        
        .shop-details-box {
            background: linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%);
            border-left: 4px solid #667eea;
            padding: 25px;
            margin: 30px 0;
            border-radius: 12px;
        }
        
        .shop-details-box h3 {
            color: #1E40AF;
            font-weight: 600;
            margin-bottom: 15px;
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .detail-item {
            display: flex;
            margin-bottom: 12px;
            color: #1E3A8A;
        }
        
        .detail-label {
            font-weight: 600;
            min-width: 140px;
        }
        
        .badge {
            display: inline-block;
            background: #10B981;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
        }
        
        .next-steps-box {
            background-color: #ECFDF5;
            border-left: 4px solid #10B981;
            padding: 25px;
            margin: 30px 0;
            border-radius: 12px;
        }
        
        .next-steps-box h3 {
            color: #065F46;
            font-weight: 600;
            margin-bottom: 15px;
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .steps-list {
            color: #065F46;
            padding-left: 20px;
            margin-bottom: 20px;
        }
        
        .steps-list li {
            margin-bottom: 12px;
            line-height: 1.5;
        }
        
        .steps-list strong {
            color: #047857;
        }
        
        .dashboard-button {
            display: block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 14px 30px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            text-align: center;
            margin: 25px auto 0;
            width: fit-content;
            transition: all 0.3s ease;
            box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);
        }
        
        .dashboard-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 12px rgba(102, 126, 234, 0.4);
        }
        
        .tip-box {
            background-color: #FFFBEB;
            border-left: 4px solid #F59E0B;
            padding: 25px;
            margin: 30px 0;
            border-radius: 12px;
            display: flex;
            align-items: flex-start;
        }
        
        .tip-icon {
            font-size: 24px;
            margin-right: 15px;
            flex-shrink: 0;
        }
        
        .tip-content h3 {
            color: #92400E;
            font-weight: 600;
            margin-bottom: 8px;
            font-size: 16px;
        }
        
        .tip-content p {
            color: #92400E;
            margin: 0;
            line-height: 1.6;
        }
        
        .benefits-box {
            background-color: #F9FAFB;
            padding: 25px;
            margin: 30px 0;
            border-radius: 12px;
            border: 1px solid #E5E7EB;
        }
        
        .benefits-box h3 {
            color: #1F2937;
            font-weight: 600;
            margin-bottom: 15px;
            font-size: 18px;
        }
        
        .benefits-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        
        .benefit-item {
            display: flex;
            align-items: flex-start;
            gap: 10px;
        }
        
        .benefit-icon {
            font-size: 20px;
            flex-shrink: 0;
        }
        
        .benefit-text {
            color: #4B5563;
            font-size: 14px;
        }
        
        .closing {
            font-size: 16px;
            color: #4B5563;
            margin-top: 35px;
        }
        
        .email-footer {
            background-color: #1F2937;
            color: white;
            padding: 35px 30px;
            text-align: center;
        }
        
        .footer-company {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 20px;
        }
        
        .footer-links {
            margin: 25px 0;
        }
        
        .footer-links a {
            color: #93C5FD;
            text-decoration: none;
            margin: 0 12px;
            font-weight: 500;
        }
        
        .footer-divider {
            border: none;
            border-top: 1px solid #374151;
            margin: 25px 0;
        }
        
        .footer-disclaimer {
            color: #9CA3AF;
            font-size: 13px;
            line-height: 1.5;
        }
        
        .footer-address {
            color: #6B7280;
            font-size: 12px;
            margin-top: 15px;
        }
        
        @media (max-width: 650px) {
            .email-container {
                margin: 15px;
                border-radius: 12px;
            }
            
            .email-content {
                padding: 30px 25px;
            }
            
            .welcome-banner {
                padding: 25px 20px;
            }
            
            .welcome-title {
                font-size: 22px;
            }
            
            .detail-item {
                flex-direction: column;
                margin-bottom: 15px;
            }
            
            .detail-label {
                margin-bottom: 3px;
            }
            
            .benefits-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="email-header">
            <img src="${companyLogo}" alt="${companyName}" class="logo">
            <h1 class="company-name">${companyName}</h1>
            <p class="email-subtitle">Seller Account Activated</p>
        </div>
        
        <!-- Content -->
        <div class="email-content">
            <!-- Welcome Banner -->
            <div class="welcome-banner">
                <span class="welcome-icon">🎉</span>
                <h2 class="welcome-title">Welcome to ${companyName} Sellers!</h2>
            </div>

            <h2 class="greeting">Hello ${user.username}! 👋</h2>
            
            <p class="message">
                Congratulations! Your account has been successfully upgraded to a <strong>Seller Account</strong>. 
                You can now start selling your products on ${companyName} and reach thousands of customers.
            </p>

            <!-- Shop Details Box -->
            <div class="shop-details-box">
                <h3>📦 Your Shop Details</h3>
                <div class="detail-item">
                    <span class="detail-label">Shop Name:</span>
                    <span><strong>${sellerProfile.shopName}</strong></span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Business Type:</span>
                    <span>${sellerProfile.businessType || 'Not specified'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Account Status:</span>
                    <span><span class="badge">✓ Active</span></span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Activated on:</span>
                    <span>${upgradeTime}</span>
                </div>
            </div>

            <!-- Benefits Box -->
            <div class="benefits-box">
                <h3>✨ Seller Benefits</h3>
                <div class="benefits-grid">
                    <div class="benefit-item">
                        <span class="benefit-icon">🛍️</span>
                        <span class="benefit-text">Sell unlimited products</span>
                    </div>
                    <div class="benefit-item">
                        <span class="benefit-icon">📊</span>
                        <span class="benefit-text">Access sales analytics</span>
                    </div>
                    <div class="benefit-item">
                        <span class="benefit-icon">💰</span>
                        <span class="benefit-text">Secure payment system</span>
                    </div>
                    <div class="benefit-item">
                        <span class="benefit-icon">🚀</span>
                        <span class="benefit-text">Marketing tools</span>
                    </div>
                    <div class="benefit-item">
                        <span class="benefit-icon">📦</span>
                        <span class="benefit-text">Order management</span>
                    </div>
                    <div class="benefit-item">
                        <span class="benefit-icon">💬</span>
                        <span class="benefit-text">Customer messaging</span>
                    </div>
                </div>
            </div>
            
            <!-- Next Steps -->
            <div class="next-steps-box">
                <h3>🚀 Get Started - Next Steps</h3>
                <ol class="steps-list">
                    <li><strong>Complete your shop profile</strong> - Add shop description, logo, and banner image</li>
                    <li><strong>Add your first product</strong> - Upload product images, descriptions, and set pricing</li>
                    <li><strong>Set up payment methods</strong> - Configure how you want to receive payments</li>
                    <li><strong>Review seller guidelines</strong> - Familiarize yourself with our policies and best practices</li>
                    <li><strong>Start promoting</strong> - Share your shop link and attract customers</li>
                </ol>
                <a href="${companyWebsite}/seller/dashboard" class="dashboard-button">
                    🎯 Go to Seller Dashboard
                </a>
            </div>

            <!-- Tip Box -->
            <div class="tip-box">
                <span class="tip-icon">💡</span>
                <div class="tip-content">
                    <h3>Pro Tip</h3>
                    <p>
                        Complete your shop profile within 7 days to increase customer trust and improve your visibility in search results. 
                        Shops with complete profiles get 3x more views!
                    </p>
                </div>
            </div>
            
            <p class="closing">
                Need help getting started? Check out our <a href="${companyWebsite}/seller/guide" style="color: #667eea; text-decoration: none; font-weight: 600;">Seller Guide</a> 
                or contact our support team at <a href="mailto:${supportContact}" style="color: #667eea; text-decoration: none; font-weight: 600;">${supportContact}</a>.<br><br>
                We're excited to have you as part of our seller community!<br><br>
                Best regards,<br>
                <strong>The ${companyName} Team</strong>
            </p>
        </div>
        
        <!-- Footer -->
        <div class="email-footer">
            <p class="footer-company">${companyName} Sellers</p>
            
            <div class="footer-links">
                <a href="${companyWebsite}/seller/dashboard">🏪 Seller Dashboard</a>
                <a href="${companyWebsite}/seller/guide">📚 Seller Guide</a>
                <a href="mailto:${supportContact}">📧 Support</a>
            </div>
            
            <hr class="footer-divider">
            
            <p class="footer-disclaimer">
                This is an automated notification. Please do not reply to this email.<br>
                © ${new Date().getFullYear()} ${companyName}. All rights reserved.
            </p>
            
            <p class="footer-address">
                This email was sent to ${user.email} regarding your seller account activation.
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
  createSellerUpgradeNotificationTemplate
};
