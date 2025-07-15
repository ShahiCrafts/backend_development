const express = require('express');
const router = express.Router();
const commentController = require('../../controllers/users/commentController');
const { verifyToken } = require('../../middleware/userAuthorization');

// Create comment or reply
router.post('/', verifyToken, commentController.createComment);

// Get all comments for a post (with replies)
router.get('/:postId', commentController.getCommentsByPost);

// Like/unlike a comment
router.patch('/:commentId/like', verifyToken, commentController.toggleLike);

// Soft delete a comment
router.delete('/:commentId', verifyToken, commentController.deleteComment);

module.exports = router;
