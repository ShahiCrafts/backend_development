const Invitation = require("../models/invitationModel");
const Community = require("../models/communityModel");
const mongoose = require("mongoose");

let io; // Declare io variable
exports.setIoInstance = (socketIoInstance) => {
  io = socketIoInstance;
};

async function isCommunityAdmin(userId, communityId) {
  const community = await Community.findById(communityId);
  if (!community) return false;

  return (
    community.owners.some((id) => id.equals(userId)) ||
    community.moderators.some((id) => id.equals(userId))
  );
}

exports.sendInvitation = async (req, res) => {
  try {
    const { communityId, invitedUserId } = req.body;
    const senderId = req.user._id;

    if (
      !mongoose.Types.ObjectId.isValid(communityId) ||
      !mongoose.Types.ObjectId.isValid(invitedUserId)
    ) {
      return res.status(400).json({ message: "Invalid community or user ID." });
    }

    // Check if requester is owner/moderator
    const canInvite = await isCommunityAdmin(senderId, communityId);
    if (!canInvite) {
      return res.status(403).json({
        message: "Not authorized to send invitations for this community.",
      });
    }

    // Prevent sending invitation to self
    if (invitedUserId === senderId.toString()) {
      return res.status(400).json({ message: "Cannot invite yourself." });
    }

    // Check if invitation already exists
    const existingInvite = await Invitation.findOne({
      communityId,
      invitedUserId,
      status: { $in: ["pending", "accepted"] },
    });
    if (existingInvite) {
      return res
        .status(409)
        .json({ message: "User already invited or is a member." });
    }

    // Create invitation
    const invitation = new Invitation({
      communityId,
      invitedUserId,
      invitedByUserId: senderId,
      status: "pending",
      invitedAt: new Date(),
    });

    await invitation.save();

    if (io) {
      io.to(`user:${invitedUserId}`).emit("invitation:sent", {
        invitationId: invitation._id,
        communityId: community._id,
        communityName: community.name,
        invitedBy: req.user.fullName, // Assuming req.user has fullName
        message: `You've been invited to join the community "${community.name}"!`,
      });
      io.to(`user:${invitedUserId}`).emit("notification:count:update");
    }

    return res.status(201).json({ message: "Invitation sent successfully." });
  } catch (error) {
    console.error("Send invitation error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * List invitations for current user
 */
exports.listUserInvitations = async (req, res) => {
  try {
    const userId = req.user._id;

    const invitations = await Invitation.find({
      invitedUserId: userId,
      status: "pending",
    })
      .populate("communityId", "name slug avatarUrl")
      .populate("invitedByUserId", "username name");

    return res.json({ invitations });
  } catch (error) {
    console.error("List user invitations error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * Respond to an invitation (accept or decline)
 * Params: invitationId
 * Body: { action: 'accept' | 'decline' }
 */
exports.respondToInvitation = async (req, res) => {
  try {
    const { invitationId } = req.params;
    const { action } = req.body;
    const userId = req.user._id;

    if (!["accept", "decline"].includes(action)) {
      return res.status(400).json({ message: "Invalid action." });
    }

    const invitation = await Invitation.findById(invitationId)
      .populate("communityId", "name members owners moderators") // Populate to get community details
      .populate("invitedByUserId", "fullName _id"); // Populate inviter details
    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found." });
    }

    if (!invitation.invitedUserId.equals(userId)) {
      return res
        .status(403)
        .json({ message: "Not authorized to respond to this invitation." });
    }

    if (invitation.status !== "pending") {
      return res.status(400).json({ message: "Invitation already responded." });
    }

    const community = invitation.communityId; // Already populated
    const inviterId = invitation.invitedByUserId._id.toString();
    const userName = req.user.fullName; // User responding to invite

    if (action === "accept") {
      invitation.status = "accepted";
      invitation.respondedAt = new Date();

      if (!community.members.some((id) => id.equals(userId))) {
        community.members.push(userId);
        community.stats.membersCount = (community.stats.membersCount || 0) + 1;
        await community.save();
        // If user was just added, make their socket join the community room immediately if online
        const userSocketId = onlineUsers.get(userId.toString());
        if (userSocketId) {
          const userSocket = io.sockets.sockets.get(userSocketId);
          if (userSocket) {
            userSocket.join(`community:${community._id.toString()}`);
            console.log(
              `User ${userId} (socket: ${
                userSocket.id
              }) joined community room ${community._id.toString()} upon accepting invite.`
            );
          }
        }
      }

      // Real-Time Requirement: invitation:accepted
      if (io) {
        io.to(`user:${inviterId}`).emit("invitation:accepted", {
          invitationId: invitation._id,
          communityId: community._id,
          communityName: community.name,
          acceptedByUserId: userId,
          acceptedByUserName: userName,
          message: `${userName} accepted your invitation to "${community.name}"!`,
        });
        io.to(`user:${inviterId}`).emit("notification:count:update");
      }
      // Real-Time Requirement: moderation:log:created
      if (io) {
        io.emit("moderation:log:created", {
          // Assuming admins/mods get all moderation logs
          communityId: community._id,
          moderatorId: inviterId, // The inviter is the "moderator" in this context
          action: "invitation_accepted",
          targetId: userId,
          reason: `User ${userName} accepted invitation to community ${community.name}.`,
        });
      }
    } else {
      // action === 'decline'
      invitation.status = "declined";
      invitation.respondedAt = new Date();

      // Real-Time Requirement: invitation:declined
      if (io) {
        io.to(`user:${inviterId}`).emit("invitation:declined", {
          invitationId: invitation._id,
          communityId: community._id,
          communityName: community.name,
          declinedByUserId: userId,
          declinedByUserName: userName,
          message: `${userName} declined your invitation to "${community.name}".`,
        });
        io.to(`user:${inviterId}`).emit("notification:count:update");
      }
      // Real-Time Requirement: moderation:log:created
      if (io) {
        io.emit("moderation:log:created", {
          communityId: community._id,
          moderatorId: inviterId,
          action: "invitation_declined",
          targetId: userId,
          reason: `User ${userName} declined invitation to community ${community.name}.`,
        });
      }
    }

    await invitation.save();

    return res.json({ message: `Invitation ${action}d successfully.` });
  } catch (error) {
    console.error("Respond to invitation error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * List all invitations for a community (admin/moderators only)
 * Params: communityId
 */
exports.listCommunityInvitations = async (req, res) => {
  try {
    const { communityId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ message: "Invalid community ID." });
    }

    const canView = await isCommunityAdmin(userId, communityId);
    if (!canView) {
      return res.status(403).json({
        message: "Not authorized to view invitations for this community.",
      });
    }

    const invitations = await Invitation.find({ communityId })
      .populate("invitedUserId", "username name avatarUrl")
      .populate("invitedByUserId", "username name")
      .sort({ invitedAt: -1 });

    return res.json({ invitations });
  } catch (error) {
    console.error("List community invitations error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};
