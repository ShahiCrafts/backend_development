const User = require('../../models/userModel');
const Post = require('../../models/PostModel');
const Session = require('../../models/sessionModel');
const bcrypt = require('bcryptjs');

exports.getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

exports.updateUserProfile = async (req, res) => {
    try {
        const userId = req.params.id;
        const { fullName, bio, location, profileImage, notificationPreferences } = req.body;
        const updateFields = {};
        if (fullName) updateFields.fullName = fullName;
        if (bio) updateFields.bio = bio;
        if (location) updateFields.location = location;
        if (profileImage) updateFields.profileImage = profileImage;
        if (notificationPreferences) updateFields.notificationPreferences = notificationPreferences;

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateFields,
            { new: true, runValidators: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({ success: true, message: 'Profile updated successfully', data: updatedUser });
    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        console.error('Error updating user profile:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// exports.toggleUserBanStatus = async (req, res) => {
//     try {
//         const userId = req.params.id;
//         const user = await User.findById(userId);

//         if (!user) {
//             return res.status(404).json({ success: false, message: 'User not found' });
//         }

//         user.isBanned = !user.isBanned;
//         user.isActive = !user.isBanned;

//         await user.save();

//         res.status(200).json({
//             success: true,
//             message: `User ${user.username} has been ${user.isBanned ? 'banned' : 'unbanned'}`,
//             data: {
//                 _id: user._id,
//                 username: user.username,
//                 isBanned: user.isBanned,
//                 isActive: user.isActive
//             }
//         });
//     } catch (error) {
//         console.error('Error toggling user ban status:', error);
//         res.status(500).json({ success: false, message: 'Server error', error: error.message });
//     }
// };

exports.deleteUserProfile = async (req, res) => {
    try {
        const userId = req.params.id;
        const deletedUser = await User.findByIdAndDelete(userId);

        if (!deletedUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        await Post.deleteMany({ user: userId });
        await Session.deleteMany({ user: userId });

        res.status(200).json({ success: true, message: 'User and associated data deleted successfully', data: deletedUser });
    } catch (error) {
        console.error('Error deleting user profile:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const userId = req.params.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Please provide current and new passwords' });
        }

        const user = await User.findById(userId).select('+password');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Current password incorrect' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.lastLogin = new Date();

        await user.save();

        await Session.updateMany({ user: userId, _id: { $ne: req.session._id } }, { isActive: false });

        res.status(200).json({ success: true, message: 'Password updated successfully. Other sessions invalidated.' });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

exports.getUserPosts = async (req, res) => {
    try {
        const userId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const query = { authorId: userId };

        if (req.query.type) {
            query.type = req.query.type;
        }

        // Dynamically add 'status' to the query if it exists in req.query
        // This is useful for filtering reports by 'ACTIVE', 'UNDER_REVIEW', 'ACTION_TAKEN', etc.
        if (req.query.status) {
            // If you might send multiple statuses (e.g., status=ACTIVE,CLOSED)
            // you'd parse it:
            // if (Array.isArray(req.query.status)) {
            //     query.status = { $in: req.query.status };
            // } else {
                query.status = req.query.status;
            // }
        }

        // --- DEBUG START ---
        console.log('Backend: getUserPosts - Final Mongoose query:', query);
        // --- DEBUG END ---

        const userPosts = await Post.find(query) // Use the dynamic 'query' object
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalPosts = await Post.countDocuments(query); // Use the same dynamic 'query' object for count

        res.status(200).json({
            success: true,
            count: userPosts.length,
            total: totalPosts,
            page,
            pages: Math.ceil(totalPosts / limit),
            data: userPosts
        });
    } catch (error) {
        console.error('Error fetching user posts:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

exports.getUserAchievements = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId).select('achievements');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({ success: true, data: user.achievements || [] });
    } catch (error) {
        console.error('Error fetching user achievements:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

exports.getUserActiveSessions = async (req, res) => {
    try {
        const userId = req.params.id;
        const sessions = await Session.find({ user: userId, isActive: true }).select('-token');

        if (!sessions) {
            return res.status(404).json({ success: false, message: 'No active sessions found for this user.' });
        }

        res.status(200).json({ success: true, count: sessions.length, data: sessions });
    } catch (error) {
        console.error('Error fetching active sessions:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

exports.logoutUserFromAllDevices = async (req, res) => {
    try {
        const userId = req.params.id;
        await Session.updateMany({ user: userId }, { isActive: false });

        res.status(200).json({
            success: true,
            message: 'All active sessions for this user have been invalidated.'
        });
    } catch (error) {
        console.error('Error logging out from all devices:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

exports.revokeSpecificSession = async (req, res) => {
    try {
        const { userId, sessionId } = req.params;
        const session = await Session.findOne({ _id: sessionId, user: userId });

        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found or does not belong to this user.' });
        }

        session.isActive = false;
        await session.save();

        res.status(200).json({ success: true, message: 'Session successfully revoked.' });
    } catch (error) {
        console.error('Error revoking specific session:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};
