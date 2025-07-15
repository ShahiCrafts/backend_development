const express = require("express");
const router = express.Router();

const messageController = require("../../controllers/users/messageController");
const {
  authorizePersonalConversation,
  authorizeGroupDiscussion,
} = require("../../middleware/chatAuthorization");
const { verifyToken } = require("../../middleware/userAuthorization");

const authorizeConversation = (req, res, next) => {
  const conversationType = req.query.conversationType || req.body.conversationType;
  if (conversationType === "group") {
    return authorizeGroupDiscussion(req, res, next);
  } 
  if (conversationType === "personal") {
    return authorizePersonalConversation(req, res, next);
  }
  return res.status(400).json({ error: "Invalid or missing conversationType" });
};

// --- Route Definitions ---

router.get(
  "/",
  // --- TEMPORARY DEBUGGING MIDDLEWARE ---
  (req, res, next) => {
    console.log("--- DEBUG: Inside GET /api/messages route ---");
    console.log("Headers for this request:", req.headers);
    next(); // Pass control to the next middleware (verifyToken)
  },
  verifyToken,
  authorizeConversation,
  messageController.getMessages
);

router.post("/", verifyToken, authorizeConversation, messageController.sendMessage);
router.delete("/:messageId", verifyToken, messageController.deleteMessage);
router.put("/:messageId", verifyToken, messageController.updateMessage);

module.exports = router;
