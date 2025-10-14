// cloudinary-uploader.util.js
const multer = require("multer");
const sharp = require("sharp");
const crypto = require("crypto");
const { cloudinary } = require("../config/cloudinary");
const logger = require("./logger");

/**
 * Allowed image types
 */
const ALLOWED_TYPES = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  maxSize: 5 * 1024 * 1024, // 5MB
  dimensions: { width: 800, height: 600 },
  quality: 80,
  format: "webp",
  folder: "products",
};

/**
 * Generate unique filename
 */
const generateFileName = (originalName, format = "webp") => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString("hex");
  const ext = format === "jpeg" ? "jpg" : format;
  const name = originalName ? originalName.replace(/\.[^/.]+$/, "") : "image";
  return `${name}-${timestamp}-${random}`;
};

/**
 * Validate image file
 */
const validateImage = (file, config = {}) => {
  const { maxSize = DEFAULT_CONFIG.maxSize } = config;

  if (!file) {
    return { valid: false, message: "No file provided" };
  }

  if (!file.buffer) {
    return { valid: false, message: "Invalid file data" };
  }

  if (!ALLOWED_TYPES[file.mimetype]) {
    return {
      valid: false,
      message: "Invalid file type. Allowed: JPG, PNG, WebP, GIF",
    };
  }

  if (file.size > maxSize) {
    const maxSizeMB = Math.round(maxSize / (1024 * 1024));
    return {
      valid: false,
      message: `File too large. Maximum size: ${maxSizeMB}MB`,
    };
  }

  return { valid: true };
};

/**
 * Process image with Sharp
 */
const processImage = async (buffer, config = {}) => {
  try {
    const {
      dimensions = DEFAULT_CONFIG.dimensions,
      quality = DEFAULT_CONFIG.quality,
      format = DEFAULT_CONFIG.format,
    } = config;

    let sharpInstance = sharp(buffer);

    // Get image metadata
    const metadata = await sharpInstance.metadata();

    // Resize if dimensions specified
    if (dimensions.width || dimensions.height) {
      sharpInstance = sharpInstance.resize(
        dimensions.width,
        dimensions.height,
        {
          fit: "inside",
          withoutEnlargement: true,
        }
      );
    }

    // Apply format and quality
    switch (format) {
      case "jpeg":
      case "jpg":
        sharpInstance = sharpInstance.jpeg({ quality, progressive: true });
        break;
      case "png":
        sharpInstance = sharpInstance.png({
          compressionLevel: 6,
          progressive: true,
        });
        break;
      case "webp":
        sharpInstance = sharpInstance.webp({ quality, effort: 4 });
        break;
      default:
        sharpInstance = sharpInstance.webp({ quality, effort: 4 });
    }

    const processedBuffer = await sharpInstance.toBuffer();

    return {
      success: true,
      buffer: processedBuffer,
      metadata: {
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        originalSize: buffer.length,
        processedSize: processedBuffer.length,
        format: format,
      },
    };
  } catch (error) {
    logger.error("Image processing error:", error);
    return {
      success: false,
      message: "Failed to process image",
      error: error.message,
    };
  }
};

/**
 * Upload image to Cloudinary
 */
const uploadToCloudinary = async (buffer, options = {}) => {
  try {
    const {
      folder = "products",
      fileName,
      format = "webp",
      quality = "auto",
    } = options;

    return new Promise((resolve, reject) => {
      const uploadOptions = {
        folder: folder,
        public_id: fileName,
        format: format,
        quality: quality,
        resource_type: "image",
        transformation: [
          {
            width: options.width || 800,
            height: options.height || 600,
            crop: "limit",
            quality: "auto:good",
            fetch_format: "auto",
          }
        ],
      };

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            logger.error("Cloudinary upload error:", error);
            reject(error);
          } else {
            resolve(result);
          }
        }
      );

      uploadStream.end(buffer);
    });
  } catch (error) {
    logger.error("Cloudinary upload setup error:", error);
    throw error;
  }
};

/**
 * Main upload function - REVISED FOR CLOUDINARY
 */
const uploadImage = async (file, config = {}) => {
  try {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };

    // Validate file
    const validation = validateImage(file, fullConfig);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.message,
      };
    }

    // Process image
    const processResult = await processImage(file.buffer, fullConfig);
    if (!processResult.success) {
      return processResult;
    }

    // Generate filename
    const fileName = generateFileName(file.originalname, fullConfig.format);

    // Upload to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(processResult.buffer, {
      folder: fullConfig.folder,
      fileName: fileName,
      format: fullConfig.format,
      width: fullConfig.dimensions.width,
      height: fullConfig.dimensions.height,
    });

    logger.info(`✅ Image uploaded to Cloudinary: ${fileName}`);
    logger.info(`🔗 Image URL: ${cloudinaryResult.secure_url}`);

    return {
      success: true,
      imageUrl: cloudinaryResult.secure_url,
      publicId: cloudinaryResult.public_id,
      fileName: fileName,
      cloudinaryData: {
        asset_id: cloudinaryResult.asset_id,
        public_id: cloudinaryResult.public_id,
        version: cloudinaryResult.version,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        format: cloudinaryResult.format,
        resource_type: cloudinaryResult.resource_type,
        bytes: cloudinaryResult.bytes,
        url: cloudinaryResult.url,
        secure_url: cloudinaryResult.secure_url,
      },
      metadata: processResult.metadata,
    };
  } catch (error) {
    logger.error("Upload image error:", error);
    return {
      success: false,
      message: "Failed to upload image to Cloudinary",
      error: error.message,
    };
  }
};

