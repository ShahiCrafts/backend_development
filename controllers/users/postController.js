// postController.js
const Post = require("../../models/PostModel");
const Report = require("../../models/reportModel");
const Notification = require("../../models/notificationModel");
const User = require("../../models/userModel");
const Community = require("../../models/communityModel");
const ModerationLog = require("../../models/moderationLogModel");

const mongoose = require("mongoose");

let ioInstance; // Declare a variable to hold the Socket.IO instance
let onlineUsersMap; // We'll need access to the onlineUsers map from socketHandlers

/**
 * Function to set the Socket.IO instance and the onlineUsers map.
 * This should be called once during your application's initialization (e.g., in app.js).
 * @param {object} io - The Socket.IO server instance.
 * @param {Map<string, string>} onlineUsers - A Map of userId to socketId for currently online users.
 */
const setIoInstance = (io, onlineUsers) => {
    ioInstance = io;
    onlineUsersMap = onlineUsers;
};

// Utility to handle common errors for async functions
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Helper to determine the target Socket.IO room for a post.
 * - If the post belongs to a community, it targets 'community:<communityId>'.
 * - Otherwise, it targets 'global:feed' for general/public posts.
 * @param {object} post - The post object, potentially with populated communityId.
 * @returns {string} The Socket.IO room name.
 */
function getPostTargetRoom(post) {
    if (post.communityId && post.communityId._id) {
        return `community:${post.communityId._id.toString()}`;
    }
    // Default room for posts not explicitly tied to a community.
    // Ensure clients subscribe to 'global:feed' if they need these updates.
    return 'global:feed';
}

/**
 * @desc Get all posts (can be filtered by type, community, etc.)
 * @route GET /api/posts
 * @access Public
 */
