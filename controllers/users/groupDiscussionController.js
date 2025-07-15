const GroupDiscussion = require("../../models/groupDiscusssionModel");
const mongoose = require("mongoose");
const User = require("../../models/userModel"); // ✅ Add this line
/**
 * Creates a new group discussion if one doesn't exist for the given postId,
 * otherwise retrieves the existing one. (Upsert logic)
 * This prevents duplicate discussion rooms for the same post.
 */
const areValidObjectIds = (ids) => {
  return Array.isArray(ids) && ids.every((id) => id && mongoose.Types.ObjectId.isValid(id));
};

exports.createOrGetGroupDiscussion = async (req, res) => {
  try {
    console.log("--- createOrGetGroupDiscussion ---");
    console.log("Request Body:", req.body);
    console.log("Authenticated User from Token (req.user):", req.user);

    const { postId, description } = req.body;

    if (!req.user) {
      console.error("CRITICAL: req.user object is missing after verifyToken middleware.");
      return res.status(401).json({ error: "User authentication data is missing from the request." });
    }

    const authorId = req.user.id || req.user._id || req.user.userId;

    if (!authorId) {
      const foundKeys = Object.keys(req.user).join(', ');
      console.error(`Could not find user ID in req.user object. Keys found: [${foundKeys}]`);
      return res.status(401).json({
        error: "Could not identify authenticated user from token.",
        debug: {
          message: "Expected 'id', '_id', or 'userId' in token payload.",
          payloadKeysFound: foundKeys,
        },
      });
    }

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ error: "A valid postId is required." });
    }

    // Normalize and deduplicate participant IDs
    const normalizedAuthorId = authorId.toString();

    // Ensure user exists in DB
    const userExists = await User.exists({ _id: normalizedAuthorId });
    if (!userExists) {
      return res.status(400).json({ error: "Authenticated user not found in the database." });
    }

    // Find or create the group discussion
    let discussion = await GroupDiscussion.findOne({ discussionId: postId });

    if (!discussion) {
      discussion = await GroupDiscussion.create({
        discussionId: postId,
        description,
        participants: [normalizedAuthorId],
      });
    } else {
      // Ensure author is not already in participants
      const authorAlreadyPresent = discussion.participants
        .map(id => id.toString())
        .includes(normalizedAuthorId);

      if (!authorAlreadyPresent) {
        discussion.participants.push(new mongoose.Types.ObjectId(normalizedAuthorId));

        // Remove duplicates just in case
        const uniqueParticipants = [...new Set(discussion.participants.map(id => id.toString()))];
        discussion.participants = uniqueParticipants.map(id => new mongoose.Types.ObjectId(id));

        await discussion.save();
      }
    }

    await discussion.populate("participants", "fullName profileImage");

    res.status(200).json(discussion);

  } catch (error) {
    console.error("createOrGetGroupDiscussion error:", error);
    res.status(500).json({ error: "An unexpected server error occurred." });
  }
};


/**
 * Gets all group discussions, with optional filtering.
 */
exports.getGroupDiscussions = async (req, res) => {
  try {
    const { participant, postId } = req.query;
    const filter = {};

    if (participant) {
      if (!mongoose.Types.ObjectId.isValid(participant)) {
        return res
          .status(400)
          .json({ error: "Invalid participant ID provided." });
      }
      filter.participants = participant;
    }

    if (postId) {
      if (!mongoose.Types.ObjectId.isValid(postId)) {
        return res.status(400).json({ error: "Invalid postId provided." });
      }
      filter.discussionId = postId; // Corrected field name to match schema
    }

    // Find discussions, sort by the most recently updated, and populate participants.
    // .lean() improves performance for read-only queries.
    const discussions = await GroupDiscussion.find(filter)
      .sort({ updatedAt: -1 })
      .populate("participants", "fullName profileImage")
      .lean();

    res.status(200).json(discussions);
  } catch (error) {
    console.error("getGroupDiscussions error:", error);
    res.status(500).json({ error: "An unexpected server error occurred." });
  }
};

/**
 * Gets a single group discussion by its unique _id.
 */
exports.getGroupDiscussionById = async (req, res) => {
  try {
    const { discussionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(discussionId)) {
      return res
        .status(400)
        .json({ error: "The provided discussion ID is invalid." });
    }

    const discussion = await GroupDiscussion.findById(discussionId).populate(
      "participants",
      "fullName profileImage"
    );

    if (!discussion) {
      return res.status(404).json({ error: "Discussion not found." });
    }

    res.status(200).json(discussion);
  } catch (error) {
    console.error("getGroupDiscussionById error:", error);
    res.status(500).json({ error: "An unexpected server error occurred." });
  }
};

/**
 * Updates a group discussion's details (e.g., description, participants).
 */
exports.updateGroupDiscussion = async (req, res) => {
  try {
    const { discussionId } = req.params;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(discussionId)) {
      return res
        .status(400)
        .json({ error: "The provided discussion ID is invalid." });
    }

    // Optional: Validate participants array if it's being updated
    if (
      updateData.participants &&
      !areValidObjectIds(updateData.participants)
    ) {
      return res
        .status(400)
        .json({ error: "Participants must be an array of valid user IDs." });
    }

    const discussion = await GroupDiscussion.findByIdAndUpdate(
      discussionId,
      { $set: updateData }, // Use $set to prevent overwriting the entire document
      { new: true }
    ).populate("participants", "fullName profileImage");

    if (!discussion) {
      return res.status(404).json({ error: "Discussion not found." });
    }

    res.status(200).json(discussion);
  } catch (error) {
    console.error("updateGroupDiscussion error:", error);
    res.status(500).json({ error: "An unexpected server error occurred." });
  }
};
