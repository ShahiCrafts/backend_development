const mongoose = require('mongoose');
const Comment = require('../../models/commentModel');
const Post = require('../../models/postModel');
const Notification = require('../../models/notificationModel'); // Import Notification model
const User = require('../../models/userModel'); // Import User model to get sender's full name

// Declare a variable to hold the Socket.IO instance
let ioInstance;

// Function to set the Socket.IO instance, called from your main server file (e.g., server.js)
exports.setIoInstance = (io) => {
    ioInstance = io;
    console.log("DEBUG: ioInstance set in commentController.");
};

// --- Internal functions for core logic, callable by both REST and Sockets ---

/**
 * Internal function to handle creating a comment/reply and emitting notification.
 * This function contains the core business logic and notification creation.
 * It's called by both the Express route handler and the Socket.IO handler.
 */
async function _handleCreateComment(postId, content, parentId, userId, currentUserFullName) {
    console.log(`DEBUG: _handleCreateComment (Internal) called. userId: ${userId}, postId: ${postId}, parentId: ${parentId}`);

    const post = await Post.findById(postId).select('authorId title');
    if (!post) {
        console.log("DEBUG: _handleCreateComment - Post not found.");
        throw new Error('Post not found.');
    }

    const newComment = new Comment({
        postId,
        authorId: userId,
        authorName: currentUserFullName,
        content: content.trim(),
        parentId: parentId || null,
    });

    await newComment.save();
    console.log("DEBUG: _handleCreateComment - newComment saved to DB:", newComment._id);

    if (parentId) {
        // Handle replies
        const parentComment = await Comment.findByIdAndUpdate(
            parentId,
            { $inc: { repliesCount: 1 } },
            { new: true }
        );

        const shouldNotifyReplyAuthor = parentComment && parentComment.authorId && !parentComment.authorId.equals(userId);
        console.log(`DEBUG: _handleCreateComment (Reply) - Should notify reply author: ${shouldNotifyReplyAuthor}. Parent author: ${parentComment?.authorId}, Current user: ${userId}`);

        if (shouldNotifyReplyAuthor) {
            try {
                const notification = new Notification({
                    recipientId: parentComment.authorId,
                    senderId: userId,
                    type: "reply_comment",
                    title: `${currentUserFullName || 'Someone'} replied to your comment`,
                    message: `"${newComment.content.substring(0, 50) + (newComment.content.length > 50 ? '...' : '')}" on "${post.title.substring(0, 30) + (post.title.length > 30 ? '...' : '')}"`,
                    entityId: newComment._id,
                    entityType: "Comment",
                    link: `/citizen/posts/${postId}#comment-${newComment._id}`,
                });
                console.log("DEBUG: _handleCreateComment (Reply) - Attempting to save notification:", notification);
                await notification.save();
                console.log("DEBUG: _handleCreateComment (Reply) - Notification for reply saved successfully:", notification._id);

                if (ioInstance) {
                    ioInstance.to(parentComment.authorId.toString()).emit("newNotification", notification);
                    console.log(`Backend: Emitting 'newNotification' for reply to comment to user room: ${parentComment.authorId.toString()}`);
                } else {
                    console.error("Backend: ioInstance is not set in commentController - cannot emit reply notification.");
                }
            } catch (notificationErr) {
                console.error("Backend: ERROR creating/saving reply notification:", notificationErr);
                if (notificationErr.name === 'ValidationError') {
                    console.error("Backend: Notification validation details (Reply):", notificationErr.errors);
                }
            }
        }
    } else {
        // Handle new comments on posts
        const shouldNotifyPostAuthor = post.authorId && !post.authorId.equals(userId);
        console.log(`DEBUG: _handleCreateComment (New Comment) - Should notify post author: ${shouldNotifyPostAuthor}. Post author: ${post.authorId}, Current user: ${userId}`);

        if (shouldNotifyPostAuthor) {
            try {
                const notification = new Notification({
                    recipientId: post.authorId,
                    senderId: userId,
                    type: "comment_post",
                    title: `${currentUserFullName || 'Someone'} commented on your post`,
                    message: `"${newComment.content.substring(0, 50) + (newComment.content.length > 50 ? '...' : '')}" on "${post.title.substring(0, 30) + (post.title.length > 30 ? '...' : '')}"`,
                    entityId: newComment._id,
                    entityType: "Comment",
                    link: `/citizen/posts/${postId}#comment-${newComment._id}`,
                });
                console.log("DEBUG: _handleCreateComment (New Comment) - Attempting to save notification:", notification);
                await notification.save();
                console.log("DEBUG: _handleCreateComment (New Comment) - Notification for new comment saved successfully:", notification._id);

                if (ioInstance) {
                    ioInstance.to(post.authorId.toString()).emit("newNotification", notification);
                    console.log(`Backend: Emitting 'newNotification' for new comment to post to user room: ${post.authorId.toString()}`);
                } else {
                    console.error("Backend: ioInstance is not set in commentController - cannot emit new comment notification.");
                }
            } catch (notificationErr) {
                console.error("Backend: ERROR creating/saving comment notification:", notificationErr);
                if (notificationErr.name === 'ValidationError') {
                    console.error("Backend: Notification validation details (New Comment):", notificationErr.errors);
                }
            }
        }
    }
    await newComment.populate('authorId', 'fullName profileImage');
    return newComment; // Return the saved comment
}

