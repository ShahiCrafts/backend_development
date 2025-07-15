const express = require("express");
const router = express.Router();
const membershipRequestController = require("../controllers/membershipRequestController");
const { verifyToken } = require("../middleware/userAuthorization");

router.post(
  "/request",
  verifyToken,
  membershipRequestController.requestMembership
);

router.get(
  "/requests",
  verifyToken,
  membershipRequestController.listMembershipRequests
);

router.post(
  "/review/:requestId",
  verifyToken,
  membershipRequestController.reviewMembershipRequest
);

router.delete(
  "/cancel/:requestId",
  verifyToken,
  membershipRequestController.cancelMembershipRequest
);

module.exports = router;
