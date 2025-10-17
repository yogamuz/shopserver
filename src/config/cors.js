// ========================================
// FILE: config/cors.js
// ========================================
const getCorsConfig = () => {
  // Buat array untuk menampung semua origin yang diizinkan
  const allowedOrigins = [
    process.env.CLIENT_URL,        // URL production/deployed
    process.env.CLIENT_URL_LOCAL,  // URL localhost
  ].filter(Boolean); // Remove undefined/null values

  return {
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      // Allow semua localhost untuk development
      if (process.env.NODE_ENV !== "production") {
        if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
          return callback(null, true);
        }
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log("CORS blocked origin:", origin); // Debug log
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
      "x-session-id",
      "X-CSRF-Token",
      "Cache-Control",
      "Pragma",
    ],
    exposedHeaders: ["X-CSRF-Token", "Set-Cookie"],
    preflightContinue: false,
    optionsSuccessStatus: 200,
  };
};

module.exports = { getCorsConfig };