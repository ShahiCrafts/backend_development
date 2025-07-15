const mongoose = require("mongoose");
const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    type: {
      type: String,
      enum: [
        "like_post",
        "dislike_post",
        "comment_post",
        "reply_comment",
        "follow",
        "like_comment",
        "post_mention",
        "comment_mention",
        "admin_announcement",
        "event_reminder",
        "poll_closed",
        "issue_status_update",
      ],
      required: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    entityType: {
      type: String,
      enum: ["Post", "Comment", "User", "Event", "Issue", "Announcement"],
      required: true,
    },
    // NEW: Dedicated title field for the notification
    title: {
      type: String,
      required: true, // Assuming a title is always present for UI display
    },
    // The main message/description of the notification, previously named 'message'
    message: {
      type: String,
      default: null, // Make this optional if title is primary, or adjust usage
    },
    contextPreview: {
      type: String,
      default: null,
    },
    link: {
      type: String,
      default: null,
    },
    read: {
      type: Boolean,
      default: false,
    },
    seen: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipientId: 1, read: 1, seen: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);