/**
 * Upload multiple images
 */
const uploadMultipleImages = async (files, config = {}) => {
  try {
    if (!Array.isArray(files)) {
      return {
        success: false,
        message: "Files must be an array",
      };
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const result = await uploadImage(file, {
        ...config,
        folder: config.folder
          ? `${config.folder}/multi-${i}`
          : `${DEFAULT_CONFIG.folder}/multi-${i}`,
      });

      if (result.success) {
        results.push(result);
      } else {
        errors.push({ index: i, ...result });
      }
    }

    return {
      success: errors.length === 0,
      results,
      errors,
      uploadedCount: results.length,
      totalCount: files.length,
    };
  } catch (error) {
    logger.error("Upload multiple images error:", error);
    return {
      success: false,
      message: "Failed to upload images to Cloudinary",
      error: error.message,
    };
  }
};

/**
 * Delete image from Cloudinary
 */
const deleteImage = async (publicIdOrUrl) => {
  try {
    if (!publicIdOrUrl) {
      return { success: false, message: "No public ID or URL provided" };
    }

    let publicId = publicIdOrUrl;

    // If it's a URL, extract the public ID
    if (publicIdOrUrl.includes('cloudinary.com')) {
      // Extract public ID from Cloudinary URL
      const urlParts = publicIdOrUrl.split('/');
      const uploadIndex = urlParts.findIndex(part => part === 'upload');
      if (uploadIndex !== -1 && uploadIndex < urlParts.length - 1) {
        // Get everything after /upload/ and remove file extension
        const pathAfterUpload = urlParts.slice(uploadIndex + 1).join('/');
        // Remove version and transformations, keep folder/filename
        const cleanPath = pathAfterUpload.replace(/^v\d+\//, '');
        publicId = cleanPath.replace(/\.[^/.]+$/, ''); // Remove extension
      }
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image"
    });

    if (result.result === 'ok') {
      logger.info(`🗑️ Image deleted from Cloudinary: ${publicId}`);
      return { success: true, message: "Image deleted successfully", result };
    } else {
      logger.warn(`⚠️ Image deletion result: ${result.result} for ${publicId}`);
      return { 
        success: result.result === 'not found' ? true : false, 
        message: result.result === 'not found' ? "Image already deleted or not found" : `Deletion failed: ${result.result}`,
        result 
      };
    }
  } catch (error) {
    logger.error("Delete image error:", error);
    return {
      success: false,
      message: "Failed to delete image from Cloudinary",
      error: error.message,
    };
  }
};

/**
 * Get image info from Cloudinary
 */
const getImageInfo = async (publicIdOrUrl) => {
  try {
    if (!publicIdOrUrl) {
      return { success: false, message: "No public ID or URL provided" };
    }

    let publicId = publicIdOrUrl;

    // If it's a URL, extract the public ID (same logic as deleteImage)
    if (publicIdOrUrl.includes('cloudinary.com')) {
      const urlParts = publicIdOrUrl.split('/');
      const uploadIndex = urlParts.findIndex(part => part === 'upload');
      if (uploadIndex !== -1 && uploadIndex < urlParts.length - 1) {
        const pathAfterUpload = urlParts.slice(uploadIndex + 1).join('/');
        const cleanPath = pathAfterUpload.replace(/^v\d+\//, '');
        publicId = cleanPath.replace(/\.[^/.]+$/, '');
      }
    }

    const result = await cloudinary.api.resource(publicId, {
      resource_type: "image"
    });

    return {
      success: true,
      info: {
        public_id: result.public_id,
        asset_id: result.asset_id,
        format: result.format,
        resource_type: result.resource_type,
        type: result.type,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        url: result.url,
        secure_url: result.secure_url,
        created_at: result.created_at,
        uploaded_at: result.uploaded_at,
        folder: result.folder,
      },
    };
  } catch (error) {
    logger.error("Get image info error:", error);
    return {
      success: false,
      message: "Failed to get image info from Cloudinary",
      error: error.message,
    };
  }
};

/**
 * Create multer upload middleware
 */
const createUploadMiddleware = (config = {}) => {
  const { maxSize = DEFAULT_CONFIG.maxSize } = config;

  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize },
    fileFilter: (req, file, cb) => {
      if (ALLOWED_TYPES[file.mimetype]) {
        cb(null, true);
      } else {
        cb(new Error("Invalid file type. Allowed: JPG, PNG, WebP, GIF"), false);
      }
    },
  });
};

module.exports = {
  uploadImage,
  uploadMultipleImages,
  deleteImage,
  getImageInfo,
  validateImage,
  processImage,
  createUploadMiddleware,
  ALLOWED_TYPES,
  DEFAULT_CONFIG,
};