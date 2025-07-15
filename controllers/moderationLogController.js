// moderationLogController.js

const ModerationLog = require("../models/moderationLogModel");
const Community = require("../models/communityModel");
const mongoose = require("mongoose");

// --- ADD THESE LINES ---
let ioInstance; // Declare ioInstance variable
let onlineUsersMap; // Declare onlineUsersMap variable if needed for future logic

// Function to set the Socket.IO instance and onlineUsersMap
const setIoInstance = (io, onlineUsers) => {
  ioInstance = io;
  onlineUsersMap = onlineUsers; // Store the online users map
};
// --- END ADDED LINES ---

/**
 * Helper to check if user is admin/mod for a community
 */
async function isCommunityAdmin(userId, communityId) {
  const community = await Community.findById(communityId);
  if (!community) return false;

  return (
    community.owners.some((id) => id.equals(userId)) ||
    community.moderators.some((id) => id.equals(userId))
  );
}

/**
 * Internal function to create a moderation log entry.
 * This function is designed to be called directly by other controllers
 * (e.g., communityController, postController) without an HTTP request context.
 * It handles saving the log to the database and emitting real-time notifications.
 *
 * @param {object} logData - An object containing log details:
 * @param {string} logData.communityId - The ID of the community involved (can be null for global actions).
 * @param {string} logData.moderatorId - The ID of the user performing the action.
 * @param {string} logData.action - The type of moderation action (e.g., 'community_approved').
 * @param {string} [logData.targetId] - The ID of the specific entity acted upon (e.g., community ID, post ID, user ID).
 * @param {string} [logData.reason] - A reason or description for the action.
 * @returns {Promise<ModerationLog|null>} The created ModerationLog document, or null if validation fails.
 */
const createLogInternal = async (logData) => {
  try {
    const { communityId, moderatorId, action, targetId, reason = "" } = logData;

    // Basic validation for internal calls
    if (!mongoose.Types.ObjectId.isValid(moderatorId)) {
      console.error("ModerationLog (Internal): Invalid moderator ID provided.");
      return null;
    }

    if (communityId && !mongoose.Types.ObjectId.isValid(communityId)) {
      console.error("ModerationLog (Internal): Invalid community ID provided.");
      return null;
    }

    if (!action) {
      console.error("ModerationLog (Internal): Action is required.");
      return null;
    }

    const log = new ModerationLog({
      communityId: communityId || null, // Allow null for global actions (e.g., global user ban)
      moderatorId,
      action,
      targetId,
      reason,
      createdAt: new Date(),
    });

    await log.save();

    // --- Real-Time Notification for Moderation Log ---
    if (ioInstance) {
      let targetRoom = "admin:dashboard_logs"; // Default room for general/global logs

      // If it's a community-specific log, broadcast to that community's room (for its mods/owners)
      if (communityId) {
        targetRoom = `community:${communityId}`;

        // Notify all online owners/moderators of that specific community to update their notification counts
        const community = await Community.findById(communityId)
          .select("owners moderators")
          .lean();
        if (community) {
          const adminAndModIds = new Set([
            ...(community.owners || []).map((id) => id.toString()),
            ...(community.moderators || []).map((id) => id.toString()),
          ]);
          adminAndModIds.forEach((id) => {
            if (onlineUsersMap && onlineUsersMap.has(id)) {
              ioInstance.to(`user:${id}`).emit("notification:count:update");
            }
          });
        }
      } else {
        // If it's a global action (no communityId), notify all global admins
        const globalAdmins = await User.find({ role: "admin" })
          .select("_id")
          .lean();
        globalAdmins.forEach((admin) => {
          if (onlineUsersMap && onlineUsersMap.has(admin._id.toString())) {
            ioInstance
              .to(`user:${admin._id.toString()}`)
              .emit("notification:count:update");
          }
        });
      }

      // Emit the log event to the relevant room(s)
      ioInstance.to(targetRoom).emit("moderation:log:created", {
        logId: log._id,
        communityId: log.communityId,
        moderatorId: log.moderatorId,
        action: log.action,
        targetId: log.targetId,
        reason: log.reason,
        createdAt: log.createdAt,
        message:
          `New moderation action: ${log.action}` +
          (log.communityId ? ` in community ${communityId}` : ""), // communityId.name is not reliable if not populated
      });
    }
    // --- End Real-Time Notification ---

    return log; // Return the saved log document
  } catch (error) {
    console.error("Internal create moderation log error:", error);
    return null;
  }
};

/**
 * Create a moderation log entry (called by internal services or moderators)
 * Body: {
 * communityId,
 * action: 'post_removed' | 'user_banned' | etc,
 * targetId,
 * reason
 * }
 */
