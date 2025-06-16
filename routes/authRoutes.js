const express = require('express');
const router = express.Router();

const { register, login } = require('../controllers/authController');
const { sendVerificationCode, verifyCode } = require('../controllers/emailController');

router.post('/register', register);
router.post('/login', login);
router.post('/send-verification-code', sendVerificationCode);
router.post('/verify-code', verifyCode)

module.exports = router;