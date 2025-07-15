const mongoose = require("mongoose");
const { Schema } = mongoose;

const postSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["Discussion", "Report Issue", "Event", "Poll"],
      required: true,
    },

    authorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    communityId: {
      type: Schema.Types.ObjectId,
      ref: "Community",
      default: null,
    },

    title: { type: String },
    content: { type: String },
    tags: [String],
    attachments: [String],

    // Report Issue specific
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
    },
    priorityLevel: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
    },
    responsibleDepartment: { type: String },
    address: { type: String },
    contactInfo: { type: String },
    expectedResolutionTime: { type: String },

    visibility: {
      type: String,
      enum: ["Public", "Admin"],
      default: "Public",
    },
    publicVisibility: { type: Boolean, default: true },
    allowComments: { type: Boolean, default: true },

    // Event specific
    eventDescription: { type: String },
    eventStartDate: { type: Date },
    eventEndDate: { type: Date },
    locationType: {
      type: String,
      enum: ["Online", "Physical"],
      default: "Online",
    },
    locationDetails: { type: String },
    requireRSVP: { type: Boolean, default: false },
    maxAttendees: { type: Number },
    enableWaitlist: { type: Boolean, default: false },
    sendReminders: { type: Boolean, default: false },

    // Poll specific
    question: { type: String },
    options: [
      {
        label: String,
        votes: { type: Number, default: 0 },
      },
    ],
    pollEndsAt: { type: Date },
    votedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    notifyOnClose: { type: Boolean, default: false },
    allowMultipleSelections: { type: Boolean, default: false },
    status: {
      type: String,
      enum: [
        "ACTIVE",
        "CLOSED",
        "REPORTED",
        "UNDER_REVIEW",
        "ACTION_TAKEN",
        "REPORT_REJECTED",
        "DELETED",
      ],
      default: "ACTIVE",
    },

    totalReportsCounts: {
      type: Number,
      default: 0,
    },

    latestReportReason: {
      type: String,
    },

    latestReportedAt: {
      type: Date,
    },

    // Social Interactions
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
    dislikes: [{ type: Schema.Types.ObjectId, ref: "User" }],
    commentsCount: { type: Number, default: 0 },
    sharesCount: { type: Number, default: 0 },
    sharedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.Post || mongoose.model('Post', postSchema);
