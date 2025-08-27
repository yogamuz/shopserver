// middleware/sessionMiddleware.js (untuk backend)
const sessionMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      // JWT Token for authenticated users
      req.token = authHeader.substring(7);
      req.isAuthenticated = true;
    } else if (authHeader.startsWith('Session ')) {
      // Session ID for guest users
      req.sessionId = authHeader.substring(8);
      req.isGuest = true;
    }
  }
  
  next();
};

module.exports = sessionMiddleware;

// Cara penggunaan di app.js atau routes:
// app.use('/api', sessionMiddleware);

// Dalam controller cart:
// const sessionId = req.sessionId || req.user?.id || 'anonymous';