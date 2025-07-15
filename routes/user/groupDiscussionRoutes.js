const express = require("express");
const router = express.Router();

const groupDiscussionController = require("../../controllers/users/groupDiscussionController");
const {
  authorizeGroupDiscussion,
} = require("../../middleware/chatAuthorization");
const { verifyToken } = require("../../middleware/userAuthorization");

// Create a new group discussion
router.post(
  "/",
  verifyToken,
  groupDiscussionController.createOrGetGroupDiscussion
);

// Get all group discussions (optional filtering)
router.get(
  "/",
  verifyToken,
  groupDiscussionController.getGroupDiscussions
);

// Get single group discussion by ID
router.get(
  "/:discussionId",
  verifyToken,
  groupDiscussionController.getGroupDiscussionById
);

// Update group discussion (e.g., add/remove participants, update description)
router.put(
  "/:discussionId",
  verifyToken,
  groupDiscussionController.updateGroupDiscussion
);

// You can add delete or other routes as needed

module.exports = router;
