const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  updateUser,
  hardDeleteUser,
  changeUserRole,
} = require("../../controllers/admin/userController");

const { verifyToken } = require("../../middleware/userAuthorization");
const { roleAuthorization } = require("../../middleware/roleAuthorization");

router.get("/", verifyToken, roleAuthorization(['admin']), getAllUsers);
router.get("/:id", verifyToken, roleAuthorization(['admin']), getUserById);
router.put("/:id", verifyToken, roleAuthorization(['admin']), updateUser);
router.delete("/:id", verifyToken, roleAuthorization(['admin']), hardDeleteUser);
router.patch("/change-role/:id", verifyToken, roleAuthorization(['admin']), changeUserRole);

module.exports = router;
