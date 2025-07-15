const express = require("express");
const router = express.Router();
const tagController = require("../../controllers/admin/tagController");
const { roleAuthorization } = require("../../middleware/roleAuthorization");
const { verifyToken } = require("../../middleware/userAuthorization");

router.get(
  "/fetch/all",
  verifyToken,
  roleAuthorization(["admin", "citizen"]),
  tagController.getAllTags
);

router.get(
  "/fetch/:id",
  verifyToken,
  roleAuthorization(["admin"]),
  tagController.getTagById
);
router.post(
  "/create",
  verifyToken,
  roleAuthorization(["admin"]),
  tagController.createTag
);
router.put(
  "/update/:id",
  verifyToken,
  roleAuthorization(["admin"]),
  tagController.updateTag
);
router.delete(
  "/:id",
  verifyToken,
  roleAuthorization(["admin"]),
  tagController.deleteTag
);

module.exports = router;
