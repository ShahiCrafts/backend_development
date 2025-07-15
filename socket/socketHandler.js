const mongoose = require("mongoose");
const Message = require("../models/messageModel");
const GroupDiscussion = require("../models/groupDiscusssionModel");
const PersonalConversation = require("../models/personalConversationModel");
const Comment = require("../models/commentModel");
const commentController = require("../controllers/users/commentController")
const Community = require("../models/communityModel"); // Ensure Community model is imported
const User = require("../models/userModel"); // Added: Import User model to fetch user roles if needed (though role should be on socket.user)


const onlineUsers = new Map(); // Map to store userId -> socketId (used by app.js and controllers)

/**
 * Helper function to check if a user is a participant in a given conversation.
 * @param {string} conversationType - 'group' or 'personal'.
 * @param {mongoose.Types.ObjectId} conversationId - ID of the conversation.
 * @param {mongoose.Types.ObjectId} userId - ID of the user.
 * @returns {Promise<boolean>} - True if user is a participant, false otherwise.
 */
async function isUserParticipant(conversationType, conversationId, userId) {
    try {
        const model =
            conversationType === "group" ? GroupDiscussion : PersonalConversation;
        const conversation = await model
            .findById(conversationId)
            .select("participants")
            .lean();
        if (!conversation) return false;
        return conversation.participants
            .filter((p) => p) // Filter out null/undefined participants
            .some((p) => p.toString() === userId.toString());
    } catch (error) {
        console.error("Error in isUserParticipant:", error);
        return false;
    }
}

/**
 * Helper function to check if a user is a member, owner, or moderator of a community.
 * @param {mongoose.Types.ObjectId} userId - ID of the user.
 * @param {mongoose.Types.ObjectId} communityId - ID of the community.
 * @returns {Promise<{isMember: boolean, isAdmin: boolean}>} - Object indicating membership and admin status.
 */
async function isUserCommunityMemberOrAdmin(userId, communityId) {
    try {
        const community = await Community.findById(communityId)
            .select("members owners moderators")
            .lean();
        if (!community) return { isMember: false, isAdmin: false };

        const isMember = community.members.some((memberId) =>
            memberId.equals(userId)
        );
        const isOwner = community.owners.some((ownerId) => ownerId.equals(userId));
        const isModerator = community.moderators.some((modId) =>
            modId.equals(userId)
        );
        return {
            isMember: isMember || isOwner, // A user who is an owner is also a member
            isAdmin: isOwner || isModerator, // Admin here refers to owners or moderators
        };
    } catch (error) {
        console.error("Error in isUserCommunityMemberOrAdmin:", error);
        return {
            isMember: false,
            isAdmin: false,
        };
    }
}

/**
 * Registers all Socket.IO event handlers.
 * @param {SocketIO.Server} io - The Socket.IO server instance.
 */
