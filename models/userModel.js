const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({

    username: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },

    password: {
        type: String,
        select: false,
    },

    googleId: {
        type: String,
        index: true
    },

    role: {
        type: String,
        enum: ['citizen', 'admin', 'official'],
        default: 'public',
    },

    emailVerified: {
        type: Boolean,
        default: false,
    },

    isBanned: {
        type: Boolean,
        default: false,
    },

    isActive: {
        type: Boolean,
        default: true,
    },

    notificationPreferences: {
        email: { type: Boolean, default: true },
        inApp: { type: Boolean, default: true },
    },

    ogdPoints: {
        type: Number,
        default: 0,
    },

    bio: {
        type: String,
        maxlength: 300,
    },

    location: String,

    profileImage: {
        type: String,
        default: '',
    },

    lastLogin: Date,
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