const getAllPosts = asyncHandler(async (req, res) => {
    const { type, page = 1, limit = 10, communityId } = req.query;
    const filter = {};

    if (type && type !== "All Posts") {
        const typeMap = {
            Events: "Event",
            Polls: "Poll",
            "Reported Issues": "Report Issue",
        };
        if (typeMap[type]) {
            filter.type = typeMap[type];
        }
    }

    if (communityId && mongoose.Types.ObjectId.isValid(communityId)) {
        filter.communityId = communityId;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const posts = await Post.find(filter)
        .populate("authorId", "fullName email profileImage isActive")
        .populate("communityId", "name")
        .populate("categoryId", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

    const totalPosts = await Post.countDocuments(filter);
    const totalPages = Math.ceil(totalPosts / limitNum);

    res.status(200).json({
        posts,
        pagination: {
            currentPage: pageNum,
            totalPages,
            totalPosts,
        },
    });
});

/**
 * @desc Get a single post by ID (with poll stats if it's a poll)
 * @route GET /api/posts/:id
 * @access Public
 */
const getPostById = asyncHandler(async (req, res) => {
    const postId = req.params.id;

    const isPoll = await Post.exists({ _id: postId, type: "Poll" });

    let post;
    if (isPoll) {
        const pollWithStats = await Post.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(postId), type: "Poll" } },
            { $addFields: { totalVotes: { $sum: "$options.votes" } } },
            {
                $addFields: {
                    options: {
                        $map: {
                            input: "$options",
                            as: "option",
                            in: {
                                label: "$$option.label",
                                votes: "$$option.votes",
                                percentage: {
                                    $cond: {
                                        if: { $eq: ["$totalVotes", 0] },
                                        then: 0,
                                        else: { $multiply: [{ $divide: ["$$option.votes", "$totalVotes"] }, 100] },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            { $lookup: { from: "users", localField: "authorId", foreignField: "_id", as: "authorId" } },
            { $unwind: { path: "$authorId", preserveNullAndEmptyArrays: true } },
            { $lookup: { from: "communities", localField: "communityId", foreignField: "_id", as: "communityId" } },
            { $unwind: { path: "$communityId", preserveNullAndEmptyArrays: true } },
            { $lookup: { from: "categories", localField: "categoryId", foreignField: "_id", as: "categoryId" } },
            { $unwind: { path: "$categoryId", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1, type: 1, question: 1, content: 1, options: 1, pollEndsAt: 1, notifyOnClose: 1,
                    allowMultipleSelections: 1, createdAt: 1, totalVotes: 1, status: 1, allowComments: 1,
                    visibility: 1, publicVisibility: 1,
                    authorId: { _id: "$authorId._id", fullName: "$authorId.fullName", email: "$authorId.email", profileImage: "$authorId.profileImage", isActive: "$authorId.isActive" },
                    communityId: { _id: "$communityId._id", name: "$communityId.name" },
                    categoryId: { _id: "$categoryId._id", name: "$categoryId.name" },
                },
            },
        ]);
        post = pollWithStats[0];
    } else {
        post = await Post.findById(postId)
            .populate("authorId", "fullName email profileImage isActive")
            .populate("communityId", "name")
            .populate("categoryId", "name");
    }

    if (!post) return res.status(404).json({ message: "Post not found" });
    res.status(200).json(post);
});

/**
 * @desc Create a new post with possible attachments
 * @route POST /api/posts
 * @access Private
 */
const createPost = asyncHandler(async (req, res) => {
    const attachments = req.files ? req.files.map((file) => file.path) : [];

    const { type, question, options, pollEndsAt, communityId, ...otherBody } = req.body;

    let postData = {
        ...otherBody,
        type,
        attachments,
        authorId: req.user.userId,
    };

    if (communityId && mongoose.Types.ObjectId.isValid(communityId)) {
        postData.communityId = communityId;
        // Ensure user is a member of the community to post
        const communityCheck = await Community.findById(communityId).select('members');
        if (!communityCheck || !communityCheck.members.some(memberId => memberId.equals(req.user.userId))) {
             return res.status(403).json({ message: 'You must be a member to post in this community.' });
        }
    }

    if (type === "Poll") {
        if (!question || !options || options.length < 2 || !pollEndsAt) {
            return res.status(400).json({ message: "Polls require a question, options, and an end date." });
        }
        const formattedOptions = options.map((opt) => ({
            label: opt.label || opt.text,
            votes: opt.votes || 0,
        }));
        Object.assign(postData, { question, options: formattedOptions, pollEndsAt });
    }

    const newPost = new Post(postData);
    const savedPost = await newPost.save();

    // Populate fields for the response and Socket.IO emission
    const populatedPost = await Post.findById(savedPost._id)
        .populate("authorId", "fullName email profileImage isActive")
        .populate("communityId", "name members owners moderators") // Populate members, owners, mods for notification logic
        .populate("categoryId", "name");

    // Increment post count in community stats (if applicable)
    if (populatedPost.communityId) {
        const communityToUpdate = await Community.findById(populatedPost.communityId._id);
        if (communityToUpdate) {
            communityToUpdate.stats.postsCount = (communityToUpdate.stats.postsCount || 0) + 1;
            await communityToUpdate.save();
        }
    }


    // Real-Time Update: "newPost" (retaining original event name)
    if (ioInstance) {
        const targetRoom = getPostTargetRoom(populatedPost);

        ioInstance.to(targetRoom).emit("newPost", populatedPost);
        console.log(`Backend: Emitting 'newPost' for post ID: ${populatedPost._id} in room: ${targetRoom}`);

        // Purpose: Increment notification bell count for relevant users
        if (onlineUsersMap) {
            const authorId = req.user.userId.toString();
            let notifiedUserIds = new Set();

            if (populatedPost.communityId) {
                // For community posts: notify all members (excluding author)
                const communityMembers = new Set([
                    ...(populatedPost.communityId.members || []).map(id => id.toString()),
                    ...(populatedPost.communityId.owners || []).map(id => id.toString()),
                    ...(populatedPost.communityId.moderators || []).map(id => id.toString()),
                ]);
                communityMembers.forEach(memberId => {
                    if (memberId !== authorId) {
                        notifiedUserIds.add(memberId);
                    }
                });
            } else {
                // For global posts: This logic depends on your app's global feed notification strategy.
                // Option: Notify all online users (if global feed is visible to all logged-in users)
                for (let onlineUserId of onlineUsersMap.keys()) {
                    if (onlineUserId !== authorId) {
                        notifiedUserIds.add(onlineUserId);
                    }
                }
                // Alternative: Notify only followers (requires a 'Follow' model/logic)
                // const followers = await Follow.find({ followingId: authorId }).select('followerId').lean();
                // followers.forEach(f => {
                //     if (onlineUsersMap.has(f.followerId.toString())) {
                //         notifiedUserIds.add(f.followerId.toString());
                //     }
                // });
            }

            notifiedUserIds.forEach(targetId => {
                if (onlineUsersMap.has(targetId)) { // Double-check if still online
                    ioInstance.to(`user:${targetId}`).emit('notification:count:update');
                }
            });
        }
    }
    res.status(201).json(populatedPost);
});

/**
 * @desc Update a post, optionally adding attachments, and handle social interactions.
 * @route PUT /api/posts/:id
 * @access Private
 */
const updatePost = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { likes, dislikes, sharesCount, ...otherUpdateData } = req.body;
    const userId = req.user.userId;

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const isAuthor = post.authorId.equals(userId);

    let updateQuery = {};

    const contentModifyingFields = [
        "title", "content", "tags", "attachments", "eventDescription", "eventStartDate", "eventEndDate",
        "locationType", "locationDetails", "requireRSVP", "maxAttendees", "enableWaitlist", "sendReminders",
        "contactInfo", "question", "options", "pollEndsAt", "notifyOnClose", "allowMultipleSelections",
        "visibility", "publicVisibility", "allowComments", "categoryId", "priorityLevel", "responsibleDepartment",
        "address", "expectedResolutionTime", "status",
    ];

    const isModifyingContentOrAdminFields = Object.keys(otherUpdateData).some(
        (key) => contentModifyingFields.includes(key)
    );

    if (isAuthor) {
        for (const key in otherUpdateData) {
            if (
                !["likes", "dislikes", "sharesCount", "commentsCount"].includes(key)
            ) {
                if (
                    key === "options" &&
                    post.type === "Poll" &&
                    Array.isArray(otherUpdateData.options)
                ) {
                    updateQuery.options = otherUpdateData.options.map((opt) => ({
                        label: opt.label || opt.text,
                        votes: opt.votes || 0,
                    }));
                } else {
                    updateQuery[key] = otherUpdateData[key];
                }
            }
        }
    } else if (isModifyingContentOrAdminFields) {
        return res
            .status(403)
            .json({
                message: "Unauthorized to modify core post content or admin-managed fields.",
            });
    }

    // --- Handle Likes (Atomic Update & Notification) ---
    if (likes !== undefined) {
        const isCurrentlyLiked = post.likes.includes(userId);
        const isTargetLiked = likes.includes(userId);

        if (isTargetLiked && !isCurrentlyLiked) {
            updateQuery.$addToSet = { ...updateQuery.$addToSet, likes: userId };
            updateQuery.$pull = { ...updateQuery.$pull, dislikes: userId };

            if (!isAuthor) {
                try {
                    const senderUser = await User.findById(userId);
                    const notification = new Notification({
                        recipientId: post.authorId,
                        senderId: userId,
                        type: "like_post",
                        title: `${senderUser?.fullName || "Someone"} liked your post`,
                        message: `"${
                            post.title
                                ? post.title.substring(0, 50) +
                                (post.title.length > 50 ? "..." : "")
                                : "No title available."
                        }"`,
                        entityId: post._id,
                        entityType: "Post",
                        link: `/citizen/posts/${post._id}`,
                    });
                    await notification.save();

                    if (ioInstance) {
                        ioInstance
                            .to(`user:${post.authorId.toString()}`)
                            .emit("newNotification", notification);
                        // Real-Time Requirement: notification:count:update
                        ioInstance.to(`user:${post.authorId.toString()}`).emit('notification:count:update');
                    }
                } catch (notificationErr) {
                    console.error("Backend: ERROR creating/saving like notification:", notificationErr);
                }
            }
        } else if (!isTargetLiked && isCurrentlyLiked) {
            updateQuery.$pull = { ...updateQuery.$pull, likes: userId };
        }
    }

    // --- Handle Dislikes (Atomic Update) ---
    if (dislikes !== undefined) {
        const isCurrentlyDisliked = post.dislikes.includes(userId);
        const isTargetDisliked = dislikes.includes(userId);

        if (isTargetDisliked && !isCurrentlyDisliked) {
            updateQuery.$addToSet = { ...updateQuery.$addToSet, dislikes: userId };
            updateQuery.$pull = { ...updateQuery.$pull, likes: userId };
        } else if (!isTargetDisliked && isCurrentlyDisliked) {
            updateQuery.$pull = { ...updateQuery.$pull, dislikes: userId };
        }
    }

    // --- Handle SharesCount (Direct Update/Increment) ---
    if (sharesCount !== undefined && typeof sharesCount === "number") {
        updateQuery.sharesCount = sharesCount;
    }

    // Clean up empty $addToSet or $pull
    if (updateQuery.$addToSet && Object.keys(updateQuery.$addToSet).length === 0)
        delete updateQuery.$addToSet;
    if (updateQuery.$pull && Object.keys(updateQuery.$pull).length === 0)
        delete updateQuery.$pull;

    if (Object.keys(updateQuery).length === 0) {
        return res.status(200).json(post);
    }

    const updated = await Post.findByIdAndUpdate(id, updateQuery, {
        new: true,
        runValidators: true,
    });

    await updated.populate("authorId", "fullName profileImage isActive");
    await updated.populate("communityId", "name");
    await updated.populate("categoryId", "name");

    // Real-Time Update: "postUpdated" (retaining original event name)
    if (ioInstance) {
        const targetRoom = getPostTargetRoom(updated);
        ioInstance.to(targetRoom).emit("postUpdated", updated);
        console.log(`Backend: Emitting 'postUpdated' for post ID: ${updated._id} in room: ${targetRoom}`);
    }
    res.status(200).json(updated);
});

/**
 * @desc Delete a post
 * @route DELETE /api/posts/:id
 * @access Private
 */
const deletePost = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    const userFullName = req.user.fullName;
    const userRole = req.user.role;

    const post = await Post.findById(id).populate('communityId', 'name owners moderators');
    if (!post) return res.status(404).json({ message: "Post not found" });

    const isAuthor = post.authorId.equals(userId);
    const isCommunityOwner = post.communityId && post.communityId.owners.some(ownerId => ownerId.equals(userId));
    const isCommunityModerator = post.communityId && post.communityId.moderators.some(modId => modId.equals(userId));
    const isAdmin = userRole === 'admin';

    if (!(isAuthor || isCommunityOwner || isCommunityModerator || isAdmin)) {
        return res.status(403).json({ message: "Unauthorized to delete this post." });
    }

    const postAuthorId = post.authorId.toString();
    const communityId = post.communityId ? post.communityId._id.toString() : null;
    const communityName = post.communityId ? post.communityId.name : 'a global feed'; // Clarify for message

    await Post.findByIdAndDelete(id);

    // Decrement post count in community stats (if applicable)
    if (communityId) {
        const communityToUpdate = await Community.findById(communityId);
        if (communityToUpdate) {
            communityToUpdate.stats.postsCount = Math.max(0, (communityToUpdate.stats.postsCount || 0) - 1);
            await communityToUpdate.save();
        }
    }


    // Real-Time Update: "postDeleted" (retaining original event name)
    if (ioInstance) {
        const targetRoom = getPostTargetRoom(post);

        // 1. Emit to Post author (if online) for moderation transparency
        // Only notify author if someone else deleted it (i.e., it was moderated)
        if (onlineUsersMap && onlineUsersMap.has(postAuthorId) && postAuthorId !== userId.toString()) {
            ioInstance.to(`user:${postAuthorId}`).emit('postDeleted', { // Using existing name
                postId: id,
                communityId: communityId,
                message: `Your post "${post.title || 'Untitled Post'}" in ${communityName} has been deleted by a moderator/admin.`,
                deletedBy: userFullName,
                isModeratedDeletion: true // Add a flag for frontend to differentiate
            });
            ioInstance.to(`user:${postAuthorId}`).emit('notification:count:update');
        }

        // 2. Emit to the specific community room OR global feed for all relevant users
        ioInstance.to(targetRoom).emit('postDeleted', { // Using existing name
            postId: id,
            communityId: communityId,
            message: `A post titled "${post.title || 'Untitled Post'}" was deleted from ${communityName} by ${userFullName}.`,
            deletedBy: userFullName,
            authorId: postAuthorId
        });
        console.log(`Backend: Emitting 'postDeleted' for post ID: ${id} in room: ${targetRoom}`);

        // Real-Time Requirement: moderation:log:created
        try {
            const moderationLog = new ModerationLog({
                communityId: communityId, // This will be null for global posts
                moderatorId: userId,
                action: 'post_removed',
                targetId: id,
                reason: `Post "${post.title || 'Untitled'}" deleted by ${userFullName} (${userRole}).`,
            });
            await moderationLog.save();

            // Emit the moderation log event to relevant parties (e.g., all admins/mods)
            if (communityId) {
                // If community post, emit to community mods in their community room
                ioInstance.to(`community:${communityId}`).emit('moderation:log:created', {
                    logId: moderationLog._id,
                    communityId: communityId,
                    moderatorId: moderationLog.moderatorId,
                    action: moderationLog.action,
                    targetId: moderationLog.targetId,
                    reason: moderationLog.reason,
                    createdAt: moderationLog.createdAt,
                    message: `New moderation action: ${moderationLog.action} in ${communityName}.`
                });
            } else {
                // For global posts, if there's a central admin dashboard room, emit there.
                // Otherwise, you might need to fetch all admins and emit to their individual user rooms.
                // Example for a global admin room (requires clients to join 'admin:dashboard' room):
                // ioInstance.to('admin:dashboard').emit('moderation:log:created', { ... });
            }
        } catch (logError) {
            console.error("Error creating/emitting moderation log for post deletion:", logError);
        }
    }
    res.status(200).json({ message: "Post deleted successfully" });
});

/**
 * @desc Report a post
 * @route POST /api/posts/:id/report
 * @access Private
 */
const reportPost = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason, type } = req.body;
    const reporterId = req.user.userId;
    const reporterFullName = req.user.fullName;

    if (!reason || !type) {
        return res.status(400).json({ message: "Reason and type for report are required." });
    }

    const post = await Post.findById(id).populate('communityId', 'name owners moderators');
    if (!post) {
        return res.status(404).json({ message: "Post not found" });
    }

    const newReport = new Report({
        postId: id,
        reportedBy: reporterId,
        reason: reason,
        type: type,
    });
    await newReport.save();

    let updateFields = {
        $inc: { totalReportsCount: 1 },
        latestReportReason: reason,
        latestReportedAt: new Date(),
    };

    if (post.status === "ACTIVE" || post.status === "CLOSED") {
        updateFields.status = "REPORTED";
    }

    const updatedPost = await Post.findByIdAndUpdate(id, updateFields, { new: true });

    // Real-Time Update: "postReported" (retaining original event name)
    if (ioInstance) {
        // Emit to the reporter for confirmation (optional, could be done via standard HTTP response)
        ioInstance.to(`user:${reporterId.toString()}`).emit("postReportedConfirmation", {
            postId: id,
            message: "Your report has been submitted for review."
        });

        const communityId = post.communityId ? post.communityId._id.toString() : null;
        const communityName = post.communityId ? post.communityId.name : 'a global feed';

        // Notify community moderators/owners or relevant admins about the new report
        if (communityId) {
            ioInstance.to(`community:${communityId}`).emit("postReported", { // Using existing name
                postId: id,
                status: updatedPost.status,
                reason: reason,
                type: type,
                reporterId: reporterId,
                reporterName: reporterFullName,
                reportId: newReport._id,
                postTitle: post.title,
                communityName: communityName,
                message: `New report for post "${post.title}" in ${communityName}.`
            });

            // Real-Time Requirement: moderation:log:created
            try {
                const moderationLog = new ModerationLog({
                    communityId: communityId,
                    moderatorId: reporterId, // Reporter is the one who initiated the "moderation" action of reporting
                    action: 'post_reported',
                    targetId: id,
                    reason: `Post "${post.title}" reported by ${reporterFullName} for: ${reason}.`,
                });
                await moderationLog.save();

                ioInstance.to(`community:${communityId}`).emit('moderation:log:created', {
                    logId: moderationLog._id,
                    communityId: communityId,
                    moderatorId: moderationLog.moderatorId,
                    action: moderationLog.action,
                    targetId: moderationLog.targetId,
                    reason: moderationLog.reason,
                    createdAt: moderationLog.createdAt,
                    message: `New moderation log: Post reported in ${communityName}.`
                });

                // Trigger notification count for community admins/mods
                const adminAndModIds = new Set([
                    ...(post.communityId.owners || []).map(id => id.toString()),
                    ...(post.communityId.moderators || []).map(id => id.toString()),
                ]);
                adminAndModIds.forEach(id => {
                    // Only notify if they are online and not the reporter themselves (unless they want to be notified of their own reports)
                    if (onlineUsersMap && onlineUsersMap.has(id) && id !== reporterId.toString()) {
                        ioInstance.to(`user:${id}`).emit('notification:count:update');
                    }
                });
            } catch (logError) {
                console.error("Error creating/emitting moderation log for post report:", logError);
            }
        } else {
            // For global posts, notify relevant admins (e.g., via a global admin room or individual notifications)
            // This part requires you to define how you identify and route to global admins for reports.
            // ioInstance.to('admin:dashboard').emit('postReported', { ... });
            // ioInstance.to('admin:dashboard').emit('moderation:log:created', { ... });
        }
    }

    res.status(200).json({ message: "Post reported for review", reportId: newReport._id });
});

