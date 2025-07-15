const Community = require("../models/communityModel"); // Your Community model
const User = require("../models/userModel"); // Assuming you have a User model
const moderationLogController = require('./moderationLogController'); // Import for creating logs

let io; // Declare io variable
let onlineUsers; // Declare onlineUsers variable

/**
 * Sets the Socket.IO instance and the onlineUsers Map for the controller.
 * This is called from app.js during server setup.
 * @param {SocketIO.Server} socketIoInstance - The Socket.IO server instance.
 * @param {Map<string, string>} onlineUsersMap - A map of online user IDs to their socket IDs.
 */
exports.setIoInstance = (socketIoInstance, onlineUsersMap) => {
    io = socketIoInstance;
    onlineUsers = onlineUsersMap; // Store the onlineUsers map
};

// Helper for slugify (you can use npm package 'slugify' in production if preferred)
const slugify = (text) =>
    text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w\-]+/g, "") // Remove all non-word chars
    .replace(/\-\-+/g, "-") // Replace multiple - with single -
    .replace(/^-+/, "") // Trim - from start of text
    .replace(/-+$/, ""); // Trim - from end of text

/**
 * Create a new community.
 * The community's status will be set to 'pending' and an approval request
 * notification will be sent to administrators.
 */
exports.createCommunity = async (req, res) => {
    try {
        const {
            name,
            description,
            category,
            // privacy and tags are no longer expected from req.body directly
            // as per frontend simplification, they will use schema defaults.
        } = req.body;

        // Validate required fields from the frontend form
        if (!name || !description || !category) {
            return res
                .status(400)
                .json({ message: "Name, description, and category are required to create a community." });
        }

        // Generate slug
        const slug = slugify(name);

        // Check if slug or name already exists to prevent duplicates
        const existing = await Community.findOne({ $or: [{ slug }, { name }] });
        if (existing) {
            return res
                .status(409)
                .json({ message: "Community with this name or slug already exists." });
        }

        const community = new Community({
            name,
            slug,
            description,
            category,
            // privacy will use its default 'public' from the schema
            // tags will use its default [] (empty array) from the schema
            owners: [req.user.userId], // The creator is automatically set as an owner
            status: "pending", // New communities always start in pending state for approval
        });

        await community.save();

        // Emit real-time notification to all online administrators
        if (io && onlineUsers) {
            // Find all users with the 'admin' role
            const admins = await User.find({ role: 'admin' }).select('_id');

            // Filter for admins who are currently online and get their socket IDs
            const onlineAdminIds = admins
                .filter(admin => onlineUsers.has(admin._id.toString()))
                .map(admin => admin._id.toString());

            // Send 'community:newApprovalRequest' event to each online admin's personal room
            onlineAdminIds.forEach(adminId => {
                io.to(`user:${adminId}`).emit("community:newApprovalRequest", {
                    communityId: community._id,
                    communityName: community.name,
                    requestedBy: req.user.fullName || req.user.username, // Creator's name
                    message: `A new community "${community.name}" is awaiting your approval.`,
                });
                // Also trigger a general notification count update for the admin
                io.to(`user:${adminId}`).emit("notification:count:update");
            });

            // Additionally, emit to the dedicated admin approval room if set up in socketHandlers
            io.to('admin:approvals').emit("community:newApprovalRequest", { // This room listener is optional but good practice
                communityId: community._id,
                communityName: community.name,
                requestedBy: req.user.fullName || req.user.username,
                message: `A new community "${community.name}" is awaiting your approval.`,
            });

            // Log this community creation request as a moderation action
            await moderationLogController.createLogInternal({
                communityId: community._id,
                moderatorId: req.user.userId, // The creator initiates this log entry
                action: 'community_creation_requested',
                targetId: community._id,
                reason: `New community "${community.name}" created by ${req.user.fullName || req.user.username} and awaiting approval.`,
            });
        }

        return res.status(201).json({
            message: "Community created and submitted for admin approval.",
            communityId: community._id,
            communitySlug: community.slug, // Include slug for potential frontend redirects
        });
    } catch (error) {
        console.error("Create community error:", error);
        return res.status(500).json({ message: "Server error." });
    }
};

