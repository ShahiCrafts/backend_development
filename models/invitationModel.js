const mongoose = require("mongoose");
const { Schema, model, Types } = mongoose;

const InvitationSchema = new Schema({
  communityId: {
    type: Types.ObjectId,
    ref: 'Community',
    required: true,
    index: true,
  },
  invitedUserId: {
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  invitedByUserId: {
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending',
    index: true,
  },
  invitedAt: {
    type: Date,
    default: Date.now,
  },
  respondedAt: Date,
  responseNote: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

InvitationSchema.index({ communityId: 1, invitedUserId: 1 }, { unique: true });

module.exports = model('Invitation', InvitationSchema);