const createLog = async (req, res) => {
  try {
    // ... (your existing createLog logic) ...

    const { communityId, action, targetId, reason = "" } = req.body;
    const moderatorId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(moderatorId)) {
      // Ensure moderatorId is valid ObjectId
      return res.status(400).json({ message: "Invalid moderator ID." });
    }

    // communityId is now optional in schema, so validate only if provided
    if (communityId && !mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ message: "Invalid community ID." });
    }

    if (!action) {
      return res.status(400).json({ message: "Action is required." });
    }

    // Permission check is only relevant if communityId is provided or action is community-specific
    if (communityId) {
      const hasPermission = await isCommunityAdmin(moderatorId, communityId);
      if (!hasPermission) {
        return res
          .status(403)
          .json({ message: "Not authorized to moderate this community." });
      }
    }
    // If communityId is null and it's a global action, you might have a separate global admin check here.

    const log = new ModerationLog({
      communityId, // This can now be null
      moderatorId,
      action,
      targetId,
      reason,
      createdAt: new Date(),
    });

    await log.save();

    // --- Real-Time Requirement: moderation:log:created ---
    if (ioInstance) {
      // Determine the target room for moderation logs
      // If communityId exists, send to that community's room (for mods of that community)
      // Otherwise, send to a general admin/moderation dashboard room (if you have one)
      const targetRoom = communityId
        ? `community:${communityId}`
        : "admin:dashboard_logs"; // Example global admin room

      ioInstance.to(targetRoom).emit("moderation:log:created", {
        logId: log._id,
        communityId: log.communityId, // Will be null for global actions
        moderatorId: log.moderatorId,
        action: log.action,
        targetId: log.targetId,
        reason: log.reason,
        createdAt: log.createdAt,
        message:
          `New moderation action: ${log.action}` +
          (log.communityId
            ? ` in community ${log.communityId.name || log.communityId}`
            : ""),
      });

      // Also, notify individual admins/mods who are online and interested in this log.
      // This logic depends on how you identify and target all relevant administrators.
      // For community-specific logs, all community owners/mods could get a notification count update.
      if (communityId) {
        const community = await Community.findById(communityId)
          .select("owners moderators")
          .lean();
        if (community) {
          const adminAndModIds = new Set([
            ...(community.owners || []).map((id) => id.toString()),
            ...(community.moderators || []).map((id) => id.toString()),
          ]);
          adminAndModIds.forEach((id) => {
            if (onlineUsersMap && onlineUsersMap.has(id)) {
              ioInstance.to(`user:${id}`).emit("notification:count:update");
            }
          });
        }
      } else {
        // For global logs, you'd need to identify all global admins and send them a notification count update.
        // Example: Fetch all users with role 'admin' and iterate `ioInstance.to(`user:${adminId}`).emit('notification:count:update');`
      }
    }

    return res
      .status(201)
      .json({ message: "Moderation log created.", logId: log._id });
  } catch (error) {
    console.error("Create moderation log error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * List moderation logs for a community (admin/mod only)
 * Query: ?communityId=&action=&moderatorId=&limit=&fromDate=&toDate=
 */
const listLogs = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      communityId,
      action,
      moderatorId,
      limit = 50,
      fromDate,
      toDate,
    } = req.query;

    // If communityId is provided, validate it. If not, it means listing global logs.
    if (communityId && !mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ message: "Invalid community ID." });
    }

    // Permission check for viewing logs
    // If communityId is provided, check if user is admin/mod of that community.
    // If communityId is NOT provided, assume it's a request for global logs,
    // which would typically require a platform-level 'admin' role.
    let hasPermission = false;
    if (communityId) {
      hasPermission = await isCommunityAdmin(userId, communityId);
    } else {
      // For global logs, check if the user has a global admin role
      hasPermission = req.user.role === "admin"; // Assuming 'admin' role in req.user
    }

    if (!hasPermission) {
      return res
        .status(403)
        .json({ message: "Not authorized to view these logs." });
    }

    const query = {};
    if (communityId) query.communityId = communityId;
    else query.communityId = null; // Explicitly query for logs without a communityId if global fetch

    if (action) query.action = action;
    if (moderatorId) query.moderatorId = moderatorId;

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    const logs = await ModerationLog.find(query)
      .populate("moderatorId", "username name avatarUrl")
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit), 100));

    return res.json({ logs });
  } catch (error) {
    console.error("List moderation logs error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

// --- EXPORT ALL FUNCTIONS ---
module.exports = {
  setIoInstance,
  createLog,
  listLogs,
  createLogInternal
  // Add other functions if you have them and want to export
};
