const TokenBlacklist = require("../../models/tokenBlacklistModel");
const User = require("../../models/userModel");
const jwt = require("jsonwebtoken");

/**
 * Retrieves a paginated list of users with optional filtering, searching, and sorting.
 *
 * @typedef {Object} GetAllUsersOptions
 * @property {number} [page=1] - Current page number (1-based).
 * @property {number} [limit=20] - Number of users per page.
 * @property {string} [role] - Filter users by role ('public', 'official', 'admin').
 * @property {boolean} [isBanned] - Filter users by block status.
 * @property {string} [search] - Search term to match against fullName or email (case-insensitive).
 * @property {string} [sortBy='createdAt'] - Field name to sort by.
 * @property {'asc'|'desc'} [sortOrder='desc'] - Sort order direction.
 *
 * @param {GetAllUsersOptions} options
 * @returns {Promise<{users: Object[], total: number, page: number, limit: number}>}
 */

async function getAllUsers(options = {}) {
  const {
    page = 1,
    limit = 20,
    role,
    isBanned,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = options;

  const query = {};

  if (role) {
    query.role = role;
  }

  if (typeof isBanned === "boolean") {
    query.isBanned = isBanned;
  }

  if (search && search.trim() !== "") {
    const regex = new RegExp(search.trim(), "i");
    query.$or = [{ fullName: regex }, { email: regex }];
  }

  const sortDirection = sortOrder.toLowerCase() === "asc" ? 1 : -1;
  const sortCriteria = { [sortBy]: sortDirection };

  const skip = (Math.max(page, 1) - 1) * Math.max(limit, 1);

  const [users, total] = await Promise.all([
    User.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sortCriteria)
      .select("-password")
      .lean()
      .exec(),
    User.countDocuments(query).exec(),
  ]);

  return { users, total, page, limit };
}

/**
 * Retrieves a user by their unique identifier.
 *
 * @param {string} id - The user's unique MongoDB ObjectId.
 * @returns {Promise<Object|null>} The user document without password, or null if not found.
 */
async function getUserById(id) {
  if (!id) throw new Error("User ID is required.");
  const user = await User.findById(id).select("-password").lean().exec();
  return user;
}

/**
 * Updates user fields safely by whitelisting allowed fields.
 *
 * @param {string} id - The user's unique MongoDB ObjectId.
 * @param {Object} updates - An object containing fields to update.
 * @param {string} [updates.role] - New role for the user.
 * @param {boolean} [updates.isBanned] - User block status.
 * @param {string} [updates.fullName] - Updated full name.
 * @param {string} [updates.email] - Updated email address.
 *
 * @returns {Promise<Object|null>} The updated user document without password, or null if not found.
 * @throws {Error} When no valid fields are provided to update.
 */
async function updateUser(id, updates) {
  if (!id) throw new Error("User ID is required.");
  if (!updates || typeof updates !== "object") {
    throw new Error("Updates object is required.");
  }

  const allowedFields = ["role", "isBanned", "fullName", "email"];
  const updateData = {};

  for (const key of allowedFields) {
    if (key in updates) {
      updateData[key] = updates[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error("No valid fields provided for update.");
  }

  const updatedUser = await User.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  })
    .select("-password")
    .lean()
    .exec();

  return updatedUser;
}

/**
 * Permanently removes a user from the database.
 *
 * Use with caution as this action is irreversible.
 *
 * @param {string} id - The user's unique MongoDB ObjectId.
 * @returns {Promise<boolean>} True if deletion succeeded, false otherwise.
 */
async function hardDeleteUser(id) {
  if (!id) throw new Error("User ID is required.");

  const result = await User.deleteOne({ _id: id }).exec();
  return result.deletedCount === 1;
}

/**
 * Changes the role of a user.
 *
 * @param {string} id - The user's unique MongoDB ObjectId.
 * @param {string} newRole - The new role ('public', 'official', 'admin').
 * @returns {Promise<Object|null>} The updated user document or null if not found.
 * @throws {Error} When an invalid role is provided.
 */
async function changeUserRole(id, newRole) {
  if (!id) throw new Error("User ID is required.");

  const validRoles = ["public", "official", "admin"];
  if (!validRoles.includes(newRole)) {
    throw new Error(
      `Invalid role: ${newRole}. Valid roles are ${validRoles.join(", ")}`
    );
  }

  const updatedUser = await User.findByIdAndUpdate(
    id,
    { role: newRole },
    { new: true, runValidators: true }
  )
    .select("-password")
    .lean()
    .exec();

  return updatedUser;
}

/**
 * Counts the number of users matching given filters.
 *
 * @param {Object} [filters={}] - MongoDB query filters.
 * @returns {Promise<number>} Number of matching user documents.
 */
async function countUsers(filters = {}) {
  const count = await User.countDocuments(filters).exec();
  return count;
}

async function logoutUser(token) {
  if (!token) {
    throw new Error("Token is required for logout.");
  }

  const decodedToken = jwt.decode(token);
  if (!decodedToken || !decodedToken.exp) {
    throw new Error("Invalid token format.");
  }

  const isExpired = Date.now() >= decodedToken.exp * 1000;
  if (isExpired) {
    return { success: true, message: "Token is already expired." };
  }

  try {
    const blacklistedToken = new TokenBlacklist({
      token: token,
      expireAt: new Date(decodedToken.exp * 1000),
    });
    await blacklistedToken.save();
    return { success: true, message: "User logged out successfully." };
  } catch (error) {
    if (error.code === 11000) {
      return { success: true, message: "Token is already blacklisted." };
    }
    throw error;
  }
}

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  hardDeleteUser,
  changeUserRole,
  countUsers,
  logoutUser
};
