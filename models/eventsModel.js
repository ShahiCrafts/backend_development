const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    dateTime: {
      type: Date,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['Cleanup Drive', 'Festival', 'Community Meeting', 'Workshop', 'Public Hearing'],
      required: true,
    },
    
    description: {
        type: String,
        required: true
    },
    status: {
      type: String,
      enum: ['Upcoming', 'Past', 'Canceled'],
      default: 'Upcoming',
    },
    coverImage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Event', EventSchema);
