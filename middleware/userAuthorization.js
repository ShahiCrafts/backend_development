const jwt = require('jsonwebtoken');

/**
 * Middleware to verify JWT token from the Authorization header.
 * This version includes detailed error logging.
 */
const verifyToken = (req, res, next) => {
  // Log the incoming request to see which route is being processed.
  console.log(`--- Verifying Token for: ${req.method} ${req.originalUrl} ---`);
  
  const authHeader = req.headers['authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error("verifyToken Error: No token or malformed header found.");
    return res.status(401).json({ error: 'No token provided or header is malformed.' });
  }

  const token = authHeader.split(' ')[1];

  // Verify the token
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    // --- FIX IS HERE ---
    // If there is an error, log it to the console before sending a response.
    if (err) {
      console.error("--- JWT VERIFICATION FAILED ---");
      console.error("Error Details:", err);
      console.error("-----------------------------");
      // Send a 401 Unauthorized status, as the token is not valid for this request.
      return res.status(401).json({ error: 'Token is not valid.', details: err.message });
    }
    
    // If verification is successful, attach the user payload and proceed.
    req.user = user;
    next();
  });
};

module.exports = { verifyToken };
