const express = require('express');
const router = express.Router();

const { verifyToken } = require("../../middleware/userAuthorization");
const { register, login, logout } = require('../../controllers/users/authController');
const { sendVerificationCode, verifyCode } = require('../../controllers/users/emailController');

router.post('/register', register);
router.post('/login', login);
router.post('/send-verification-code', sendVerificationCode);
router.post('/verify-code', verifyCode)

router.post('/logout', verifyToken, logout)

module.exports = router;