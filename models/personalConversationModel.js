// models/personalConversationModel.js
const mongoose = require("mongoose");

const PersonalConversationSchema = new mongoose.Schema({
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    }
  ],
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

PersonalConversationSchema.index(
  { participants: 1 },
  {
    unique: true,
    partialFilterExpression: { participants: { $size: 2 } },
  }
);

PersonalConversationSchema.pre("save", function(next) {
  this.participants.sort();
  next();
});

module.exports = mongoose.model("PersonalConversation", PersonalConversationSchema);
