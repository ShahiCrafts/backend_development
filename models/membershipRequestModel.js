const mongoose = require("mongoose");
const { Schema, model, Types } = mongoose;

const MembershipRequestSchema = new Schema(
  {
    communityId: {
      type: Types.ObjectId,
      ref: "Community",
      required: true,
      index: true,
    },
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedAt: Date,
    reviewedBy: {
      type: Types.ObjectId,
      ref: "User",
    },
    reviewNote: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

MembershipRequestSchema.index({ communityId: 1, userId: 1 }, { unique: true });

module.exports = model("MembershipRequest", MembershipRequestSchema);
