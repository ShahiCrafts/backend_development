const mongoose = require('mongoose')

const emailVerificationSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    code: {
        type: String,
        required: true,
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    expiresAt: {
        type: Date,
        required: true,
    }
}, { timestamps: true })

module.exports = mongoose.model('EmailVerification', emailVerificationSchema)