/**
 * Internal function to handle toggling a comment like and emitting notification.
 * This function contains the core business logic and notification creation.
 * It's called by both the Express route handler and the Socket.IO handler.
 */
async function _handleToggleLike(commentId, userId, currentUserFullName) {
    console.log(`DEBUG: _handleToggleLike (Internal) called. userId: ${userId}, commentId: ${commentId}`);

    const comment = await Comment.findById(commentId).select('authorId postId content likes');
    if (!comment) {
        console.log("DEBUG: _handleToggleLike - Comment not found.");
        throw new Error("Comment not found.");
    }

    const isCurrentlyLiked = comment.likes.includes(userId);
    console.log(`DEBUG: _handleToggleLike - isCurrentlyLiked: ${isCurrentlyLiked}`);

    const update = isCurrentlyLiked
        ? { $pull: { likes: userId } }
        : { $addToSet: { likes: userId } };

    const updatedComment = await Comment.findByIdAndUpdate(
        commentId,
        update,
        { new: true }
    ).populate('authorId', 'fullName profileImage');
    console.log("DEBUG: _handleToggleLike - Comment like status updated in DB.");

    // Only notify if the liker is NOT the comment author AND user just liked (not unliked)
    const shouldNotifyCommentAuthor = !isCurrentlyLiked && !comment.authorId.equals(userId);
    console.log(`DEBUG: _handleToggleLike - Should notify comment author: ${shouldNotifyCommentAuthor}. Comment author: ${comment.authorId}, Current user: ${userId}`);

    if (shouldNotifyCommentAuthor) {
        try {
            const post = await Post.findById(comment.postId).select('title');
            console.log("DEBUG: _handleToggleLike - Post for context found:", post?.title);

            const notification = new Notification({
                recipientId: comment.authorId,
                senderId: userId,
                type: "like_comment",
                title: `${currentUserFullName || 'Someone'} liked your comment`,
                message: `"${comment.content.substring(0, 50) + (comment.content.length > 50 ? '...' : '')}" on "${post?.title.substring(0, 30) + (post?.title.length > 30 ? '...' : '')}"`,
                entityId: comment._id,
                entityType: "Comment",
                link: `/citizen/posts/${comment.postId}#comment-${comment._id}`,
            });
            console.log("DEBUG: _handleToggleLike (Like Comment) - Attempting to save notification:", notification);
            await notification.save();
            console.log("DEBUG: _handleToggleLike (Like Comment) - Notification for comment like saved successfully:", notification._id);

            if (ioInstance) {
                ioInstance.to(comment.authorId.toString()).emit("newNotification", notification);
                console.log(`Backend: Emitting 'newNotification' for comment like to user room: ${comment.authorId.toString()}`);
            } else {
                console.error("Backend: ioInstance is not set in commentController - cannot emit comment like notification.");
            }
        } catch (notificationErr) {
            console.error("Backend: ERROR creating/saving comment like notification:", notificationErr);
            if (notificationErr.name === 'ValidationError') {
                console.error("Backend: Notification validation details (Like Comment):", notificationErr.errors);
            }
        }
    }
    return updatedComment;
}

/**
 * Internal function to handle deleting a comment.
 * This function contains the core business logic.
 * It's called by both the Express route handler and the Socket.IO handler.
 */
async function _handleDeleteComment(commentId, userId) {
    console.log(`DEBUG: _handleDeleteComment (Internal) called. commentId=${commentId}, userId=${userId}`);

    const comment = await Comment.findById(commentId);
    if (!comment) {
        console.log("DEBUG: _handleDeleteComment - Comment not found.");
        throw new Error("Comment not found.");
    }
    if (!comment.authorId.equals(userId)) {
        console.log("DEBUG: _handleDeleteComment - Access Denied.");
        throw new Error("Access Denied: You are not authorized to delete this comment.");
    }
    if (comment.isDeleted) {
        console.log("DEBUG: _handleDeleteComment - Comment already deleted.");
        throw new Error('This comment has already been deleted.');
    }

    comment.isDeleted = true;
    comment.content = "This message was deleted.";
    comment.attachments = [];
    await comment.save();
    console.log("DEBUG: _handleDeleteComment - Comment marked as deleted in DB.");

    if (comment.parentId) {
        await Comment.findByIdAndUpdate(comment.parentId, { $inc: { repliesCount: -1 } });
        console.log("DEBUG: _handleDeleteComment - Parent comment repliesCount decremented.");
    }
    return { message: "Comment successfully deleted.", commentId, postId: comment.postId, parentId: comment.parentId }; // Return postId for socket emission
}


