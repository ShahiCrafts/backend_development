const mongoose = require('mongoose');
const { Schema, model, Types } = mongoose;

const CommunitySchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100,
  },

  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },

  description: {
    type: String,
    maxlength: 1000,
    default: '',
  },

  avatarUrl: {
    type: String,
    default: '',
  },
  bannerUrl: {
    type: String,
    default: '',
  },

  category: {
    type: String,
    required: true,
    enum: ['Neighborhood', 'Interest', 'Issue', 'Event', 'Public'], // extend as needed
  },

  owners: [{
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  }],

  moderators: [{
    type: Types.ObjectId,
    ref: 'User',
  }],

  members: [{
    type: Types.ObjectId,
    ref: 'User',
  }],

  privacy: {
    type: String,
    enum: ['public', 'private', 'invite-only'],
    default: 'public',
  },

  rules: [{
    type: String,
  }],

  tags: [{
    type: String,
    lowercase: true,
    trim: true,
  }],

  stats: {
    postsCount: { type: Number, default: 0 },
    membersCount: { type: Number, default: 0 },
    eventsCount: { type: Number, default: 0 },
    pollsCount: { type: Number, default: 0 },
  },

  settings: {
    allowPosts: { type: Boolean, default: true },
    allowComments: { type: Boolean, default: true },
    allowMediaUploads: { type: Boolean, default: true },
    moderationRequired: { type: Boolean, default: false },
    notificationSettings: {
      emailNotifications: { type: Boolean, default: true },
      pushNotifications: { type: Boolean, default: true },
    }
  },

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'archived'],
    default: 'pending',
    index: true,
  },

}, {
  timestamps: true,
});

CommunitySchema.index({
  name: 'text',
  description: 'text',
  tags: 'text',
});

module.exports = model('Community', CommunitySchema);
