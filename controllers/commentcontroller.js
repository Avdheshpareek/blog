const Post = require("../models/post");
const Comment = require("../models/comment");

exports.createComment = async (req, res) => {
    try {
        // Fetch data from request body
        const { post, body } = req.body;
        const user = req.user.name;
        const loggedInRole = (req.user.role || "").toLowerCase();

        const targetPost = await Post.findById(post).populate("author", "role");
        if (!targetPost) {
            return res.status(404).json({
                error: "Post not found",
            });
        }

        const authorRole = targetPost.author?.role || "admin";
        if (loggedInRole === "member" && authorRole !== "admin") {
            return res.status(403).json({
                error: "Members can comment only on admin thoughts",
            });
        }

        // Create a comment object
        const comment = new Comment({ post, user, body });

        // Save the new comment into the database
        const savedComment = await comment.save();

        // Find the Post by ID and add the new comment ID to its comments array
        const updatedPost = await Post.findByIdAndUpdate(
            post, 
            { $push: { comments: savedComment._id } }, 
            { new: true } // Returns the updated document
        )
        .populate("comments") // Populates the comments array with actual documents
        .exec();

        res.json({
            post: updatedPost,
        });
    } catch (error) {
        return res.status(500).json({
            error: "Error while creating comment",
        });
    }
};
