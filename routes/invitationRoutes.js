const express = require("express");
const router = express.Router();
const invitationController = require("../controllers/invitationController");
const { verifyToken } = require("../middleware/userAuthorization");

router.post("/send", verifyToken, invitationController.sendInvitation);

router.get("/user", verifyToken, invitationController.listUserInvitations);

router.post(
  "/respond/:invitationId",
  verifyToken,
  invitationController.respondToInvitation
);

router.get(
  "/community/:communityId",
  verifyToken,
  invitationController.listCommunityInvitations
);

module.exports = router;
