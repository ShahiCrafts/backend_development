const User = require('../models/userModel')
const bcryptjs = require('bcryptjs')
const jwt = require('jsonwebtoken')
const EmailVerification = require('../models/emailVerificationModel')

const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRES_IN = '7d'

/**
 * @desc Register a new user
 * @route POST /auth/register
 * @access Public
 */

const register = async (req, res) => {
  try {
    const { email, password, fullName, role } = req.body;

    const emailLower = email.toLowerCase().trim();

    const emailExists = await User.findOne({ email: emailLower });
    if (emailExists)
      return res.status(400).json({ message: 'Account with this email already exists.' });

    const emailRecord = await EmailVerification.findOne({ email: emailLower });
    if (!emailRecord || emailRecord.isVerified !== true)
      return res.status(403).json({
        message: 'Email must be verified before registration.',
      });

    // Hash Password
    const hashedPassword = await bcryptjs.hash(password, 10);

    // Generate unique username
    const baseUsername = fullName.split(' ')[0].toLowerCase();
    const existingUsers = await User.find({ username: new RegExp(`^${baseUsername}\\d*$`, 'i') })
      .select('username')
      .lean();

    let username;
    if (existingUsers.length === 0) {
      username = baseUsername;
    } else {
      const suffixes = existingUsers
        .map((u) => u.username.match(new RegExp(`^${baseUsername}(\\d+)$`)))
        .filter(Boolean)
        .map((match) => parseInt(match[1], 10));
      const maxSuffix = suffixes.length ? Math.max(...suffixes) : 0;
      username = `${baseUsername}${maxSuffix + 1}`;
    }

    const newUser = new User({
      fullName: fullName,
      username: username,
      email: emailLower,
      password: hashedPassword,
      role,
      emailVerified: true,
    });

    try {
      await newUser.save();
    } catch (saveError) {
      console.error('Error saving user:', saveError);
      return res.status(500).json({ message: 'Error saving user.' });
    }

    try {
      await EmailVerification.deleteOne({ email: emailLower });
    } catch (deleteError) {
      console.error('Error deleting email verification record:', deleteError);
      // Proceed without failing registration, or return error if you want strict handling
    }

    let token;
    try {
      token = jwt.sign(
        {
          id: newUser._id,
          role: newUser.role,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
    } catch (tokenError) {
      console.error('Error signing token:', tokenError);
      return res.status(500).json({ message: 'Error generating token.' });
    }

    return res.status(200).json({
      message: 'Account Successfully Created!',
      token,
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        profileImage: newUser.profileImage,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  }
};


const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log('Login attempt:', email);

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    console.log('Found user:', user);

    if (!user) {
      console.log('User not found');
      return res.status(400).json({ message: "User not found! Please sign up.." });
    }

    if (!user.password) {
      console.log('User has no password set');
      return res.status(400).json({ message: "User account has no password set. Please reset password or contact support." });
    }

    if (user.isBanned) {
      console.log('User is banned');
      return res.status(403).json({ message: "Your account has been suspended! Please contact support." });
    }

    const isMatch = await bcryptjs.compare(password, user.password);
    if (!isMatch) {
      console.log('Incorrect password');
      return res.status(401).json({ message: "Password Incorrect!" });
    }

    user.lastLogin = new Date();
    await user.save();

    const payload = {
      userId: user._id,
      role: user.role
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });

    res.status(200).json({
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        email: user.email,
        profileImage: user.profileImage,
      },
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};


module.exports = { register, login }