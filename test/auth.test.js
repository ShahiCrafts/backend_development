const request = require('supertest');
const { expect } = require('chai');
const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config({ path: './.env.test' });
dotenv.config({ path: './.env' });

const app = require('../server');
const User = require('../models/userModel');
const EmailVerification = require('../models/emailVerificationModel');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error("JWT_SECRET is not defined.");
    process.exit(1);
}

describe('Authentication API', () => {
    before(async () => {
        const mongoUri = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/mern_test_db';
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(mongoUri, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
            });
        } else if (mongoose.connection.name !== 'mern_test_db') {
            await mongoose.disconnect();
            await mongoose.connect(mongoUri, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
            });
        }
    });

    beforeEach(async () => {
        if (mongoose.connection.readyState !== 1) return;
        await User.deleteMany({});
        await EmailVerification.deleteMany({});
    });

    after(async () => {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.dropDatabase();
            await mongoose.connection.close();
        }
    });

    describe('POST /api/auth/register', () => {
        it('should successfully register a new user with valid credentials and a verified email', async () => {
            const testEmail = 'newuser@example.com';
            const testPassword = 'TestPassword123!';
            const testFullName = 'Test User';

            await EmailVerification.create({
                email: testEmail,
                code: '123456',
                isVerified: true,
                expiresAt: new Date(Date.now() + 3600000)
            });

            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: testEmail,
                    password: testPassword,
                    fullName: testFullName,
                    role: 'citizen'
                });

            expect(res.statusCode).to.equal(200);
            expect(res.body).to.have.property('message', 'Account Successfully Created!');
            expect(res.body).to.have.property('token').that.is.a('string');
            expect(res.body).to.have.property('user').that.is.an('object');

            const { user } = res.body;
            expect(user).to.have.property('id').that.is.a('string');
            expect(user).to.have.property('fullName', testFullName);
            expect(user).to.have.property('email', testEmail);
            expect(user).to.have.property('role', 'citizen');
            expect(user).to.have.property('username').that.is.a('string');

            const createdUser = await User.findById(user.id).select('+password');
            expect(createdUser).to.exist;
            expect(createdUser.email).to.equal(testEmail);
            expect(createdUser.fullName).to.equal(testFullName);
            expect(createdUser.role).to.equal('citizen');
            expect(createdUser.emailVerified).to.be.true;

            const isPasswordMatch = await bcryptjs.compare(testPassword, createdUser.password);
            expect(isPasswordMatch).to.be.true;

            const emailVerificationRecord = await EmailVerification.findOne({ email: testEmail });
            expect(emailVerificationRecord).to.not.exist;

            const decodedToken = jwt.verify(res.body.token, JWT_SECRET);
            expect(decodedToken).to.have.property('id', user.id);
            expect(decodedToken).to.have.property('role', 'citizen');
            expect(decodedToken).to.have.property('exp').that.is.a('number');
        });

        it('should return 400 if email already exists', async () => {
            const existingEmail = 'existing@example.com';
            const existingPassword = 'ExistingPassword123!';
            const existingFullName = 'Existing User';

            const hashedPassword = await bcryptjs.hash(existingPassword, 10);
            await User.create({
                email: existingEmail,
                password: hashedPassword,
                fullName: existingFullName,
                username: 'existinguser',
                emailVerified: true
            });

            await EmailVerification.create({
                email: existingEmail,
                code: '987654',
                isVerified: true,
                expiresAt: new Date(Date.now() + 3600000)
            });

            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: existingEmail,
                    password: 'NewPassword123!',
                    fullName: 'Another User',
                    role: 'citizen'
                });

            expect(res.statusCode).to.equal(400);
            expect(res.body).to.have.property('message', 'Account with this email already exists.');
        });

        it('should return 403 if email is not verified', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'unverified@example.com',
                    password: 'SomePassword123!',
                    fullName: 'Unverified User',
                    role: 'citizen'
                });

            expect(res.statusCode).to.equal(403);
            expect(res.body).to.have.property('message', 'Email must be verified before registration.');
        });
    });

    describe('POST /api/auth/login', () => {
        const userEmail = 'loginuser@example.com';
        const userPassword = 'LoginPassword123!';
        let userId;

        beforeEach(async () => {
            const hashedPassword = await bcryptjs.hash(userPassword, 10);
            const user = await User.create({
                email: userEmail,
                password: hashedPassword,
                fullName: 'Login Test User',
                username: 'logintestuser',
                role: 'citizen',
                emailVerified: true,
                isActive: true,
                isBanned: false,
            });
            userId = user._id;
        });

        it('should successfully log in with correct credentials', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: userEmail,
                    password: userPassword
                });

            expect(res.statusCode).to.equal(200);
            expect(res.body).to.have.property('message', 'Login successful!');
            expect(res.body).to.have.property('token').that.is.a('string');
            expect(res.body).to.have.property('user').that.is.an('object');

            const { user } = res.body;
            expect(user).to.have.property('id', userId.toString());
            expect(user).to.have.property('email', userEmail);
            expect(user).to.have.property('fullName', 'Login Test User');
            expect(user).to.have.property('username', 'logintestuser');
            expect(user).to.have.property('role', 'citizen');
            expect(user).to.have.property('isActive', true);

            const updatedUser = await User.findById(userId);
            expect(updatedUser.lastLogin).to.exist;

            const decodedToken = jwt.verify(res.body.token, JWT_SECRET);
            expect(decodedToken).to.have.property('userId', userId.toString());
            expect(decodedToken).to.have.property('role', 'citizen');
            expect(decodedToken).to.have.property('fullName', 'Login Test User');
        });

        it('should return 401 for incorrect password', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: userEmail,
                    password: 'WrongPassword123!'
                });

            expect(res.statusCode).to.equal(401);
            expect(res.body).to.have.property('message', 'Password Incorrect!');
        });

        it('should return 400 for non-existent user', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'AnyPassword123!'
                });

            expect(res.statusCode).to.equal(400);
            expect(res.body).to.have.property('message', 'User not found! Please sign up..');
        });

        it('should return 403 if the user account is banned', async () => {
            await User.findByIdAndUpdate(userId, { isBanned: true });

            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: userEmail,
                    password: userPassword
                });

            expect(res.statusCode).to.equal(403);
            expect(res.body).to.have.property('message', 'Your account has been suspended! Please contact support.');
        });

        it('should return 400 if user has no password set', async () => {
            await User.findByIdAndUpdate(userId, { $unset: { password: 1 } });

            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: userEmail,
                    password: userPassword
                });

            expect(res.statusCode).to.equal(400);
            expect(res.body).to.have.property('message', 'User account has no password set. Please reset password or contact support.');
        });

        it('should return 500 if email is missing in request body', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    password: userPassword
                });

            expect(res.statusCode).to.equal(500);
            expect(res.body).to.have.property('message', 'Server error. Please try again later.');
        });

        it('should return 500 if password is missing in request body', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: userEmail
                });

            expect(res.statusCode).to.equal(500);
            expect(res.body).to.have.property('message', 'Server error. Please try again later.');
        });
    });
});
