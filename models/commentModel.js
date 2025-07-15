const mongoose = require("mongoose");
const { Schema } = mongoose;

const commentSchema = new Schema(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorName: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    repliesCount: {
      type: Number,
      default: 0,
    },
    type: {
      type: String,
      enum: ["text", "image", "file"],
      default: "text",
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "Comment",
      default: null, // null = top-level comment
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

module.exports = mongoose.model("Comment", commentSchema);
