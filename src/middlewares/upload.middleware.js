// routes/seller/middlewares/upload.middleware.js
const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only file types: jpeg, jpg, png, webp, avif are allowed"), false);
    }
  },
});

const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 5MB",
      });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field. Please use "image" as field name',
      });
    }
  }
  // ✅ UPDATE INI: Match dengan error message di fileFilter
  if (error.message === "Only file types: jpeg, jpg, png, webp, avif are allowed") {
    return res.status(400).json({
      success: false,
      message: "Only file types: jpeg, jpg, png, webp, avif are allowed",
    });
  }
  next(error);
};

module.exports = {
  upload,
  handleMulterError,
};
