const express = require("express");
const userController = require("../../controllers/users/userController");
const { verifyToken } = require("../../middleware/userAuthorization");

const router = express.Router();

router.get("/:id", verifyToken, userController.getUserProfile);
router.put("/:id", verifyToken, userController.updateUserProfile);
router.put("/:id/change-password", verifyToken, userController.changePassword);
router.get("/:id/posts", verifyToken, userController.getUserPosts);
router.get("/:id/achievements", verifyToken, userController.getUserAchievements);
router.get("/:id/sessions", verifyToken, userController.getUserActiveSessions);
router.post("/:id/logout-all", verifyToken, userController.logoutUserFromAllDevices);
router.put("/:userId/sessions/:sessionId/revoke", verifyToken, userController.revokeSpecificSession);

module.exports = router;
