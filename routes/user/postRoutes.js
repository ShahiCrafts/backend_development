const express = require("express");
const {
  getAllPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  reportPost,
  castPollVote, // <--- Import the new function
  getPollStats, // <--- Import the new function
} = require("../../controllers/users/postController"); // Make sure this path is correct based on your folder structure
const { verifyToken } = require("../../middleware/userAuthorization");
const { uploadPostImage } = require("../../middleware/upload");

const router = express.Router();

// General Post Routes
router.get("/fetch/all", getAllPosts); // Fetches all posts, can be filtered by type (including polls)

router.get("/fetch/:id", getPostById); // Fetches a single post by ID (will include poll stats if it's a poll, as per updated controller)

router.post(
  "/create",
  verifyToken,
  uploadPostImage.array("attachments", 5), // Assuming 'attachments' is the field name for files
  createPost
);

router.put(
  "/update/:id",
  verifyToken,
  updatePost
);

router.delete(
  "/delete/:id",
  verifyToken,
  deletePost
);

router.post("/:id/report", verifyToken, reportPost);

// --- NEW POLL-SPECIFIC ROUTES ---

// Route to cast a vote on a poll
// POST /api/posts/:id/vote
router.post("/:id/vote", verifyToken, castPollVote); // :id is the post ID (which is a poll)

// Route to get detailed poll statistics (if you need a separate endpoint for just stats, though getPostById now handles it for polls)
// GET /api/posts/:id/poll-stats
router.get("/:id/poll-stats", getPollStats); // This can be public as it only fetches data

// --- END NEW POLL-SPECIFIC ROUTES ---

module.exports = router;