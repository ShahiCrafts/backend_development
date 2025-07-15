const MembershipRequest = require("../models/membershipRequestModel");
const Community = require("../models/communityModel");
const mongoose = require("mongoose");

let io; // Declare io variable
exports.setIoInstance = (socketIoInstance) => {
  io = socketIoInstance;
};

/**
 * Helper: Check if user is owner or moderator of community
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
 * User requests to join a community
 * Body: { communityId }
 */
exports.requestMembership = async (req, res) => {
  try {
    const userId = req.user._id;
    const { communityId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ message: "Invalid community ID." });
    }

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: "Community not found." });
    }

    // Check if user is already a member
    if (community.members.some((id) => id.equals(userId))) {
      return res
        .status(409)
        .json({ message: "You are already a member of this community." });
    }

    // Check if user already has a pending request
    const existingRequest = await MembershipRequest.findOne({
      communityId,
      userId,
      status: "pending",
    });
    if (existingRequest) {
      return res
        .status(409)
        .json({ message: "You already have a pending membership request." });
    }

    // Create membership request
    const membershipRequest = new MembershipRequest({
      communityId,
      userId,
      status: "pending",
      requestedAt: new Date(),
    });

    await membershipRequest.save();

    if (io) {
      // Emit to all community owners/moderators
      const adminAndModIds = [...community.owners, ...community.moderators].map(
        (id) => id.toString()
      );
      // It's more efficient to emit to the community room, assuming owners/mods are in it
      io.to(`community:${communityId}`).emit("membership:request:new", {
        requestId: membershipRequest._id,
        communityId: community._id,
        communityName: community.name,
        requestingUserId: userId,
        requestedAt: membershipRequest.requestedAt,
        message: `New membership request for ${community.name} from a user.`,
      });
      // Also notify each individual owner/mod (if they are online)
      adminAndModIds.forEach((id) => {
        io.to(`user:${id}`).emit("notification:count:update");
      });
    }

    return res.status(201).json({ message: "Membership request submitted." });
  } catch (error) {
    console.error("Request membership error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * Admin/moderator lists membership requests for their community
 * Query params: ?communityId=
 */
exports.listMembershipRequests = async (req, res) => {
  try {
    const userId = req.user._id;
    const { communityId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ message: "Invalid community ID." });
    }

    // Check if user is admin/mod for this community
    const canManage = await isCommunityAdmin(userId, communityId);
    if (!canManage) {
      return res
        .status(403)
        .json({ message: "Not authorized to view membership requests." });
    }

    const requests = await MembershipRequest.find({
      communityId,
      status: "pending",
    })
      .populate("userId", "username name avatarUrl")
      .sort({ requestedAt: 1 });

    return res.json({ requests });
  } catch (error) {
    console.error("List membership requests error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * Admin/moderator approves or rejects membership request
 * Params: requestId
 * Body: { action: 'approve' | 'reject', reviewNote? }
 */
exports.reviewMembershipRequest = async (req, res) => {
  try {
    const reviewerId = req.user._id;
    const { requestId } = req.params;
    const { action, reviewNote = "" } = req.body;

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "Invalid action." });
    }

    const request = await MembershipRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Membership request not found." });
    }

    const community = await Community.findById(request.communityId).select(
      "members owners moderators name"
    );
    if (!community) {
      return res.status(404).json({ message: "Community not found." });
    }

    // Check admin/moderator rights on the community
    const canManage = await isCommunityAdmin(reviewerId, request.communityId);
    if (!canManage) {
      return res
        .status(403)
        .json({ message: "Not authorized to review this request." });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request already reviewed." });
    }

    const requestedUserId = request.userId._id.toString();

    if (action === "approve") {
      if (!community.members.some((id) => id.equals(requestedUserId))) {
        community.members.push(requestedUserId);
        community.stats.membersCount = (community.stats.membersCount || 0) + 1;
        await community.save();
        // If user was just added, make their socket join the community room immediately if online
        const userSocketId = onlineUsers.get(requestedUserId);
        if (userSocketId) {
          const userSocket = io.sockets.sockets.get(userSocketId);
          if (userSocket) {
            userSocket.join(`community:${community._id.toString()}`);
            console.log(
              `User ${requestedUserId} (socket: ${
                userSocket.id
              }) joined community room ${community._id.toString()} upon approval.`
            );
          }
        }
      }
      request.status = "approved";

      // Real-Time Requirement: membership:request:approved
      if (io) {
        io.to(`user:${requestedUserId}`).emit("membership:request:approved", {
          requestId: request._id,
          communityId: community._id,
          communityName: community.name,
          message: `Your request to join "${community.name}" has been approved!`,
        });
        io.to(`user:${requestedUserId}`).emit("notification:count:update");
      }
      // Real-Time Requirement: moderation:log:created
      if (io) {
        io.emit("moderation:log:created", {
          communityId: community._id,
          moderatorId: reviewerId,
          action: "membership_approved",
          targetId: requestedUserId,
          reason: `Membership approved for user ${request.userId.fullName}.`,
        });
      }
    } else {
      // action === 'reject'
      request.status = "rejected";
      // Real-Time Requirement: membership:request:rejected
      if (io) {
        io.to(`user:${requestedUserId}`).emit("membership:request:rejected", {
          requestId: request._id,
          communityId: community._id,
          communityName: community.name,
          note:
            reviewNote || "Your request to join this community was rejected.",
        });
        io.to(`user:${requestedUserId}`).emit("notification:count:update");
      }
      // Real-Time Requirement: moderation:log:created
      if (io) {
        io.emit("moderation:log:created", {
          communityId: community._id,
          moderatorId: reviewerId,
          action: "membership_rejected",
          targetId: requestedUserId,
          reason: `Membership rejected for user ${request.userId.fullName}: ${reviewNote}`,
        });
      }
    }

    request.reviewedAt = new Date();
    request.reviewedBy = reviewerId;
    request.reviewNote = reviewNote;

    await request.save();

    return res.json({ message: `Membership request ${action}d successfully.` });
  } catch (error) {
    console.error("Review membership request error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * User cancels their own pending membership request
 * Params: requestId
 */
exports.cancelMembershipRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const { requestId } = req.params;

    const request = await MembershipRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Membership request not found." });
    }

    if (!request.userId.equals(userId)) {
      return res
        .status(403)
        .json({ message: "Not authorized to cancel this request." });
    }

    if (request.status !== "pending") {
      return res
        .status(400)
        .json({ message: "Only pending requests can be cancelled." });
    }

    await MembershipRequest.deleteOne({ _id: requestId });

    return res.json({ message: "Membership request cancelled." });
  } catch (error) {
    console.error("Cancel membership request error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};
