// models/reportModel.js (Create this new file)
const mongoose = require("mongoose");
const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true, // Add an index for faster lookups by postId
    },
    reportedBy: { // The user who submitted this specific report
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // The reason for this individual report
    reason: {
      type: String,
      required: true,
    },
    // Categorized type of flag for this individual report
    type: {
      type: String,
      enum: ["Spam", "Offensive", "Misleading", "Harassment", "Hate Speech", "Illegal Content", "Other"],
      required: true,
    },
    // Status of this *individual report*
    status: {
      type: String,
      enum: ["PENDING", "DISMISSED", "RESOLVED"], // Status for the individual report record
      default: "PENDING",
    },
    // Optional: Admin-specific fields for review of *this particular report*
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User", // This would typically be an Admin user ID
    },
    reviewedAt: {
      type: Date,
    },
    adminNotes: {
      type: String,
    },
  },
  {
    timestamps: true, // `createdAt` will be `reportedAt` for this specific report
  }
);

module.exports = mongoose.model("Report", reportSchema);