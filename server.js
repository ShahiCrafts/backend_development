// Importing express module into our file
const express = require('express'); // express => web framework to build WebAPIs, such as handling routes, HTTP requests, middleware, etc.
// Importing dotenv module into our file
const dotenv = require('dotenv'); // dotenv => loads .env config file into process.env
// Importing connectDB() method from database.js
const connectDB = require('./config/database');
const errorHandler = require('././middleware/errorHandler')

const cors = require('cors');

dotenv.config(); // Configuring the environment variables.

connectDB(); // requesting a connection to MongoDB server using Mongoose.

// const variable to hold instance of the express application after initialization.
const app = express(); // This object(app) is used to configure app, define routes and start the server.

app.use(cors());
app.use(errorHandler);

// This method is used to add middleware to our application.
app.use(express.json()); // express.json() is used to parse incoming JSON requests.

// This method mounts the middleware to the specified path.
// app.use('/api/users', require('./routes/userRoute')); // This is the base url that the routes in the userRoutes will be associated with.
// Any requests that starts with /api/users will be handles by userRoutes.
app.use('/auth', require('./routes/authRoutes'))
// declares a constant port that our application will listen on.
const PORT = process.env.PORT || 8080; // || 8080: This is a fallback value, if process.env.PORT is not defined, the application will fall back to port 8080.

// This method tells express to start the server and listen for incoming requests on the specified port.
app.listen(PORT, ()=> {
    console.log(`Server running on port ${PORT}`);
});

// This defines a GET route for the path '/' root URL.
app.get('/', (req, res) => {
    res.send('API is running on port 8080');
});