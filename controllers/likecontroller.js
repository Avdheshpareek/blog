const Post = require("../models/post");
const Like = require("../models/like");

// Like a Post
exports.likePost = async (req, res) => {
    try {
        const { post } = req.body;
        const userId = req.user._id.toString();
        const legacyUserName = req.user.name;
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
                error: "Members can like only admin thoughts",
            });
        }

        const existingLike = await Like.findOne({
            post,
            user: { $in: [userId, legacyUserName] },
        });
        if (existingLike) {
            return res.status(409).json({
                error: "You have already liked this post",
            });
        }

        const like = new Like({ post, user: userId });
        const savedLike = await like.save();

        // Update the Post collection
        const updatedPost = await Post.findByIdAndUpdate(
            post,
            { $push: { likes: savedLike._id } },
            { new: true }
        )
        .populate("likes")
        .exec();

        res.json({
            post: updatedPost,
        });
    } catch (error) {
        return res.status(400).json({
            error: "Error while liking post",
        });
    }
};

// Unlike a Post
exports.unlikePost = async (req, res) => {
    try {
        const { post } = req.body;
        const userId = req.user._id.toString();
        const legacyUserName = req.user.name;

        const existingLikes = await Like.find({
            post,
            user: { $in: [userId, legacyUserName] },
        }).select("_id");

        if (!existingLikes.length) {
            return res.status(404).json({
                error: "Like not found for this user",
            });
        }

        const likeIds = existingLikes.map((like) => like._id);

        await Like.deleteMany({
            _id: { $in: likeIds },
        });

        // Update the Post collection to remove the like ID
        const updatedPost = await Post.findByIdAndUpdate(
            post,
            { $pull: { likes: { $in: likeIds } } },
            { new: true }
        )
            .populate("likes")
            .exec();

        res.json({
            post: updatedPost,
        });
    } catch (error) {
        return res.status(400).json({
            error: error?.message || "Error while unliking post",
        });
    }
};
