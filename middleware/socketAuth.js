// middleware/socketAuth.js
const jwt = require('jsonwebtoken');

const socketAuth = (socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    console.error("Socket Auth Error: Token not provided.");
    return next(new Error("Authentication error"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    console.error("Socket Auth Error: Invalid token.");
    return next(new Error("Authentication error"));
  }
};

module.exports = socketAuth;