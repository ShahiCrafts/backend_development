const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required.'],
      minlength: [5, 'Title must be at least 5 characters long.'],
      maxlength: [100, 'Title cannot be more than 100 characters long.'],
      trim: true,
    },
    author: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: [true, 'Content is required.'],
      minlength: [20, 'Content must be at least 20 characters long.'],
    },
    category: {
      type: String,
      required: [true, 'Category is required.'],
      enum: {
        values: ['Community News', 'Traffic Alert', 'Public Notice', 'System Update'],
        message: '{VALUE} is not a supported category.',
      },
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

announcementSchema.pre('save', function (next) {
  const textContent = this.content.replace(/<[^>]*>?/gm, '').trim();
  if (textContent.length < 20) {
    return next(new Error('Content must contain at least 20 characters of text.'));
  }
  next();
});

const Announcement = mongoose.model('Announcement', announcementSchema);

module.exports = Announcement;
