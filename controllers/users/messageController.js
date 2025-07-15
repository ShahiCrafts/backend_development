// controllers/messageController.js
const mongoose = require('mongoose');
const Message = require('../../models/messageModel');
const GroupDiscussion = require('../../models/groupDiscusssionModel');
const PersonalConversation = require('../../models/personalConversationModel');

/**
 * Helper function to check if a user is a participant in a conversation.
 * @param {string} conversationType - "group" or "personal".
 * @param {mongoose.Types.ObjectId} conversationId - The ID of the conversation.
 * @param {mongoose.Types.ObjectId} userId - The ID of the user.
 * @returns {Promise<boolean>} - True if the user is a participant, otherwise false.
 */
async function isUserParticipant(conversationType, conversationId, userId) {
    if (!mongoose.Types.ObjectId.isValid(conversationId) || !mongoose.Types.ObjectId.isValid(userId)) {
        return false;
    }

    let conversation;
    if (conversationType === "group") {
        conversation = await GroupDiscussion.findById(conversationId).lean();
    } else if (conversationType === "personal") {
        conversation = await PersonalConversation.findById(conversationId).lean();
    } else {
        return false;
    }

    if (!conversation) {
        return false;
    }

    return conversation.participants.some(participantId => participantId.equals(userId));
}

// ----------------------------------------------------------------------------------

/**
 * @desc    Get all messages for a specific conversation with pagination.
 * @route   GET /api/messages
 * @access  Private (User must be a participant)
 */
const getMessages = async (req, res) => {
    try {
        const { conversationType, conversationId } = req.query;
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized: User not authenticated." });
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 30;

        if (!conversationType || !['group', 'personal'].includes(conversationType)) {
            return res.status(400).json({ error: 'Invalid or missing conversationType.' });
        }

        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
            return res.status(400).json({ error: 'Invalid or missing conversationId.' });
        }

        // Authorization: Check if the user is a participant in the conversation.
        const authorized = await isUserParticipant(conversationType, conversationId, userId);
        if (!authorized) {
            return res.status(403).json({ error: "Access Denied: You are not a participant in this conversation." });
        }

        const filter = {
            conversationType,
            conversationId: new mongoose.Types.ObjectId(conversationId),
            isDeleted: false,
        };

        const messages = await Message.find(filter)
            .sort({ createdAt: 1 }) // Fetch oldest messages first
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('author', 'fullName profileImage') // ✅ CORRECT: Use properties the frontend expects
            .lean();

        const totalMessages = await Message.countDocuments(filter);

        res.status(200).json({
            page,
            limit,
            totalMessages,
            totalPages: Math.ceil(totalMessages / limit),
            messages,
        });
    } catch (error) {
        console.error('Error in getMessages:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

// ----------------------------------------------------------------------------------

/**
 * @desc    Send a new message to a conversation.
 * @route   POST /api/messages
 * @access  Private (User must be a participant)
 */
const sendMessage = async (req, res) => {
    try {
        const { conversationType, conversationId, text, attachments } = req.body;
        const userId = req.user?.userId; // ✅ FIX: Standardize user ID access

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized: User not authenticated." });
        }

        if (!conversationType || !['group', 'personal'].includes(conversationType)) {
            return res.status(400).json({ error: 'Invalid or missing conversationType.' });
        }

        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
            return res.status(400).json({ error: 'Invalid or missing conversationId.' });
        }

        if (!text || typeof text !== 'string' || text.trim() === '') {
            return res.status(400).json({ error: 'Message text cannot be empty.' });
        }

        // Authorization: Check if the user is a participant.
        const authorized = await isUserParticipant(conversationType, conversationId, userId);
        if (!authorized) {
            return res.status(403).json({ error: "Access Denied: You are not a participant in this conversation." });
        }

        const newMessage = new Message({
            conversationType,
            conversationId,
            author: userId, // ✅ FIX: Set author from authenticated user, not request body
            text: text.trim(),
            attachments: attachments || [],
        });

        const savedMessage = await newMessage.save();

        // ✅ FIX: Populate with the correct fields to match frontend expectations
        await savedMessage.populate('author', 'fullName profileImage');

        res.status(201).json(savedMessage);
    } catch (error) {
        console.error('Error in sendMessage:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

// ----------------------------------------------------------------------------------

/**
 * @desc    Soft delete a message.
 * @route   DELETE /api/messages/:messageId
 * @access  Private (User must be the author)
 */
const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized: User not authenticated." });
        }

        if (!mongoose.Types.ObjectId.isValid(messageId)) {
            return res.status(400).json({ error: 'Invalid messageId.' });
        }

        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({ error: 'Message not found.' });
        }

        if (message.isDeleted) {
            return res.status(400).json({ message: 'This message has already been deleted.' });
        }

        // Authorization: Only the author of the message can delete it.
        if (!message.author.equals(userId)) {
            return res.status(403).json({ error: 'Access Denied: You are not authorized to delete this message.' });
        }

        message.isDeleted = true;
        message.text = "This message was deleted."; // Overwrite text for privacy
        message.attachments = []; // Remove any attachments
        await message.save();

        res.status(200).json({ message: 'Message successfully deleted.' });
    } catch (error) {
        console.error('Error in deleteMessage:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

// ----------------------------------------------------------------------------------

/**
 * @desc    Update the text of a message.
 * @route   PUT /api/messages/:messageId
 * @access  Private (User must be the author)
 */
const updateMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { text } = req.body;
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized: User not authenticated." });
        }

        if (!mongoose.Types.ObjectId.isValid(messageId)) {
            return res.status(400).json({ error: 'Invalid messageId.' });
        }

        if (!text || typeof text !== 'string' || text.trim() === '') {
            return res.status(400).json({ error: 'Updated text cannot be empty.' });
        }

        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({ error: 'Message not found.' });
        }

        if (message.isDeleted) {
            return res.status(403).json({ error: 'Cannot edit a deleted message.' });
        }

        // Authorization: Only the author of the message can update it.
        if (!message.author.equals(userId)) {
            return res.status(403).json({ error: 'Access Denied: You are not authorized to update this message.' });
        }

        message.text = text.trim();
        message.isEdited = true; // Optional: Mark the message as edited
        const updatedMessage = await message.save();

        await updatedMessage.populate('author', 'fullName profileImage');

        res.status(200).json(updatedMessage);
    } catch (error) {
        console.error('Error in updateMessage:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

// ----------------------------------------------------------------------------------

module.exports = {
    getMessages,
    sendMessage,
    deleteMessage,
    updateMessage,
};