/**
 * @desc Cast a vote on a poll option
 * @route POST /api/posts/:id/vote
 * @access Private (requires authentication)
 */
const castPollVote = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { optionLabel } = req.body;
    const userId = req.user.userId;

    if (!optionLabel) {
        return res.status(400).json({ message: "Option label is required." });
    }

    const poll = await Post.findById(id);

    if (!poll) {
        return res.status(404).json({ message: "Poll not found." });
    }

    if (poll.type !== "Poll") {
        return res.status(400).json({ message: "This is not a poll post." });
    }

    if (poll.pollEndsAt && new Date() > new Date(poll.pollEndsAt)) {
        return res.status(400).json({ message: "This poll has already closed." });
    }

    if (!poll.allowMultipleSelections && poll.votedUsers.includes(userId)) {
        return res.status(400).json({ message: "You have already voted in this poll." });
    }

    const optionToUpdate = poll.options.find((opt) => opt.label === optionLabel);

    if (!optionToUpdate) {
        return res.status(404).json({ message: "Selected option not found." });
    }

    optionToUpdate.votes = (optionToUpdate.votes || 0) + 1;

    if (!poll.votedUsers.includes(userId)) {
        poll.votedUsers.push(userId);
    }

    const savedPoll = await poll.save();

    const populatedPollForEmit = await Post.findById(savedPoll._id)
        .populate("authorId", "fullName email profileImage isActive")
        .populate("communityId", "name")
        .populate("categoryId", "name")
        .lean();

    const totalVotes = populatedPollForEmit.options.reduce(
        (sum, o) => sum + (o.votes || 0),
        0
    );
    populatedPollForEmit.options = populatedPollForEmit.options.map((opt) => ({
        ...opt,
        percentage: totalVotes === 0 ? 0 : ((opt.votes || 0) / totalVotes) * 100,
    }));
    populatedPollForEmit.totalVotes = totalVotes;

    // Real-Time Update: "pollVoteUpdated" (retaining original event name)
    if (ioInstance) {
        const targetRoom = getPostTargetRoom(populatedPollForEmit);
        ioInstance.to(targetRoom).emit("pollVoteUpdated", populatedPollForEmit);
        console.log(`Backend: Emitting 'pollVoteUpdated' for poll ID: ${id} in room: ${targetRoom}`);
    }

    res.status(200).json({
        message: "Vote cast successfully",
        poll: populatedPollForEmit,
    });
});

