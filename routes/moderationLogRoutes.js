const express = require("express");
const router = express.Router();
const moderationLogController = require("../controllers/moderationLogController");
const { verifyToken } = require("../middleware/userAuthorization");

router.post("/", verifyToken, moderationLogController.createLog);

router.get("/", verifyToken, moderationLogController.listLogs);

module.exports = router;
