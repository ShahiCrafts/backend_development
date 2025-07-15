const Notification = require("../../models/notificationModel");
const User = require("../../models/userModel"); // In case we need to verify users or get additional info
const mongoose = require("mongoose");

let ioInstance; // To hold the Socket.IO instance for broadcasting updates

// Function to set the Socket.IO instance (called from app.js/server.js)
const setIoInstance = (io) => {
  ioInstance = io;
};

/**
 * Get notifications for the authenticated user.
 * Supports filtering by read/seen status and pagination.
 */
const getNotifications = async (req, res) => {
  const recipientId = req.user.userId; // Assuming userId is set by auth middleware
  const { page = 1, limit = 10, read, seen } = req.query; // Filters
  const filter = { recipientId };

  if (read !== undefined) {
    filter.read = read === 'true'; // Convert string 'true'/'false' to boolean
  }
  if (seen !== undefined) {
    filter.seen = seen === 'true'; // Convert string 'true'/'false' to boolean
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  try {
    const notifications = await Notification.find(filter)
      .populate("senderId", "fullName profileImage") // Populate sender details
      .sort({ createdAt: -1 }) // Sort by newest first
      .skip(skip)
      .limit(limitNum);

    const totalNotifications = await Notification.countDocuments(filter);
    const totalPages = Math.ceil(totalNotifications / limitNum);

    // After fetching, mark these notifications as 'seen' in the background
    // This doesn't need to block the response, and ensures new counts are accurate
    // Filter only those that are not already seen to avoid unnecessary writes
    const unseenNotificationIds = notifications.filter(n => !n.seen).map(n => n._id);
    if (unseenNotificationIds.length > 0) {
      await Notification.updateMany(
        { _id: { $in: unseenNotificationIds } },
        { $set: { seen: true } }
      );
      // If needed, you could emit a socket event to inform the user's other devices
      // that some notifications have been seen, which might update unread counts globally.
      if (ioInstance) {
          ioInstance.to(recipientId.toString()).emit("notificationsSeen", { ids: unseenNotificationIds });
      }
    }


    res.status(200).json({
      notifications,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalNotifications,
      },
    });
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ message: "Failed to fetch notifications", error: err.message });
  }
};

/**
 * Get unread/unseen counts for the authenticated user.
 * Used for badge counts in UI.
 */
const getNotificationCounts = async (req, res) => {
  const recipientId = req.user.userId;

  try {
    const unreadCount = await Notification.countDocuments({ recipientId, read: false });
    const unseenCount = await Notification.countDocuments({ recipientId, seen: false });

    res.status(200).json({ unread: unreadCount, unseen: unseenCount });
  } catch (err) {
    console.error("Error fetching notification counts:", err);
    res.status(500).json({ message: "Failed to fetch notification counts", error: err.message });
  }
};

/**
 * Mark one or more notifications as read.
 */
const markNotificationsAsRead = async (req, res) => {
  const recipientId = req.user.userId;
  const { notificationIds, markAll = false } = req.body; // Can be an array of IDs or mark all

  try {
    let updateFilter = { recipientId, read: false };
    if (!markAll) {
      if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(400).json({ message: "Please provide notificationIds array or set markAll to true." });
      }
      updateFilter._id = { $in: notificationIds.filter(id => mongoose.Types.ObjectId.isValid(id)) };
    }

    const result = await Notification.updateMany(updateFilter, { $set: { read: true } });

    if (result.modifiedCount > 0 && ioInstance) {
        // Emit socket event to notify client of read status change
        ioInstance.to(recipientId.toString()).emit("notificationsRead", {
            ids: markAll ? "all" : notificationIds,
        });
    }

    res.status(200).json({ message: "Notifications marked as read", modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("Error marking notifications as read:", err);
    res.status(500).json({ message: "Failed to mark notifications as read", error: err.message });
  }
};

/**
 * Delete one or more notifications.
 */
const deleteNotifications = async (req, res) => {
  const recipientId = req.user.userId;
  const { notificationIds, deleteAll = false } = req.body;

  try {
    let deleteFilter = { recipientId };
    if (!deleteAll) {
      if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(400).json({ message: "Please provide notificationIds array or set deleteAll to true." });
      }
      deleteFilter._id = { $in: notificationIds.filter(id => mongoose.Types.ObjectId.isValid(id)) };
    }

    const result = await Notification.deleteMany(deleteFilter);

    if (result.deletedCount > 0 && ioInstance) {
        // Emit socket event to notify client of deletion
        ioInstance.to(recipientId.toString()).emit("notificationsDeleted", {
            ids: deleteAll ? "all" : notificationIds,
        });
    }

    res.status(200).json({ message: "Notifications deleted", deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting notifications:", err);
    res.status(500).json({ message: "Failed to delete notifications", error: err.message });
  }
};

// Export the setIoInstance function and controller methods
module.exports = {
  getNotifications,
  getNotificationCounts,
  markNotificationsAsRead,
  deleteNotifications,
  setIoInstance,
};