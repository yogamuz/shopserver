
// ========================================
// FILE: config/cors.js
// ========================================
const getCorsConfig = () => {
  const allowedOrigins = [
    process.env.CLIENT_URL || "http://localhost:3000",
    "http://localhost:5173", // Vite dev server
    "https://localhost:5173", // HTTPS version
    "http://127.0.0.1:5173", // Alternative localhost
    "https://127.0.0.1:5173", // HTTPS alternative
  ];

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