const express = require("express");
const { verifyToken } = require("../../middleware/userAuthorization"); // Assuming your auth middleware
const notificationController = require("../../controllers/admin/notificationController");

const router = express.Router();

// Get paginated list of notifications for the current user
router.get("/", verifyToken, notificationController.getNotifications);

// Get counts of unread and unseen notifications for the current user
router.get("/counts", verifyToken, notificationController.getNotificationCounts);

// Mark notifications as read (single, multiple, or all)
router.patch("/mark-read", verifyToken, notificationController.markNotificationsAsRead);

// Delete notifications (single, multiple, or all)
router.delete("/", verifyToken, notificationController.deleteNotifications); // Use DELETE for deletion

module.exports = router;