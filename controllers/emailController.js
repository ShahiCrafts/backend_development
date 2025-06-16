const crypto = require("crypto");
const EmailVerification = require("../models/emailVerificationModel");
const sendVerificationEmail = require("../utils/sendVerificationEmail");
const bcryptjs = require("bcryptjs");
const User = require("../models/userModel");

/**
 * Initiates email verification by generating and sending code
 *
 * @route POST /auth/send-verification-code
 * @access Public
 */

const sendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ message: "Email is required" });

    const plainCode = crypto.randomInt(100000, 999999).toString();
    const hashedCode = await bcryptjs.hash(plainCode, 10);

    const expiresInMinutes = parseInt(process.env.CODE_EXPIRES_IN || "1", 10);
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    await EmailVerification.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { code: hashedCode, expiresAt },
      { upsert: true, new: true }
    );

    await sendVerificationEmail(email, plainCode);

    return res.status(200).json({
      message: `Verification code sent to ${email}.`,
    });
  } catch (error) {
    console.error("sendVerificationCode error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const verifyCode = async (req, res) => {
  const { email, code } = req.body;

  try {
    if (!email || !code)
      return res.status(400).json({ message: "Email and code are required!" });

    const record = await EmailVerification.findOne({
      email: email.toLowerCase().trim(),
    });
    if (!record)
      return res
        .status(400)
        .json({ message: "No verification request found for this email." });

    const now = new Date();
    if (record.expiresAt < now)
      return res
        .status(400)
        .json({ message: "Verification code has expired." });

    const isMatch = await bcryptjs.compare(code, record.code);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid verification code" });

    record.isVerified = true;

    await record.save();

    res.status(200).json({
      message: "Email verified successfully. You can now continue signing up.",
    });
  } catch (error) {
    console.error("verifyCode error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = {
  sendVerificationCode,
  verifyCode
};
