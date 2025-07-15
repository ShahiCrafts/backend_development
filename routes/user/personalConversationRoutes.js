const express = require("express");
const router = express.Router();

const personalConversationController = require("../../controllers/users/personalConversationController");
const {
  authorizePersonalConversation,
} = require("../../middleware/chatAuthorization");
const { verifyToken } = require("../../middleware/userAuthorization");

// Create or get existing personal conversation between two users
router.post(
  "/",
  verifyToken,
  personalConversationController.createOrGetConversation
);

// Get all personal conversations for a user
router.get(
  "/user/:userId",
  verifyToken,
  personalConversationController.getConversationsForUser
);

// Get a single personal conversation by ID
router.get(
  "/:conversationId",
  verifyToken,
  authorizePersonalConversation,
  personalConversationController.getConversationById
);

// You can add update/delete routes as needed

module.exports = router;
