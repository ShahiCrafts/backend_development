const mongoose = require('mongoose');

const tokenBlacklistSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
  },

  expireAt: {
    type: Date,
    required: true,
    expires: 0,
  },
});

module.exports = mongoose.model('TokenBlacklist', tokenBlacklistSchema);