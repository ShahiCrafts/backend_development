const mongoose = require("mongoose");
const { Schema, model, Types } = mongoose;

const ModerationLogSchema = new Schema(
  {
    communityId: {
      type: Types.ObjectId,
      ref: "Community",
      required: false,
      index: true,
    },
    moderatorId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      enum: [
        "post_removed",
        "post_approved",
        "comment_removed",
        "user_banned",
        "user_warned",
        "community_approved",
        "community_creation_requested",
        "community_rejected",
        "membership_approved",
        "membership_rejected",
        "invitation_sent",
        "invitation_accepted",
        "invitation_declined",
        // add more as needed
      ],
      required: true,
    },
    targetId: {
      type: Types.ObjectId,
      // Can refer to a post, comment, user, or community depending on action
    },
    reason: {
      type: String,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

module.exports = model("ModerationLog", ModerationLogSchema);
