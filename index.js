const express = require("express");
const app = express();
const cors = require("cors");
const BODY_LIMIT = process.env.BODY_LIMIT || "50mb";

// 1. Load environment variables (Port and DB URL)
require("dotenv").config();
const PORT = process.env.PORT || 4000;

// 2. Middleware
// CORS allows your frontend to send requests to your API
app.use(cors());

// This middleware parses incoming JSON requests (crucial for comments/likes)
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

// This serves your public folder (HTML, Vibrant CSS, and JS)
app.use(express.static("public"));

// 3. Import Routes
// Ensure this matches the file name in your 'routes' folder
const blogRoutes = require("./routes/blog");
const authRoutes = require("./routes/auth");

// 4. Mount Routes
// Your API endpoints will be accessed at http://localhost:4000/api/v1/...
app.use("/api/v1", blogRoutes);
app.use("/api/v1/auth", authRoutes);

// 5. Connect to the Database
// This calls the connection logic we wrote in config/database.js
const dbConnect = require("./config/database");
dbConnect();

if (!process.env.JWT_SECRET) {
    console.warn("JWT_SECRET is missing in .env. Login will not work without it.");
}

// 6. Start the Server
app.listen(PORT, () => {
    console.log(`
    🚀 Server is flying at http://localhost:${PORT}
    🎨 Frontend is ready with Vibrant Glassmorphism!
    `);
});

// 7. Error Handling Middleware (Optional but recommended)
app.use((err, req, res, next) => {
    const isPayloadTooLarge =
        err?.type === "entity.too.large" ||
        err?.status === 413 ||
        err?.statusCode === 413 ||
        err?.name === "PayloadTooLargeError" ||
        /too large/i.test(err?.message || "");

    if (isPayloadTooLarge) {
        return res.status(413).json({
            error: "Image is too large. Please choose a smaller image.",
        });
    }

    console.error(err.stack);
    res.status(500).send({ error: 'Something went wrong on the server!' });
});