// --- Express Route Handlers (Wrapper functions) ---

/**
 * @desc    Create a new comment or a reply to an existing comment.
 * @route   POST /api/comments
 * @access  Private (User must be authenticated)
 */
exports.createComment = async (req, res) => {
    console.log("DEBUG: createComment (Express Route) endpoint hit.");
    try {
        const { postId, content, parentId } = req.body;
        const userId = req.user?.userId;
        const currentUserFullName = req.user?.fullName;

        if (!userId) return res.status(401).json({ error: "Unauthorized: User not authenticated." });
        if (!postId || !mongoose.Types.ObjectId.isValid(postId)) return res.status(400).json({ error: 'A valid postId is required.' });
        if (!content || typeof content !== 'string' || content.trim() === '') return res.status(400).json({ error: 'Comment content cannot be empty.' });

        const newComment = await _handleCreateComment(postId, content, parentId, userId, currentUserFullName);
        res.status(201).json(newComment);
    } catch (err) {
        console.error("Create comment error (Express outer catch):", err);
        res.status(err.message.includes("not found") ? 404 : 500).json({ error: err.message || "An internal server error occurred while creating the comment." });
    }
};

/**
 * @desc    Get all comments for a post, correctly nested.
 * @route   GET /api/comments/:postId
 * @access  Public
 */
exports.getCommentsByPost = async (req, res) => {
    try {
        const { postId } = req.params;
        if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ error: 'A valid postId is required.' });
        }
        const comments = await Comment.find({ postId })
            .populate('authorId', 'fullName profileImage')
            .sort({ createdAt: -1 })
            .lean();
        res.status(200).json(comments);
    } catch (err) {
        console.error("Get comments error:", err);
        res.status(500).json({ error: "An internal server error occurred." });
    }
};

/**
 * @desc    Toggle like on a comment.
 * @route   PATCH /api/comments/:commentId/like
 * @access  Private (User must be authenticated)
 */
exports.toggleLike = async (req, res) => {
    console.log("DEBUG: toggleLike (Express Route) endpoint hit.");
    try {
        const { commentId } = req.params;
        const userId = req.user?.userId;
        const currentUserFullName = req.user?.fullName;

        if (!userId) return res.status(401).json({ error: "Unauthorized: User not authenticated." });
        if (!mongoose.Types.ObjectId.isValid(commentId)) return res.status(400).json({ error: 'Invalid commentId.' });

        const updatedComment = await _handleToggleLike(commentId, userId, currentUserFullName);
        res.status(200).json(updatedComment);
    } catch (err) {
        console.error("Toggle like error (Express outer catch):", err);
        res.status(err.message.includes("not found") ? 404 : 500).json({ error: err.message || "An internal server error occurred." });
    }
};

/**
 * @desc    Soft delete a comment.
 * @route   DELETE /api/comments/:commentId
 * @access  Private (User must be the author)
 */
exports.deleteComment = async (req, res) => {
    console.log("DEBUG: deleteComment (Express Route) endpoint hit.");
    try {
        const { commentId } = req.params;
        const userId = req.user?.userId;

        if (!userId) return res.status(401).json({ error: "Unauthorized: User not authenticated." });
        if (!mongoose.Types.ObjectId.isValid(commentId)) return res.status(400).json({ error: 'Invalid commentId.' });

        const result = await _handleDeleteComment(commentId, userId);
        res.status(200).json(result);
    } catch (err) {
        console.error("Delete comment error (Express outer catch):", err);
        res.status(err.message.includes("not found") || err.message.includes("Access Denied") || err.message.includes("already been deleted") ? (err.message.includes("Access Denied") ? 403 : 404) : 500).json({ error: err.message || "An internal server error occurred." });
    }
};

module.exports = {
    createComment: exports.createComment, // Export the Express route handler
    getCommentsByPost: exports.getCommentsByPost, // Export the Express route handler
    toggleLike: exports.toggleLike,       // Export the Express route handler
    deleteComment: exports.deleteComment, // Export the Express route handler
    setIoInstance: exports.setIoInstance, // Export the function to set ioInstance
    // Export internal functions for Socket.IO handler to use
    _handleCreateComment,
    _handleToggleLike,
    _handleDeleteComment
};