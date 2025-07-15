// controllers/personalConversationController.js

const PersonalConversation = require("../../models/personalConversationModel");
const Message = require("../../models/messageModel");
const mongoose = require("mongoose");

/**
 * Create or get existing personal conversation between two users
 */
exports.createOrGetConversation = async (req, res) => {
  try {
    const { userIds } = req.body; // expects array of exactly 2 userIds
    if (!userIds || !Array.isArray(userIds) || userIds.length !== 2) {
      return res.status(400).json({ error: "Two userIds required" });
    }

    // Check if a conversation between these two users exists
    let conversation = await PersonalConversation.findOne({
      participants: { $all: userIds, $size: 2 },
    });

    if (!conversation) {
      conversation = new PersonalConversation({ participants: userIds });
      await conversation.save();
    }

    res.json(conversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Get all personal conversations for a given user
 * Includes last message preview
 */
exports.getConversationsForUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    // Find all personal conversations with this user
    const conversations = await PersonalConversation.find({
      participants: userId,
    }).sort({ updatedAt: -1 });

    // Populate last message for each conversation
    const convosWithLastMessage = await Promise.all(
      conversations.map(async (convo) => {
        const lastMsg = await Message.findOne({
          conversationId: convo._id,
          conversationType: "personal",
        })
          .sort({ createdAt: -1 })
          .lean();

        return {
          ...convo.toObject(),
          lastMessage: lastMsg || null,
        };
      })
    );

    res.json(convosWithLastMessage);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Get a single personal conversation details by ID
 */
exports.getConversationById = async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: "Invalid conversationId" });
    }

    const conversation = await PersonalConversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json(conversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
};
