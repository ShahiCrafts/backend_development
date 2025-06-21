/**
 * @file Entry point for the Civic Engagement Backend API.
 * Initializes the Express server, connects to MongoDB, and sets up global middleware and routes.
 */

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/database");
// const errorHandler = require('./middleware/errorHandler');

// Load environment variables from .env
dotenv.config();

/**
 * Connect to MongoDB using Mongoose.
 * Exits the process if the connection fails.
 */
connectDB();

// Initialize the Express application
const app = express();

/**
 * Enable Cross-Origin Resource Sharing for all incoming requests.
 * @see https://expressjs.com/en/resources/middleware/cors.html
 */
app.use(cors());

/**
 * Middleware to parse incoming JSON requests.
 * Automatically populates req.body with parsed content.
 */
app.use(express.json());

/**
 * Mount authentication-related routes (e.g., login, signup, verification).
 * Base path: /auth
 */
app.use("/api/auth", require("./routes/user/authRoutes"));

/**
 * Mount admin-only user management routes.
 * Base path: /api/admin/users
 * Requires authentication and admin role authorization.
 */
app.use("/api/admin/users", require("./routes/admin/userRoutes"));

/**
 * Mount admin-only announcement management routes.
 * Base path: /api/admin/announcements
 * Requires authentication and admin role authorization.
 */
app.use(
  "/api/admin/announcements",
  require("./routes/admin/announcementRoutes")
);
app.use("/api/admin/events", require("./routes/admin/eventRoutes"));

/**
 * Global error handler to catch and process all unhandled errors.
 * Should be registered after all routes.
 */
// app.use(errorHandler);

/**
 * Health check / welcome route.
 * Can be used to verify that the server is running.
 * @route GET /
 * @returns {string} Basic welcome message
 */
app.get("/", (req, res) => {
  res.send("Civic Engagement API is running on port 8080");
});

/**
 * Start the Express server on the configured port.
 * @constant {number} PORT - Port number from environment or default 8080
 */
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
