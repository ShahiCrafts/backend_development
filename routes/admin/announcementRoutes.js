const express = require("express");
const router = express.Router();
const {
  getAnnouncementById,
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} = require("../../controllers/admin/announcementController");

const { verifyToken } = require("../../middleware/userAuthorization");
const { roleAuthorization } = require("../../middleware/roleAuthorization");

router.get("/",verifyToken, roleAuthorization(['admin']), getAllAnnouncements);
router.get("/:id",verifyToken, roleAuthorization(['admin']), getAnnouncementById);
router.post("/",verifyToken, roleAuthorization(['admin']), createAnnouncement);
router.put("/:id",verifyToken, roleAuthorization(['admin']), updateAnnouncement);
router.delete("/:id",verifyToken, roleAuthorization(['admin']), deleteAnnouncement);

module.exports = router;
