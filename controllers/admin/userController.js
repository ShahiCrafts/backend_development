const adminUserService = require("../../services/admin/userService");

/**
 * Controller to get paginated list of users with optional filters.
 */
async function getAllUsers(req, res) {
  try {
    const { page, limit, role, isBanned, search, sortBy, sortOrder } =
      req.query;

    // Parse types properly (query params are strings)
    const options = {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      role,
      isBanned: isBanned !== undefined ? isBanned === "true" : undefined,
      search,
      sortBy,
      sortOrder,
    };

    const data = await adminUserService.getAllUsers(options);
    res.status(200).json(data);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users." });
  }
}

/**
 * Controller to get a single user by ID.
 */
async function getUserById(req, res) {
  try {
    const { id } = req.params;
    const user = await adminUserService.getUserById(id);

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json(user);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ error: "Failed to fetch user." });
  }
}

/**
 * Controller to update user details.
 */
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedUser = await adminUserService.updateUser(id, updates);

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json(updatedUser);
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(400).json({ error: err.message || "Failed to update user." });
  }
}

/**
 * Controller to hard delete a user.
 */
async function hardDeleteUser(req, res) {
  try {
    const { id } = req.params;

    const deleted = await adminUserService.hardDeleteUser(id);

    if (!deleted) {
      return res
        .status(404)
        .json({ error: "User not found or already deleted." });
    }

    res.status(200).json({ message: "User permanently deleted." });
  } catch (err) {
    console.error("Error hard deleting user:", err);
    res.status(500).json({ error: "Failed to hard delete user." });
  }
}

/**
 * Controller to change user role.
 */
async function changeUserRole(req, res) {
  try {
    const { id } = req.params;
    const { newRole } = req.body;

    if (!newRole) {
      return res.status(400).json({ error: "`newRole` is required." });
    }

    const updatedUser = await adminUserService.changeUserRole(id, newRole);

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json(updatedUser);
  } catch (err) {
    console.error("Error changing user role:", err);
    res
      .status(400)
      .json({ error: err.message || "Failed to change user role." });
  }
}

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  hardDeleteUser,
  changeUserRole,
};