exports.listUserOwnedCommunities = async (req, res) => {
    try {
        const userId = req.user.userId; // User ID from authentication middleware

        if (!userId) {
            return res.status(401).json({ message: "Authentication required." });
        }

        const communities = await Community.find({
            owners: userId // Find communities where the user's ID is in the owners array
        })
        .sort({ createdAt: -1 }) // Newest first
        .populate("owners", "username fullName profileImage") // Populate owner details
        .select("name slug description category privacy avatarUrl bannerUrl tags stats status rejectionReason createdAt"); // Select relevant fields, including status and rejectionReason

        return res.json({ communities });
    } catch (error) {
        console.error("List user owned communities error:", error);
        return res.status(500).json({ message: "Server error." });
    }
};

/**
 * List approved communities (publicly accessible).
 * Supports pagination and optional filtering/searching.
 */
exports.listApprovedCommunities = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page)) || 1;
        const limit = Math.min(50, parseInt(req.query.limit)) || 20;

        const filter = { status: "approved" };

        // Optional filters
        if (req.query.category) filter.category = req.query.category;
        if (req.query.privacy) filter.privacy = req.query.privacy; // Although frontend doesn't send, backend can still filter

        // Simple text search (requires text index on schema)
        if (req.query.search) {
            filter.$text = { $search: req.query.search };
        }

        const communities = await Community.find(filter)
            .sort({ createdAt: -1 }) // Sort by newest first
            .skip((page - 1) * limit)
            .limit(limit)
            .select(
                "name slug description category privacy avatarUrl bannerUrl tags stats"
            );

        const total = await Community.countDocuments(filter);

        return res.json({
            page,
            limit,
            total,
            communities,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalPosts: total, // Renamed to totalItems or totalCommunities for clarity
            },
        });
    } catch (error) {
        console.error("List approved communities error:", error);
        return res.status(500).json({ message: "Server error." });
    }
};

/**
 * Get community details by slug.
 * Publicly visible only if approved. Owners/mods/admins can access even if not approved.
 */
exports.getCommunityDetails = async (req, res) => {
    try {
        const slug = req.params.slug;
        if (!slug) {
            return res.status(400).json({ message: "Community slug required." });
        }

        const community = await Community.findOne({ slug })
            .populate("owners", "username fullName profileImage") // Populating full name for creator display
            .populate("moderators", "username fullName profileImage")
            .populate("members", "username fullName profileImage");

        if (!community) {
            return res.status(404).json({ message: "Community not found." });
        }

        // Access control:
        // Check if the current user is an owner, moderator, or a global admin.
        const isOwner =
            req.user &&
            community.owners.some((ownerId) => ownerId.equals(req.user._id));
        const isModerator =
            req.user &&
            community.moderators.some((modId) => modId.equals(req.user._id));
        const isAdmin = req.user && req.user.role === "admin";

        // If community is not approved AND user is not an owner/moderator/admin, deny access.
        if (
            community.status !== "approved" &&
            !(isOwner || isModerator || isAdmin)
        ) {
            return res
                .status(403)
                .json({ message: "Community is not publicly available and you lack sufficient permissions." });
        }

        return res.json(community);
    } catch (error) {
        console.error("Get community details error:", error);
        return res.status(500).json({ message: "Server error." });
    }
};

/**
 * Admin: List communities pending approval.
 * Requires 'admin' role via middleware.
 */
exports.listPendingCommunities = async (req, res) => {
    try {
        // The roleAuthorization middleware should already enforce 'admin' role.
        const filter = { status: "pending" };

        const pendingCommunities = await Community.find(filter)
            .sort({ createdAt: 1 }) // Order by oldest first (first come, first served for review)
            .populate("owners", "username fullName profileImage") // Populate owner details to show who requested it
            .select("name slug description category privacy owners createdAt status rejectedReason");

        return res.json({ pendingCommunities });
    } catch (error) {
        console.error("List pending communities error:", error);
        return res.status(500).json({ message: "Server error." });
    }
};

