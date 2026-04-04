const mongoose = require("mongoose");

// Define the Post Schema
const postSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        body: {
            type: String,
            required: true,
            trim: true,
        },
        image: {
            type: String,
            default: "",
        },
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        likes: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Like", // Reference to the Like model
            },
        ],
        comments: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Comment", // Reference to the Comment model
            },
        ],
    },
    {
        timestamps: true,
    }
);

// Export the model
module.exports = mongoose.model("Post", postSchema);
