const cloudinary = require("cloudinary").v2;
const logger = require("../utils/logger");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Use HTTPS URLs
});

// Verify configuration
const verifyConfig = () => {
  try {
    const { cloud_name, api_key, api_secret } = cloudinary.config();
    
    if (!cloud_name || !api_key || !api_secret) {
      logger.error("❌ Cloudinary configuration missing!");
      return false;
    }
    
    logger.info("✅ Cloudinary configured successfully");
    return true;
  } catch (error) {
    logger.error("❌ Cloudinary configuration error:", error);
    return false;
  }
};

module.exports = { cloudinary, verifyConfig };