/**
 * Admin: Approve or reject a community.
 * Requires 'admin' role via middleware.
 */
exports.reviewCommunity = async (req, res) => {
    try {
        // The roleAuthorization middleware should already enforce 'admin' role.
        const { communityId } = req.params;
        const { action, rejectionReason = "" } = req.body; // 'action' is 'approve' or 'reject'
        const adminId = req.user._id;
        const adminFullName = req.user.fullName || req.user.username; // Get admin's name for moderation log

                console.log("Backend: reviewCommunity received action:", action);

        // Validate the 'action' parameter
        if (!["approve", "reject"].includes(action)) {
            return res
                .status(400)
                .json({ message: "Action must be 'approve' or 'reject'." });
        }

        // Find the community and populate its owners to get creator's ID for notification
        const community = await Community.findById(communityId).populate(
            "owners",
            "_id fullName"
        );
        if (!community) {
            return res.status(404).json({ message: "Community not found." });
        }

        // Ensure the community is actually in a 'pending' state before reviewing
        if (community.status !== "pending") {
            return res.status(400).json({ message: "Community has already been reviewed." });
        }

        // Get the ID of the community creator (first owner)
        const communityCreatorId = community.owners[0]?._id.toString();
        const communityCreatorFullName = community.owners[0]?.fullName || "Community Creator";

        if (action === "approve") {
            community.status = "approved";
            community.rejectionReason = ""; // Clear any past rejection reason
            // Optionally, if privacy is not set by user, ensure it defaults to public
            if (!community.privacy) {
                 community.privacy = 'public';
            }
            await community.save();

            // Notify the community creator in real-time that their community has been approved
            if (io && communityCreatorId) {
                io.to(`user:${communityCreatorId}`).emit("community:approved", {
                    communityId: community._id,
                    communityName: community.name,
                    slug: community.slug, // Send slug for potential direct link
                    message: `🎉 Your community "${community.name}" has been approved and is now live!`,
                });
                io.to(`user:${communityCreatorId}`).emit("notification:count:update");
            }

            // Log the approval action in the moderation log
            await moderationLogController.createLogInternal({
                communityId: community._id,
                moderatorId: adminId,
                action: "community_approved",
                targetId: community._id, // The community itself is the target
                reason: `Community "${community.name}" approved by admin ${adminFullName}.`,
            });

            // Optional: Emit a public event for newly approved communities (e.g., for a "discover new communities" feed)
            if (io) {
                io.emit("community:newlyApproved", {
                    communityId: community._id,
                    communityName: community.name,
                    slug: community.slug,
                    message: `A new community "${community.name}" has just been approved!`,
                });
            }

        } else if (action === "reject") {
            community.status = "rejected";
            community.rejectionReason = rejectionReason; // Store the reason for rejection
            await community.save();

            // Notify the community creator in real-time that their community has been rejected
            if (io && communityCreatorId) {
                io.to(communityCreatorId).emit("community:rejected", {
                    communityId: community._id,
                    communityName: community.name,
                    reason: rejectionReason || "No specific reason provided.",
                    message: `Your community "${community.name}" was rejected. Reason: ${rejectionReason || "No specific reason provided."}`,
                });
                io.to(communityCreatorId).emit("notification:count:update");
            }

            // Log the rejection action in the moderation log
            await moderationLogController.createLogInternal({
                communityId: community._id,
                moderatorId: adminId,
                action: "community_rejected",
                targetId: community._id,
                reason: `Community "${community.name}" rejected by admin ${adminFullName}. Reason: ${rejectionReason}`,
            });
        }

        // Send a success response back to the admin who performed the review
        return res.json({ message: `Community ${action}d successfully.` });
    } catch (error) {
        console.error("Review community error:", error);
        return res.status(500).json({ message: "Server error." });
    }
};