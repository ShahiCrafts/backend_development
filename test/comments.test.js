// test/comments.test.js

const request = require('supertest');
const { expect } = require('chai');
const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sinon = require('sinon'); // For mocking ioInstance
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: './.env.test' });
dotenv.config({ path: './.env' });

// Import your Express app
const app = require('../server'); // Adjust path as needed

// Import the comment controller to access setIoInstance
const commentController = require('./../controllers/users/commentController'); // Corrected path if needed

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error("JWT_SECRET is not defined. Please set it in your .env.test or .env file.");
    process.exit(1);
}

describe('Comments API', () => {
    let testUser;
    let testPost;
    let authToken;

    // Declare stubs for Socket.IO
    let ioToStub; // Stub for ioInstance.to()
    let emitStub; // Stub for the .emit() method returned by ioInstance.to()

    // Declare model variables at the top level of the describe block
    let User;
    let Post;
    let Comment;
    let Notification;
    let Community; // Assuming you might have a Community model as well, based on Post schema ref

    // Before all tests, connect to a test database and load models
    before(async () => {
        const mongoUri = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/mern_test_db';
        console.log(`Comments API tests connecting to MongoDB: ${mongoUri}`);

        // Ensure connection is established or re-established to the test DB
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(mongoUri, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
            });
            console.log("Connected to test MongoDB for Comments API tests.");
        } else if (mongoose.connection.name !== 'mern_test_db') {
            // If connected to a different DB, disconnect and reconnect to the test DB
            await mongoose.disconnect();
            await mongoose.connect(mongoUri, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
            });
            console.log("Reconnected to test MongoDB for Comments API tests.");
        } else {
            console.log("Already connected to test MongoDB for Comments API tests.");
        }

        // --- IMPORTANT: Directly assign the required models to the variables ---
        // This ensures the variables hold the actual model instances returned by `mongoose.model()`.
        User = require('../models/userModel');
        Post = require('../models/PostModel');
        Comment = require('../models/commentModel');
        Notification = require('../models/notificationModel');
        Community = require('../models/communityModel'); // Assign Community model if it exists

        // DEBUGGING LOGS (after model assignment in before hook)
        console.log('DEBUG (before): Mongoose models after require:', Object.keys(mongoose.models));
        console.log('DEBUG (before): Type of Post (after assignment):', typeof Post);
        console.log('DEBUG (before): Is Post a Mongoose Model (after assignment):', Post && Post.collection instanceof mongoose.Collection);
        // END DEBUGGING LOGS

        // Stub the ioInstance.to().emit method
        emitStub = sinon.stub(); // This stub will capture calls to .emit()
        ioToStub = sinon.stub().returns({ emit: emitStub }); // This stub will capture calls to .to()
        commentController.setIoInstance({ to: ioToStub });
        console.log("Mocked Socket.IO instance for commentController.");
    });

    // Clear collections and create base data before each test
    beforeEach(async () => {
        // DEBUGGING LOGS (at start of beforeEach)
        console.log('DEBUG (beforeEach): Type of Post (at start):', typeof Post);
        console.log('DEBUG (beforeEach): Is Post a Mongoose Model (at start):', Post && Post.collection instanceof mongoose.Collection);
        // END DEBUGGING LOGS

        if (mongoose.connection.readyState !== 1) {
            console.warn("MongoDB not connected. Skipping collection clearing in beforeEach.");
            return;
        }
        // Ensure models are available before calling deleteMany
        if (!User || !Post || !Comment || !Notification || !Community) { // Added Community check
            console.error("Mongoose models not initialized. Skipping collection clearing. This indicates a problem with model loading in 'before' hook.");
            return;
        }

        await User.deleteMany({});
        await Post.deleteMany({});
        await Comment.deleteMany({});
        await Notification.deleteMany({});
        await Community.deleteMany({}); // Clear Community collection too if it's used
        console.log("Cleared User, Post, Comment, Notification, Community collections.");

        // Reset the stub history for each test
        emitStub.resetHistory();
        ioToStub.resetHistory();

        // Create a test user
        const hashedPassword = await bcryptjs.hash('UserPassword123!', 10);
        testUser = await User.create({
            username: 'testuser',
            fullName: 'Test User',
            email: 'test@example.com',
            password: hashedPassword,
            role: 'citizen',
            emailVerified: true,
        });

        // Generate a token for the test user
        authToken = jwt.sign(
            { userId: testUser._id, role: testUser.role, fullName: testUser.fullName },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
        console.log(`Created test user: ${testUser.email} and generated token.`);

        // Create a test post by the test user
        testPost = await Post.create({
            title: 'Test Post Title',
            content: 'This is the content of the test post.',
            authorId: testUser._id,
            authorName: testUser.fullName,
            category: 'General', // Assuming a default category or valid category ID
            tags: [],
            type: 'Discussion', // CORRECTED: Using valid enum value from Post schema
            status: 'ACTIVE', // CORRECTED: Using valid enum value from Post schema
        });
        console.log(`Created test post: ${testPost.title} by ${testUser.fullName}.`);
    });

    // After all tests, close the database connection
    after(async () => {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.dropDatabase();
            await mongoose.connection.close();
            console.log("Disconnected from MongoDB and dropped test database for Comments API.");
        } else {
            console.log("MongoDB not connected, skipping disconnection.");
        }
        sinon.restore(); // Restore all stubs
    });

    // --- Test Cases for POST /api/comments ---
    describe('POST /api/comments', () => {
        it('should successfully create a new top-level comment on a post', async () => {
            const commentContent = 'This is a brand new comment.';
            const res = await request(app)
                .post('/api/comments')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    postId: testPost._id,
                    content: commentContent,
                });

            expect(res.statusCode).to.equal(201);
            expect(res.body).to.have.property('_id').that.is.a('string');
            expect(res.body).to.have.property('content', commentContent);
            expect(res.body).to.have.property('postId', testPost._id.toString());
            // Assert that authorId is populated with an object, not just the ID string
            expect(res.body).to.have.property('authorId').that.is.an('object');
            expect(res.body.authorId).to.have.property('_id', testUser._id.toString());
            expect(res.body.authorId).to.have.property('fullName', testUser.fullName);
            expect(res.body).to.have.property('authorName', testUser.fullName); // Still check authorName directly
            expect(res.body).to.have.property('parentId', null);
            expect(res.body).to.have.property('isDeleted', false);
            expect(res.body).to.have.property('repliesCount', 0);
            expect(res.body).to.have.property('likes').that.is.an('array').and.is.empty;

            // Verify comment exists in DB
            const createdComment = await Comment.findById(res.body._id);
            expect(createdComment).to.exist;
            expect(createdComment.content).to.equal(commentContent);

            // Verify no notification emitted if author comments on their own post
            expect(ioToStub.called).to.be.false; // io.to() should not have been called
            expect(emitStub.called).to.be.false; // io.to().emit() should not have been called
            console.log("Successfully created top-level comment.");
        });

        it('should successfully create a reply to an existing comment', async () => {
            // First, create a parent comment by a different user
            const otherUserHashedPassword = await bcryptjs.hash('OtherUserPassword123!', 10);
            const otherUser = await User.create({
                username: 'otheruser',
                fullName: 'Other User',
                email: 'other@example.com',
                password: otherUserHashedPassword,
                role: 'citizen',
                emailVerified: true,
            });
            const parentComment = await Comment.create({
                postId: testPost._id,
                authorId: otherUser._id,
                authorName: otherUser.fullName,
                content: 'This is the parent comment.',
            });
            console.log(`Pre-condition: Created parent comment by ${otherUser.fullName}.`);

            const replyContent = 'This is a reply to the parent comment.';
            const res = await request(app)
                .post('/api/comments')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    postId: testPost._id,
                    content: replyContent,
                    parentId: parentComment._id,
                });

            expect(res.statusCode).to.equal(201);
            expect(res.body).to.have.property('_id').that.is.a('string');
            expect(res.body).to.have.property('content', replyContent);
            expect(res.body).to.have.property('parentId', parentComment._id.toString());

            // Verify parent comment's repliesCount incremented
            const updatedParentComment = await Comment.findById(parentComment._id);
            expect(updatedParentComment.repliesCount).to.equal(1);

            // Verify notification emitted to parent comment author
            expect(ioToStub.calledOnce).to.be.true; // io.to() should have been called once
            expect(ioToStub.getCall(0).args[0]).to.equal(otherUser._id.toString()); // Recipient ID
            expect(emitStub.calledOnce).to.be.true; // .emit() should have been called once
            expect(emitStub.getCall(0).args[0]).to.equal('newNotification'); // Event name
            // Corrected assertions for senderId and recipientId to use .toString()
            expect(emitStub.getCall(0).args[1]).to.have.property('type', 'reply_comment'); // Notification data
            expect(emitStub.getCall(0).args[1].senderId.toString()).to.equal(testUser._id.toString()); // Convert ObjectId to string
            expect(emitStub.getCall(0).args[1].recipientId.toString()).to.equal(otherUser._id.toString()); // Convert ObjectId to string
            console.log("Successfully created reply and verified notification.");
        });

        it('should return 401 if user is not authenticated', async () => {
            const res = await request(app)
                .post('/api/comments')
                .send({
                    postId: testPost._id,
                    content: 'Comment without token',
                });

            expect(res.statusCode).to.equal(401);
            // Corrected expected error message to match middleware
            expect(res.body).to.have.property('error', 'No token provided or header is malformed.');
            console.log("Correctly handled unauthenticated comment creation.");
        });

        it('should return 400 if postId is missing', async () => {
            const res = await request(app)
                .post('/api/comments')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    content: 'Comment without postId',
                });

            expect(res.statusCode).to.equal(400);
            expect(res.body).to.have.property('error', 'A valid postId is required.');
            console.log("Correctly handled missing postId.");
        });

        it('should return 400 if postId is invalid format', async () => {
            const res = await request(app)
                .post('/api/comments')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    postId: 'invalid-id',
                    content: 'Comment with invalid postId',
                });

            expect(res.statusCode).to.equal(400);
            expect(res.body).to.have.property('error', 'A valid postId is required.');
            console.log("Correctly handled invalid postId format.");
        });

        it('should return 404 if post is not found', async () => {
            const nonExistentPostId = new mongoose.Types.ObjectId();
            const res = await request(app)
                .post('/api/comments')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    postId: nonExistentPostId,
                    content: 'Comment on non-existent post',
                });

            expect(res.statusCode).to.equal(404);
            expect(res.body).to.have.property('error', 'Post not found.');
            console.log("Correctly handled comment on non-existent post.");
        });

        it('should return 400 if content is missing', async () => {
            const res = await request(app)
                .post('/api/comments')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    postId: testPost._id,
                });

            expect(res.statusCode).to.equal(400);
            expect(res.body).to.have.property('error', 'Comment content cannot be empty.');
            console.log("Correctly handled missing comment content.");
        });

        it('should return 400 if content is empty string', async () => {
            const res = await request(app)
                .post('/api/comments')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    postId: testPost._id,
                    content: '   ', // Empty string after trim
                });

            expect(res.statusCode).to.equal(400);
            expect(res.body).to.have.property('error', 'Comment content cannot be empty.');
            console.log("Correctly handled empty comment content.");
        });

        it('should return 500 if content exceeds maxlength (1000 characters)', async () => {
            const longContent = 'a'.repeat(1001); // 1001 characters
            const res = await request(app)
                .post('/api/comments')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    postId: testPost._id,
                    content: longContent,
                });

            expect(res.statusCode).to.equal(500); // Mongoose validation error
            expect(res.body).to.have.property('error').that.includes('Comment validation failed: content: Path `content` (`' + longContent + '`) is longer than the maximum allowed length (1000).');
            console.log("Correctly handled comment content exceeding maxlength.");
        });

        it('should emit notification when a different user comments on the post', async () => {
            // Create a second user (post author)
            const postAuthorHashedPassword = await bcryptjs.hash('PostAuthorPassword123!', 10);
            const postAuthor = await User.create({
                username: 'postauthor',
                fullName: 'Post Author',
                email: 'postauthor@example.com',
                password: postAuthorHashedPassword,
                role: 'citizen',
                emailVerified: true,
            });

            // Update the testPost to be authored by postAuthor
            testPost.authorId = postAuthor._id;
            await testPost.save();
            console.log(`Pre-condition: Post author changed to ${postAuthor.fullName}.`);

            const commentContent = 'This comment should notify the post author.';
            const res = await request(app)
                .post('/api/comments')
                .set('Authorization', `Bearer ${authToken}`) // testUser comments on postAuthor's post
                .send({
                    postId: testPost._id,
                    content: commentContent,
                });

            expect(res.statusCode).to.equal(201);
            expect(ioToStub.calledOnce).to.be.true; // io.to() should have been called once
            expect(ioToStub.getCall(0).args[0]).to.equal(postAuthor._id.toString()); // Recipient ID
            expect(emitStub.calledOnce).to.be.true; // .emit() should have been called once
            expect(emitStub.getCall(0).args[0]).to.equal('newNotification'); // Event name
            // Corrected assertions for senderId and recipientId to use .toString()
            expect(emitStub.getCall(0).args[1]).to.have.property('type', 'comment_post'); // Notification data
            expect(emitStub.getCall(0).args[1].senderId.toString()).to.equal(testUser._id.toString());
            expect(emitStub.getCall(0).args[1].recipientId.toString()).to.equal(postAuthor._id.toString());
            console.log("Successfully emitted notification for new comment on post.");
        });

        it('should NOT emit notification when post author comments on their own post', async () => {
            // testUser is already the author of testPost
            const commentContent = 'This comment should NOT notify the post author.';
            const res = await request(app)
                .post('/api/comments')
                .set('Authorization', `Bearer ${authToken}`) // testUser comments on their own post
                .send({
                    postId: testPost._id,
                    content: commentContent,
                });

            expect(res.statusCode).to.equal(201);
            expect(ioToStub.called).to.be.false; // io.to() should not have been called
            expect(emitStub.called).to.be.false; // io.to().emit() should not have been called
            console.log("Correctly did NOT emit notification when post author comments on their own post.");
        });
    });

    // --- Test Cases for GET /api/comments/:postId ---
    describe('GET /api/comments/:postId', () => {
        let comment1, comment2, reply1;

        beforeEach(async () => {
            // Create a second user
            const otherUserHashedPassword = await bcryptjs.hash('OtherUserPassword123!', 10);
            const otherUser = await User.create({
                username: 'otheruserget',
                fullName: 'Other User Get',
                email: 'otherget@example.com',
                password: otherUserHashedPassword,
                role: 'citizen',
                emailVerified: true,
            });

            // Create comments and replies
            comment1 = await Comment.create({
                postId: testPost._id,
                authorId: testUser._id,
                authorName: testUser.fullName,
                content: 'First comment on the post.',
                createdAt: new Date(Date.now() - 20000), // Older
            });
            comment2 = await Comment.create({
                postId: testPost._id,
                authorId: otherUser._id,
                authorName: otherUser.fullName,
                content: 'Second comment on the post.',
                createdAt: new Date(Date.now() - 10000), // Newer than comment1
            });
            reply1 = await Comment.create({
                postId: testPost._id,
                authorId: testUser._id,
                authorName: testUser.fullName,
                content: 'A reply to the first comment.',
                parentId: comment1._id,
                createdAt: new Date(Date.now() - 5000), // Newer than comment2
            });

            // Manually update repliesCount for parent comment
            await Comment.findByIdAndUpdate(comment1._id, { $inc: { repliesCount: 1 } });
            console.log("Pre-condition: Created multiple comments and a reply for GET tests.");
        });

        it('should successfully retrieve all comments for a given post, sorted by creation date (descending)', async () => {
            const res = await request(app)
                .get(`/api/comments/${testPost._id}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body).to.be.an('array').and.have.lengthOf(3);

            // Verify sorting (newest first)
            expect(res.body[0]._id).to.equal(reply1._id.toString());
            expect(res.body[1]._id).to.equal(comment2._id.toString());
            expect(res.body[2]._id).to.equal(comment1._id.toString());

            // Verify population of authorId
            expect(res.body[0].authorId).to.have.property('fullName', testUser.fullName);
            expect(res.body[0].authorId).to.have.property('profileImage');
            expect(res.body[1].authorId).to.have.property('fullName', 'Other User Get');
            expect(res.body[2].authorId).to.have.property('fullName', testUser.fullName);

            // Verify parentId and repliesCount
            expect(res.body[0].parentId).to.equal(comment1._id.toString());
            expect(res.body[2].repliesCount).to.equal(1);
            console.log("Successfully retrieved and verified comments by post.");
        });

        it('should return an empty array if no comments exist for the post', async () => {
            // Create a new post with no comments
            const newPost = await Post.create({
                title: 'Post with no comments',
                content: 'Content',
                authorId: testUser._id,
                authorName: testUser.fullName,
                category: 'General',
                type: 'Discussion', // Corrected type
                status: 'ACTIVE', // Corrected status
            });
            console.log(`Pre-condition: Created new post ${newPost._id} with no comments.`);

            const res = await request(app)
                .get(`/api/comments/${newPost._id}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body).to.be.an('array').and.be.empty;
            console.log("Correctly returned empty array for post with no comments.");
        });

        it('should return 400 if postId is invalid format', async () => {
            const res = await request(app)
                .get('/api/comments/invalid-post-id');

            expect(res.statusCode).to.equal(400);
            expect(res.body).to.have.property('error', 'A valid postId is required.');
            console.log("Correctly handled invalid postId format for GET comments.");
        });

        it('should return 200 with empty array if post does not exist (but ID is valid format)', async () => {
            const nonExistentPostId = new mongoose.Types.ObjectId();
            const res = await request(app)
                .get(`/api/comments/${nonExistentPostId}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body).to.be.an('array').and.be.empty;
            console.log("Correctly returned empty array for non-existent post with valid ID format.");
        });
    });

    // --- Test Cases for PATCH /api/comments/:commentId/like ---
    describe('PATCH /api/comments/:commentId/like', () => {
        let targetComment;
        let otherUser;

        beforeEach(async () => {
            // Create a second user (who will be the liker)
            const otherUserHashedPassword = await bcryptjs.hash('LikerPassword123!', 10);
            otherUser = await User.create({
                username: 'likeruser',
                fullName: 'Liker User',
                email: 'liker@example.com',
                password: otherUserHashedPassword,
                role: 'citizen',
                emailVerified: true,
            });

            // Create a comment by the testUser (who will be the author of the liked comment)
            targetComment = await Comment.create({
                postId: testPost._id,
                authorId: testUser._id,
                authorName: testUser.fullName,
                content: 'Comment to be liked.',
            });
            console.log(`Pre-condition: Created comment ${targetComment._id} by ${testUser.fullName}.`);
        });

        it('should successfully like a comment and emit a notification', async () => {
            const likerAuthToken = jwt.sign(
                { userId: otherUser._id, role: otherUser.role, fullName: otherUser.fullName },
                JWT_SECRET,
                { expiresIn: '1h' }
            );

            const res = await request(app)
                .patch(`/api/comments/${targetComment._id}/like`)
                .set('Authorization', `Bearer ${likerAuthToken}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body).to.have.property('_id', targetComment._id.toString());
            expect(res.body.likes).to.include(otherUser._id.toString());
            expect(res.body.likes).to.have.lengthOf(1);

            // Verify like in DB
            const updatedComment = await Comment.findById(targetComment._id);
            expect(updatedComment.likes).to.include(otherUser._id);
            expect(updatedComment.likes).to.have.lengthOf(1);

            // Verify notification emitted to comment author (testUser)
            expect(ioToStub.calledOnce).to.be.true; // io.to() should have been called once
            expect(ioToStub.getCall(0).args[0]).to.equal(testUser._id.toString()); // Recipient ID
            expect(emitStub.calledOnce).to.be.true; // .emit() should have been called once
            expect(emitStub.getCall(0).args[0]).to.equal('newNotification'); // Event name
            // Corrected assertions for senderId and recipientId to use .toString()
            expect(emitStub.getCall(0).args[1]).to.have.property('type', 'like_comment'); // Notification data
            expect(emitStub.getCall(0).args[1].senderId.toString()).to.equal(otherUser._id.toString());
            expect(emitStub.getCall(0).args[1].recipientId.toString()).to.equal(testUser._id.toString());
            console.log("Successfully liked comment and emitted notification.");
        });

        it('should successfully unlike a comment (if already liked)', async () => {
            // First, make the otherUser like the comment
            await Comment.findByIdAndUpdate(targetComment._id, { $addToSet: { likes: otherUser._id } });
            console.log("Pre-condition: Comment initially liked by otherUser.");

            const likerAuthToken = jwt.sign(
                { userId: otherUser._id, role: otherUser.role, fullName: otherUser.fullName },
                JWT_SECRET,
                { expiresIn: '1h' }
            );

            const res = await request(app)
                .patch(`/api/comments/${targetComment._id}/like`)
                .set('Authorization', `Bearer ${likerAuthToken}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body).to.have.property('_id', targetComment._id.toString());
            expect(res.body.likes).to.not.include(otherUser._id.toString());
            expect(res.body.likes).to.be.empty;

            // Verify unlike in DB
            const updatedComment = await Comment.findById(targetComment._id);
            expect(updatedComment.likes).to.not.include(otherUser._id);
            expect(updatedComment.likes).to.be.empty;

            // Verify no notification emitted on unlike
            expect(ioToStub.called).to.be.false; // io.to() should not have been called
            expect(emitStub.called).to.be.false; // io.to().emit() should not have been called
            console.log("Successfully unliked comment.");
        });

        it('should NOT emit notification if comment author likes their own comment', async () => {
            // The testUser is the author of targetComment and also the liker
            const res = await request(app)
                .patch(`/api/comments/${targetComment._id}/like`)
                .set('Authorization', `Bearer ${authToken}`); // testUser's token

            expect(res.statusCode).to.equal(200);
            expect(res.body.likes).to.include(testUser._id.toString());
            expect(ioToStub.called).to.be.false; // io.to() should not have been called
            expect(emitStub.called).to.be.false; // io.to().emit() should not have been called
            console.log("Correctly did NOT emit notification when author likes their own comment.");
        });

        it('should return 401 if user is not authenticated', async () => {
            const res = await request(app)
                .patch(`/api/comments/${targetComment._id}/like`); // No token

            expect(res.statusCode).to.equal(401);
            // Corrected expected error message to match middleware
            expect(res.body).to.have.property('error', 'No token provided or header is malformed.');
            console.log("Correctly handled unauthenticated like toggle.");
        });

        it('should return 400 if commentId is invalid format', async () => {
            const res = await request(app)
                .patch('/api/comments/invalid-id/like')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.statusCode).to.equal(400);
            expect(res.body).to.have.property('error', 'Invalid commentId.');
            console.log("Correctly handled invalid commentId format for like toggle.");
        });

        it('should return 404 if comment is not found', async () => {
            const nonExistentCommentId = new mongoose.Types.ObjectId();
            const res = await request(app)
                .patch(`/api/comments/${nonExistentCommentId}/like`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.statusCode).to.equal(404);
            expect(res.body).to.have.property('error', 'Comment not found.');
            console.log("Correctly handled like toggle on non-existent comment.");
        });
    });

    // --- Test Cases for DELETE /api/comments/:commentId ---
    describe('DELETE /api/comments/:commentId', () => {
        let commentToDelete;
        let parentComment;
        let otherUser; // A user who is not the author

        beforeEach(async () => {
            // Create a parent comment for testing repliesCount decrement
            parentComment = await Comment.create({
                postId: testPost._id,
                authorId: testUser._id,
                authorName: testUser.fullName,
                content: 'This is a parent comment.',
                repliesCount: 1, // Simulate it already has a reply
            });
            // Create a reply to the parent comment that will be deleted
            commentToDelete = await Comment.create({ // Assign to commentToDelete
                postId: testPost._id,
                authorId: testUser._id,
                authorName: testUser.fullName,
                content: 'This reply will be deleted, affecting parent repliesCount.',
                parentId: parentComment._id,
            });
            console.log(`Pre-condition: Created comment to delete: ${commentToDelete._id}.`);


            // Create another user for unauthorized deletion attempts
            const otherUserHashedPassword = await bcryptjs.hash('OtherUserDeletePassword123!', 10);
            otherUser = await User.create({
                username: 'otheruserdelete',
                fullName: 'Other User Delete',
                email: 'otherdelete@example.com',
                password: otherUserHashedPassword,
                role: 'citizen',
                emailVerified: true,
            });
            console.log(`Pre-condition: Created parent comment ${parentComment._id} and other user ${otherUser.fullName}.`);
        });

        it('should successfully soft delete a comment by its author', async () => {
            const res = await request(app)
                .delete(`/api/comments/${commentToDelete._id}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body).to.have.property('message', 'Comment successfully deleted.');
            expect(res.body).to.have.property('commentId', commentToDelete._id.toString());
            expect(res.body).to.have.property('postId', testPost._id.toString());
            expect(res.body).to.have.property('parentId', parentComment._id.toString());

            // Verify comment is marked as deleted in DB
            const deletedComment = await Comment.findById(commentToDelete._id);
            expect(deletedComment).to.exist;
            expect(deletedComment.isDeleted).to.be.true;
            expect(deletedComment.content).to.equal('This message was deleted.');
            // Removed the attachments assertion as it's not in your schema
            // expect(deletedComment.attachments).to.be.an('array').and.be.empty;

            // Verify parent comment repliesCount decremented
            const updatedParentComment = await Comment.findById(parentComment._id);
            expect(updatedParentComment.repliesCount).to.equal(0); // Was 1, now 0
            console.log("Successfully soft deleted comment by author and decremented parent repliesCount.");
        });

        it('should return 401 if user is not authenticated', async () => {
            const res = await request(app)
                .delete(`/api/comments/${commentToDelete._id}`); // No token

            expect(res.statusCode).to.equal(401);
            // Corrected expected error message to match middleware
            expect(res.body).to.have.property('error', 'No token provided or header is malformed.');
            console.log("Correctly handled unauthenticated comment deletion.");
        });

        it('should return 400 if commentId is invalid format', async () => {
            const res = await request(app)
                .delete('/api/comments/invalid-id')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.statusCode).to.equal(400);
            expect(res.body).to.have.property('error', 'Invalid commentId.');
            console.log("Correctly handled invalid commentId format for deletion.");
        });

        it('should return 404 if comment is not found', async () => {
            const nonExistentCommentId = new mongoose.Types.ObjectId();
            const res = await request(app)
                .delete(`/api/comments/${nonExistentCommentId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.statusCode).to.equal(404);
            expect(res.body).to.have.property('error', 'Comment not found.');
            console.log("Correctly handled deletion of non-existent comment.");
        });

        it('should return 403 if user is not the author of the comment', async () => {
            const otherUserAuthToken = jwt.sign(
                { userId: otherUser._id, role: otherUser.role, fullName: otherUser.fullName },
                JWT_SECRET,
                { expiresIn: '1h' }
            );

            const res = await request(app)
                .delete(`/api/comments/${commentToDelete._id}`)
                .set('Authorization', `Bearer ${otherUserAuthToken}`); // Other user tries to delete

            expect(res.statusCode).to.equal(403);
            expect(res.body).to.have.property('error', 'Access Denied: You are not authorized to delete this comment.');
            console.log("Correctly handled unauthorized comment deletion.");
        });

        it('should return 404 if comment is already soft deleted', async () => {
            // Manually soft delete the comment first
            await Comment.findByIdAndUpdate(commentToDelete._id, { isDeleted: true, content: 'This message was deleted.' });
            console.log("Pre-condition: Comment already soft deleted.");

            const res = await request(app)
                .delete(`/api/comments/${commentToDelete._id}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.statusCode).to.equal(404); // Controller returns 404 for "already deleted"
            expect(res.body).to.have.property('error', 'This comment has already been deleted.');
            console.log("Correctly handled deletion of already soft-deleted comment.");
        });
    });
});
