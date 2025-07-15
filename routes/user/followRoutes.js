const express = require('express');
const router = express.Router();
const followController = require('../../controllers/users/followController');
const { verifyToken } = require('../../middleware/userAuthorization');

router.post('/:id', verifyToken, followController.followUser);
router.delete('/:id', verifyToken, followController.unfollowUser);
router.get('/:id/following', followController.getFollowing);
router.get('/:id/followers', followController.getFollowers);
router.get('/check/:id', verifyToken, followController.checkFollowingStatus);

module.exports = router;
