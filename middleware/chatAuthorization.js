const GroupDiscussion = require('../models/groupDiscusssionModel');
const PersonalConversation = require('../models/personalConversationModel');
const mongoose = require('mongoose');

function findConversationId(req) {
  if (req.params.discussionId) return req.params.discussionId;
  if (req.params.conversationId) return req.params.conversationId;
  if (req.body && req.body.conversationId) return req.body.conversationId;
  if (req.query.conversationId) return req.query.conversationId;
  return null;
}

async function authorizeGroupDiscussion(req, res, next) {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    console.log("User ID from token:", userId);
    const discussionId = findConversationId(req);
    console.log("Discussion ID:", discussionId);

    if (!mongoose.Types.ObjectId.isValid(discussionId)) {
      return res.status(400).json({ error: "Invalid or missing discussionId for authorization." });
    }
    const discussion = await GroupDiscussion.findById(discussionId);
    console.log("Discussion found:", discussion);

    if (!discussion) return res.status(404).json({ error: "Group discussion not found." });

    console.log("Discussion participants:", discussion.participants);

    const isParticipant = discussion.participants.some(p => p && p.toString() === userId.toString());
    console.log("Is participant:", isParticipant);

    if (!isParticipant) {
      return res.status(403).json({ error: "Not authorized to access this discussion." });
    }
    next();
  } catch (error) {
    console.error("Authorization error:", error);
    res.status(500).json({ error: "Server error during authorization." });
  }
}


async function authorizePersonalConversation(req, res, next) {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const conversationId = findConversationId(req);

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: "Invalid or missing conversationId for authorization." });
    }
    const conversation = await PersonalConversation.findById(conversationId);
    
    if (!conversation) return res.status(404).json({ error: "Personal conversation not found." });

    const isParticipant = conversation.participants.some(p => p && p.toString() === userId.toString());
    if (!isParticipant) {
      return res.status(403).json({ error: "Not authorized to access this conversation." });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: "Server error during authorization." });
  }
}

module.exports = { authorizeGroupDiscussion, authorizePersonalConversation };
