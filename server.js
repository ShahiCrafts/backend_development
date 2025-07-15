const path = require("path");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

require('./models/notificationModel');
require('./models/communityModel');

const connectDB = require("./config/database");

const { registerSocketHandlers, getOnlineUsersMap } = require("./socket/socketHandler");
const socketAuth = require('./middleware/socketAuth');

const postController = require('./controllers/users/postController');
const notificationController = require('./controllers/admin/notificationController');
const commentController = require('./controllers/users/commentController');
const followController = require('./controllers/users/followController');
const communityController = require('./controllers/communityController');
const invitationController = require('./controllers/invitationController');
const membershipRequestController = require('./controllers/membershipRequestController');
const moderationLogController = require('./controllers/moderationLogController');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  },
});

io.use(socketAuth);
registerSocketHandlers(io);

const onlineUsers = getOnlineUsersMap();
postController.setIoInstance(io, onlineUsers);
notificationController.setIoInstance(io);
commentController.setIoInstance(io);
followController.setIoInstance(io);
communityController.setIoInstance(io, onlineUsers);
invitationController.setIoInstance(io, onlineUsers);
membershipRequestController.setIoInstance(io, onlineUsers);
moderationLogController.setIoInstance(io, onlineUsers);

const corsOptions = {
  origin: "http://localhost:5173",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());

app.use("/api/auth", require("./routes/user/authRoutes"));
app.use("/api/users", require("./routes/user/userRoutes"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/admin/users", require("./routes/admin/userRoutes"));
app.use("/api/admin/announcements", require("./routes/admin/announcementRoutes"));
app.use("/api/admin/tags", require("./routes/admin/tagRoutes"));
app.use("/api/admin/categories", require("./routes/admin/categoryRoutes"));
app.use("/api/posts", require("./routes/user/postRoutes"));
app.use("/api/notifications", require("./routes/admin/notificationRoutes"));
app.use("/api/group-discussions", require("./routes/user/groupDiscussionRoutes"));
app.use("/api/personal-conversations", require("./routes/user/personalConversationRoutes"));
app.use("/api/messages", require("./routes/user/messageRoutes"));
app.use("/api/comments", require("./routes/user/commentRoutes"));
app.use("/api/follows", require("./routes/user/followRoutes"));
app.use("/api/communities", require("./routes/communityRoutes"));

app.get("/", (req, res) => {
  res.send("Civic Engagement API is running on port 8080");
});

const PORT = process.env.PORT || 8080;

if (require.main === module) {
  connectDB();
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;