/**
 * @desc Calculate and return poll statistics for a single poll
 * @route GET /api/posts/:id/poll-stats
 * @access Public
 */
const getPollStats = asyncHandler(async (req, res) => {
    const pollId = req.params.id;

    const poll = await Post.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(pollId), type: "Poll" } },
        { $addFields: { totalVotes: { $sum: "$options.votes" } } },
        {
            $addFields: {
                options: {
                    $map: {
                        input: "$options",
                        as: "option",
                        in: {
                            label: "$$option.label",
                            votes: "$$option.votes",
                            percentage: {
                                $cond: {
                                    if: { $eq: ["$totalVotes", 0] },
                                    then: 0,
                                    else: { $multiply: [{ $divide: ["$$option.votes", "$totalVotes"] }, 100] },
                                },
                            },
                        },
                    },
                },
            },
        },
        { $lookup: { from: "users", localField: "authorId", foreignField: "_id", as: "authorId" } },
        { $unwind: { path: "$authorId", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "communities", localField: "communityId", foreignField: "_id", as: "communityId" } },
        { $unwind: { path: "$communityId", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "categories", localField: "categoryId", foreignField: "_id", as: "categoryId" } },
        { $unwind: { path: "$categoryId", preserveNullAndEmptyArrays: true } },
        {
            $project: {
                _id: 1, type: 1, question: 1, content: 1, options: 1, pollEndsAt: 1, notifyOnClose: 1,
                allowMultipleSelections: 1, createdAt: 1, totalVotes: 1, status: 1, allowComments: 1,
                visibility: 1, publicVisibility: 1,
                authorId: { _id: "$authorId._id", fullName: "$authorId.fullName", email: "$authorId.email", profileImage: "$authorId.profileImage", isActive: "$authorId.isActive" },
                communityId: { _id: "$communityId._id", name: "$communityId.name" },
                categoryId: { _id: "$categoryId._id", name: "$categoryId.name" },
            },
        },
    ]);

    if (!poll || poll.length === 0) {
        return res.status(404).json({ message: "Poll not found or is not a poll type." });
    }

    res.status(200).json(poll[0]);
});

module.exports = {
    getAllPosts,
    getPostById,
    createPost,
    updatePost,
    deletePost,
    reportPost,
    castPollVote,
    getPollStats,
    setIoInstance,
};