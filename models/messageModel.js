const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  conversationType: {
    type: String,
    enum: ["group", "personal"],
    required: true,
    index: true,
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  text: { type: String, required: true, maxlength: 2000 },
  attachments: [
    {
      url: String,
      type: String,
      name: String,
      size: Number,
    }
  ],
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false },
}, {
  timestamps: true,
});

MessageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model("Message", MessageSchema);
