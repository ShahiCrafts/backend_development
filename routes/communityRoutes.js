const express = require("express");
const router = express.Router();
const communityController = require("../controllers/communityController");
const { verifyToken } = require("../middleware/userAuthorization");
const { roleAuthorization } = require("../middleware/roleAuthorization");


console.log("createCommunity type:", typeof communityController.createCommunity);

router.post("/", verifyToken, communityController.createCommunity);

router.get("/my-communities", verifyToken, communityController.listUserOwnedCommunities);

router.get("/", communityController.listApprovedCommunities);

router.get("/:slug", verifyToken, communityController.getCommunityDetails);

router.get(
  "/admin/pending",
  verifyToken,
  roleAuthorization(["admin"]),
  communityController.listPendingCommunities
);

router.post(
  "/admin/review/:communityId",
  verifyToken,
  roleAuthorization(["admin"]),
  communityController.reviewCommunity
);

module.exports = router;
