const Follow = require('../../models/followModel');
const User = require('../../models/userModel');

let _io;

exports.setIoInstance = (ioInstance) => {
  _io = ioInstance;
};

exports.followUser = async (req, res) => {
  try {
    if (!_io) {
      console.warn("Socket.IO instance not set in followController.");
    }

    const followerId = req.user.id;
    const followingId = req.params.id;

    if (followerId === followingId) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself.' });
    }

    const userToFollow = await User.findById(followingId);
    if (!userToFollow) {
      return res.status(404).json({ success: false, message: 'User to follow not found.' });
    }

    const existingFollow = await Follow.findOne({ follower: followerId, following: followingId });
    if (existingFollow) {
      return res.status(409).json({ success: false, message: 'You are already following this user.' });
    }

    const newFollow = await Follow.create({
      follower: followerId,
      following: followingId
    });

    await newFollow.populate('follower', 'fullName profileImage')
                   .populate('following', 'fullName profileImage');

    if (_io) {
      _io.to(followingId.toString()).emit("user:newFollower", {
        followerId: followerId,
        followerFullName: newFollow.follower.fullName,
        followerProfileImage: newFollow.follower.profileImage,
        followingId: followingId,
        message: `${newFollow.follower.fullName} started following you.`,
        timestamp: new Date()
      });

      _io.to(followerId.toString()).emit("user:followingStatusUpdate", {
        targetUserId: followingId,
        targetUserFullName: newFollow.following.fullName,
        isFollowing: true,
        message: `You are now following ${newFollow.following.fullName}.`,
        timestamp: new Date()
      });
    }

    res.status(201).json({ success: true, message: 'User followed successfully.', data: newFollow });
  } catch (error) {
    console.error('Error following user:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'You are already following this user.' });
    }
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.unfollowUser = async (req, res) => {
  try {
    if (!_io) {
      console.warn("Socket.IO instance not set in followController.");
    }

    const followerId = req.user.id;
    const followingId = req.params.id;

    const followToDelete = await Follow.findOne({ follower: followerId, following: followingId })
      .populate('follower', 'fullName profileImage')
      .populate('following', 'fullName profileImage');

    if (!followToDelete) {
      return res.status(404).json({ success: false, message: 'You are not following this user.' });
    }

    const deleteResult = await Follow.deleteOne({
      follower: followerId,
      following: followingId
    });

    if (deleteResult.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'You are not following this user.' });
    }

    if (_io) {
      _io.to(followingId.toString()).emit("user:unfollowed", {
        followerId: followerId,
        followerFullName: followToDelete.follower.fullName,
        followingId: followingId,
        message: `${followToDelete.follower.fullName} unfollowed you.`,
        timestamp: new Date()
      });

      _io.to(followerId.toString()).emit("user:followingStatusUpdate", {
        targetUserId: followingId,
        targetUserFullName: followToDelete.following.fullName,
        isFollowing: false,
        message: `You have unfollowed ${followToDelete.following.fullName}.`,
        timestamp: new Date()
      });
    }

    res.status(200).json({ success: true, message: 'User unfollowed successfully.' });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getFollowing = async (req, res) => {
  try {
    const userId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const followingRelations = await Follow.find({ follower: userId })
      .populate({
        path: 'following',
        select: '-password -__v -emailVerified -isBanned -isActive'
      })
      .skip(skip)
      .limit(limit);

    const followingUsers = followingRelations.map(rel => rel.following);
    const totalFollowing = await Follow.countDocuments({ follower: userId });

    res.status(200).json({
      success: true,
      count: followingUsers.length,
      total: totalFollowing,
      page,
      pages: Math.ceil(totalFollowing / limit),
      data: followingUsers
    });
  } catch (error) {
    console.error('Error fetching following list:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getFollowers = async (req, res) => {
  try {
    const userId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const followerRelations = await Follow.find({ following: userId })
      .populate({
        path: 'follower',
        select: '-password -__v -emailVerified -isBanned -isActive'
      })
      .skip(skip)
      .limit(limit);

    const followers = followerRelations.map(rel => rel.follower);
    const totalFollowers = await Follow.countDocuments({ following: userId });

    res.status(200).json({
      success: true,
      count: followers.length,
      total: totalFollowers,
      page,
      pages: Math.ceil(totalFollowers / limit),
      data: followers
    });
  } catch (error) {
    console.error('Error fetching followers list:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.checkFollowingStatus = async (req, res) => {
  try {
    const followerId = req.user.id;
    const targetUserId = req.params.id;

    const isFollowing = await Follow.exists({ follower: followerId, following: targetUserId });

    res.status(200).json({ success: true, isFollowing: !!isFollowing });
  } catch (error) {
    console.error('Error checking following status:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