const registerSocketHandlers = (io) => {
    io.on("connection", async (socket) => {
        // Extract user ID, full name, and role from the authenticated socket.user object
        // The `socketAuth` middleware should have populated socket.user based on JWT.
        const userId = socket.user?.userId || socket.user?.id || socket.user?._id;
        const currentUserFullName = socket.user?.fullName;
        const currentUserRole = socket.user?.role; // IMPORTANT: Ensure 'role' is set by your socketAuth middleware

        if (!userId) {
            const foundKeys = socket.user
                ? Object.keys(socket.user).join(", ")
                : 'No "user" object found';
            console.error(
                `Socket connection failed: No valid userId. Found keys on socket.user: [${foundKeys}]`
            );
            return socket.disconnect(); // Disconnect clients without a valid user ID
        }

        // Join the user's personal notification room
        socket.join(userId.toString());
        console.log(
            `User ${userId.toString()} (socket: ${
                socket.id
            }) joined their personal notification room.`
        );

        // Admins join a dedicated room for approval notifications
        if (currentUserRole === 'admin') {
            socket.join('admin:approvals');
            console.log(`Admin ${userId} (socket: ${socket.id}) joined admin:approvals room.`);
        }

        // Add user to the online users map and broadcast updated list
        onlineUsers.set(userId.toString(), socket.id);
        io.emit("user:onlineList", Array.from(onlineUsers.keys()));

        // Automatically join user to rooms of communities they are already a member/owner/moderator of
        try {
            const communities = await Community.find({
                $or: [{ members: userId }, { owners: userId }, { moderators: userId }],
                status: "approved", // Only join approved community rooms on connect
            }).select("_id");

            communities.forEach((community) => {
                const communityRoom = `community:${community._id.toString()}`;
                socket.join(communityRoom);
                console.log(
                    `User ${userId} (socket: ${socket.id}) also joined community room: ${communityRoom}`
                );
            });
        } catch (error) {
            console.error(
                `Error joining user ${userId} to community rooms on connect:`,
                error
            );
        }

        // --- Chat/Messaging Handlers ---
        socket.on("joinRoom", (roomId) => {
            socket.join(roomId);
            console.log(`Socket ${socket.id} joined chat room ${roomId}`);
        });

        socket.on("leaveRoom", (roomId) => {
            socket.leave(roomId);
            console.log(`Socket ${socket.id} left chat room ${roomId}`);
        });

        socket.on("sendMessage", async (data) => {
            try {
                const { conversationType, conversationId, text, attachments } = data;
                if (!mongoose.Types.ObjectId.isValid(conversationId)) {
                    return socket.emit("errorMessage", {
                        error: "Invalid conversation ID.",
                    });
                }

                const authorized = await isUserParticipant(
                    conversationType,
                    conversationId,
                    userId
                );
                if (!authorized) {
                    return socket.emit("errorMessage", { error: "Access denied." });
                }

                const message = new Message({
                    conversationType,
                    conversationId,
                    author: userId,
                    text,
                    attachments: attachments || [],
                });

                const savedMessage = await message.save();
                await savedMessage.populate("author", "fullName profileImage");

                const ConversationModel =
                    conversationType === "group" ? GroupDiscussion : PersonalConversation;
                await ConversationModel.findByIdAndUpdate(conversationId, {
                    updatedAt: new Date(),
                });

                io.to(conversationId).emit("newMessage", savedMessage);
            } catch (err) {
                console.error("sendMessage socket error:", err);
                socket.emit("errorMessage", { error: "Error sending message." });
            }
        });

        socket.on("editMessage", async (data) => {
            try {
                const { messageId, text } = data;
                if (!mongoose.Types.ObjectId.isValid(messageId)) return;

                const message = await Message.findById(messageId);
                if (!message || message.isDeleted) return;

                if (!message.author.equals(userId)) {
                    return socket.emit("errorMessage", {
                        error: "Not authorized to edit this message.",
                    });
                }

                message.text = text.trim();
                message.isEdited = true;
                await message.save();
                await message.populate("author", "fullName profileImage");

                io.to(message.conversationId.toString()).emit("messageEdited", message);
            } catch (err) {
                console.error("editMessage socket error:", err);
            }
        });

        socket.on("deleteMessage", async ({ messageId }) => {
            try {
                if (!mongoose.Types.ObjectId.isValid(messageId)) return;

                const message = await Message.findById(messageId);
                if (!message || message.isDeleted) return;

                if (!message.author.equals(userId)) {
                    return socket.emit("errorMessage", {
                        error: "Not authorized to delete this message.",
                    });
                }

                message.isDeleted = true;
                message.text = "This message was deleted.";
                message.attachments = [];
                await message.save();

                io.to(message.conversationId.toString()).emit("messageDeleted", {
                    messageId,
                });
            } catch (err) {
                console.error("deleteMessage socket error:", err);
            }
        });

        // --- Feed Room Handlers ---
        socket.on("joinGlobalFeedRoom", () => {
            socket.join("global:feed");
            console.log(`Socket ${socket.id} joined global:feed room`);
            socket.emit("joinedGlobalFeedRoom"); // Confirm to client
        });

        socket.on("leaveGlobalFeedRoom", () => {
            socket.leave("global:feed");
            console.log(`Socket ${socket.id} left global:feed room`);
            socket.emit("leftGlobalFeedRoom"); // Confirm to client
        });

        socket.on("joinCommunityFeedRoom", async (communityId) => {
            if (!mongoose.Types.ObjectId.isValid(communityId)) {
                return socket.emit("errorMessage", {
                    message: "Invalid community ID.",
                });
            }
            // Use the more general helper
            const { isMember } = await isUserCommunityMemberOrAdmin(
                userId,
                communityId
            );
            if (!isMember) { // Only members can access feed rooms
                return socket.emit("errorMessage", {
                    message: "Not authorized to access this community's feed.",
                });
            }
            const roomName = `community:${communityId}`;
            socket.join(roomName);
            console.log(
                `Socket ${socket.id} (User ${userId}) joined community feed room ${roomName}`
            );
            socket.emit("joinedCommunityFeedRoom", communityId);
        });

        socket.on("leaveCommunityFeedRoom", (communityId) => {
            const roomName = `community:${communityId}`;
            socket.leave(roomName);
            console.log(
                `Socket ${socket.id} (User ${userId}) left community feed room ${roomName}`
            );
            socket.emit("leftCommunityFeedRoom", communityId);
        });

        // --- Post Comment Handlers (assuming commentController is setup to handle logic) ---
        socket.on("joinPostRoom", (postId) => {
            const roomName = `post:${postId}`;
            socket.join(roomName);
            console.log(`Socket ${socket.id} joined post room ${roomName}`);
        });

        socket.on("leavePostRoom", (postId) => {
            const roomName = `post:${postId}`;
            socket.leave(roomName);
            console.log(`Socket ${socket.id} left post room ${roomName}`);
        });

        socket.on("createComment", async (data) => {
            console.log("SOCKET: Received 'createComment' event from client:", data);
            try {
                const { postId, content, parentId } = data;
                const newComment = await commentController._handleCreateComment(
                    postId,
                    content,
                    parentId,
                    userId,
                    currentUserFullName
                );
                io.to(`post:${newComment.postId.toString()}`).emit("newComment", newComment);
                console.log("SOCKET: 'createComment' processed successfully.");
            } catch (err) {
                console.error("SOCKET: Error handling 'createComment' event:", err);
                socket.emit("errorMessage", {
                    error: err.message || "Failed to create comment via socket.",
                });
            }
        });

        socket.on("toggleLikeComment", async (data) => {
            console.log("SOCKET: Received 'toggleLikeComment' event from client:", data);
            try {
                const { commentId } = data;
                const updatedComment = await commentController._handleToggleLike(
                    commentId,
                    userId,
                    currentUserFullName
                );
                io.to(`post:${updatedComment.postId.toString()}`).emit(
                    "commentLikeUpdate",
                    {
                        commentId: updatedComment._id,
                        likes: updatedComment.likes,
                    }
                );
                console.log("SOCKET: 'toggleLikeComment' processed successfully.");
            } catch (err) {
                console.error("SOCKET: Error handling 'toggleLikeComment' event:", err);
                socket.emit("errorMessage", {
                    error: err.message || "Failed to toggle comment like via socket.",
                });
            }
        });

        socket.on("deleteComment", async ({ commentId }) => {
            console.log("SOCKET: Received 'deleteComment' event from client:", { commentId });
            try {
                const result = await commentController._handleDeleteComment(
                    commentId,
                    userId
                );
                io.to(`post:${result.postId.toString()}`).emit("commentDeleted", {
                    commentId: result.commentId,
                    parentId: result.parentId,
                });
                console.log("SOCKET: 'deleteComment' processed successfully.");
            } catch (err) {
                console.error("SOCKET: Error handling 'deleteComment' event:", err);
                socket.emit("errorMessage", {
                    error: err.message || "Failed to delete comment via socket.",
                });
            }
        });

        // --- Community Room Handlers (for real-time updates within a community) ---
        // Note: isUserCommunityMemberOrAdmin is used here and must match the defined helper name.
        socket.on("joinCommunityRoom", async (communityId) => {
            if (!mongoose.Types.ObjectId.isValid(communityId)) {
                return socket.emit("errorMessage", {
                    message: "Invalid community ID.",
                });
            }
            const { isMember, isAdmin } = await isUserCommunityMemberOrAdmin( // Ensure helper name matches
                userId,
                communityId
            );
            if (!isMember && !isAdmin) { // Only members or admins can join
                return socket.emit("errorMessage", {
                    message: "Not authorized to join this community room.",
                });
            }
            const roomName = `community:${communityId}`;
            socket.join(roomName);
            console.log(
                `Socket ${socket.id} (User ${userId}) joined community room ${roomName}`
            );
            socket.emit("joinedCommunityRoom", communityId); // Confirm to client
        });

        socket.on("leaveCommunityRoom", (communityId) => {
            const roomName = `community:${communityId}`;
            socket.leave(roomName);
            console.log(
                `Socket ${socket.id} (User ${userId}) left community room ${roomName}`
            );
            socket.emit("leftCommunityRoom", communityId); // Confirm to client
        });

        // --- Admin Approval Room Join Handler (Frontend request to join admin room) ---
        socket.on('joinAdminApprovalRoom', () => {
            if (currentUserRole === 'admin') { // Security check on backend
                socket.join('admin:approvals');
                console.log(`Admin ${userId} (socket: ${socket.id}) explicitly joined admin:approvals room.`);
            } else {
                socket.emit('errorMessage', { error: 'Not authorized to join admin approval room.' });
            }
        });

        socket.on("user:online", (userId) => {
    if (userId) {
        const roomName = `user:${userId}`;
        socket.join(roomName);
        console.log(`User ${userId} joined personal room: ${roomName}`);
    }
});



        // --- Disconnect Handler ---
        socket.on("disconnect", () => {
            const disconnectedUserId = [...onlineUsers.entries()].find(
                ([_, id]) => id === socket.id
            )?.[0];

            if (disconnectedUserId) {
                onlineUsers.delete(disconnectedUserId);
                io.emit("user:onlineList", Array.from(onlineUsers.keys())); // Broadcast updated online list
                console.log(
                    `User ${disconnectedUserId} (socket: ${socket.id}) disconnected.`
                );
            }
        });
    });
};

module.exports = {
    registerSocketHandlers,
    getOnlineUsersMap: () => onlineUsers,
    // isUserCommunityMemberOrAdmin is only used internally in this file, no need to export it directly.
    // However, if you have other modules that need this helper, you would export it.
};