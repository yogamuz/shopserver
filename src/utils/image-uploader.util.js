const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const sharp = require("sharp");
const crypto = require("crypto");
const logger = require("./logger"); // Assuming you have a logger utility
/**
 * Allowed image types
 */
const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
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
 * Create upload directory if it doesn't exist
 */
const ensureUploadDir = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch (error) {
    await fs.mkdir(dirPath, { recursive: true });
  }
};

/**
 * Generate unique filename
 */
const generateFileName = (originalName, format = "webp") => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString("hex");
  const ext = format === "jpeg" ? "jpg" : format;
  return `${timestamp}-${random}.${ext}`;
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
 * Save processed image to disk
 */
const saveImage = async (buffer, filePath) => {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await ensureUploadDir(dir);

    // Save file
    await fs.writeFile(filePath, buffer);

    return { success: true, filePath };
  } catch (error) {
    logger.error("Save image error:", error);
    return {
      success: false,
      message: "Failed to save image",
      error: error.message,
    };
  }
};

/**
 * Main upload function - FIXED URL generation
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

    // Generate filename and path
    const fileName = generateFileName(file.originalname, fullConfig.format);
    const relativePath = path.join(fullConfig.folder, fileName);
    const absolutePath = path.join(process.cwd(), "public", relativePath);

    // Save image
    const saveResult = await saveImage(processResult.buffer, absolutePath);
    if (!saveResult.success) {
      return saveResult;
    }

    // ✅ FIXED: Generate URL without /public/ prefix since express.static serves from 'public' folder
    // ✅ FIXED: Generate correct URL path that matches express.static serving
    const baseUrl = process.env.BASE_URL || "https://shopcartserver-production.up.railway.app";
    // Remove any leading slash and ensure forward slashes
    const cleanPath = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    const imageUrl = `${baseUrl}/${cleanPath}`;

    logger.info(`✅ Image uploaded successfully: ${fileName}`);
    logger.info(`🔗 Image URL: ${imageUrl}`);
    logger.info(`📁 File saved to: ${absolutePath}`);

    return {
      success: true,
      imageUrl,
      fileName,
      filePath: absolutePath,
      metadata: processResult.metadata,
    };
  } catch (error) {
    logger.error("Upload image error:", error);
    return {
      success: false,
      message: "Failed to upload image",
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
          ? `${config.folder}/${i}`
          : `${DEFAULT_CONFIG.folder}/${i}`,
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
      message: "Failed to upload images",
      error: error.message,
    };
  }
};

/**
 * Delete image file
 */
const deleteImage = async (imageUrl) => {
  try {
    if (!imageUrl) {
      return { success: false, message: "No image URL provided" };
    }

    // Extract file path from URL
    const url = new URL(imageUrl);
    const relativePath = url.pathname.startsWith("/")
      ? url.pathname.substring(1)
      : url.pathname;
    const absolutePath = path.join(process.cwd(), "public", relativePath);

    // Check if file exists and delete
    try {
      await fs.access(absolutePath);
      await fs.unlink(absolutePath);
      logger.info(`🗑️ Image deleted: ${relativePath}`);
      return { success: true, message: "Image deleted successfully" };
    } catch (error) {
      if (error.code === "ENOENT") {
        return { success: true, message: "Image already deleted or not found" };
      }
      throw error;
    }
  } catch (error) {
    logger.error("Delete image error:", error);
    return {
      success: false,
      message: "Failed to delete image",
      error: error.message,
    };
  }
};

/**
 * Get image info
 */
const getImageInfo = async (imageUrl) => {
  try {
    if (!imageUrl) {
      return { success: false, message: "No image URL provided" };
    }

    const url = new URL(imageUrl);
    const relativePath = url.pathname.startsWith("/")
      ? url.pathname.substring(1)
      : url.pathname;
    const absolutePath = path.join(process.cwd(), "public", relativePath);

    const stats = await fs.stat(absolutePath);
    const buffer = await fs.readFile(absolutePath);
    const metadata = await sharp(buffer).metadata();

    return {
      success: true,
      info: {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        channels: metadata.channels,
        hasAlpha: metadata.hasAlpha,
      },
    };
  } catch (error) {
    logger.error("Get image info error:", error);
    return {
      success: false,
      message: "Failed to get image info",
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
