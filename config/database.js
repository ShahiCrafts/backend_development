const mongoose = require('mongoose');

const connectDb = async() => {
    try {
        await mongoose.connect(process.env.DB_URI);
        console.log('Database Connection Successful!');
    } catch(error) {
        console.error('MongoDB Connection Failed!', error.message);
        process.exit(1);
    }
}

module.exports = connectDb;