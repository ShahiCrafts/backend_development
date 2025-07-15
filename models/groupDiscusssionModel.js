const mongoose = require("mongoose"); // Use require for consistency

const GroupDiscussionSchema = new mongoose.Schema({
  discussionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Post",
    required: true,
    index: true,
    unique: true
  },
  description: { type: String, trim: true, maxlength: 500 },
  participants: [
    { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    }
  ],
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

GroupDiscussionSchema.index({ participants: 1 });

// Use module.exports instead of export default
module.exports = mongoose.model("GroupDiscussion", GroupDiscussionSchema);