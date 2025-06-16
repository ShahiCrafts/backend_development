const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends a styled HTML email with a verification code.
 *
 * @param {string} toEmail - Recipient Email Address
 * @param {string} code - Verification code to send
 */
const sendVerificationEmail = async (toEmail, code) => {
  try {
    const expiryMinutes = parseInt(process.env.CODE_EXPIRY_MINUTES || '15', 10);

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: toEmail,
      subject: 'Verify your email address',
      text: `Your verification code is: ${code}. It will expire in ${expiryMinutes} minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #333;">Verify your email address</h2>
          <p style="font-size: 16px; color: #555;">
            Thank you for signing up with <strong>Ongo Desk</strong>.
            Please use the following verification code to continue:
          </p>
          <div style="font-size: 24px; font-weight: bold; letter-spacing: 2px; padding: 10px 20px; background-color: #f1f1f1; color: #000; width: fit-content; margin: 20px auto; border-radius: 6px;">
            ${code}
          </div>
          <p style="font-size: 14px; color: #888;">
            This code will expire in ${expiryMinutes} minutes. If you did not request this, please ignore this email.
          </p>
          <p style="font-size: 14px; color: #aaa;">
            Ongo Desk Teams & Co.
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw new Error('Failed to send verification email.');
  }
};

module.exports = sendVerificationEmail;
