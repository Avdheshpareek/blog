const Post = require("../models/post");
const Comment = require("../models/comment");
const Like = require("../models/like");

function isAdminUser(user) {
    return (user?.role || "").toLowerCase() === "admin";
}

function isPostOwner(post, user) {
    if (!post?.author || !user?._id) return false;
    const authorId = post.author._id ? post.author._id.toString() : post.author.toString();
    return authorId === user._id.toString();
}

function canAdminEditPost(post, user) {
    return isAdminUser(user);
}

// Create a new Post
exports.createPost = async (req, res) => {
    try {
        const { title, body, image } = req.body;

        if (!title?.trim() || !body?.trim()) {
            return res.status(400).json({
                error: "Title and body are required",
            });
        }

        const post = new Post({
            title: title.trim(),
            body: body.trim(),
            image: (image || "").trim(),
            author: req.user._id,
        });
        const savedPost = await post.save();

        res.json({
            post: savedPost,
        });
    } catch (error) {
        return res.status(400).json({
            error: "Error while creating post",
        });
    }
};

// Get all Posts (to show in the feed)
exports.getAllPosts = async (req, res) => {
    try {
        const posts = await Post.find()
            .populate("author", "name role")
            .populate("comments")
            .populate("likes")
            .exec();
        res.json({
            posts,
        });
    } catch (error) {
        return res.status(400).json({
            error: "Error while fetching posts",
        });
    }
};

exports.getMyPosts = async (req, res) => {
    try {
        const posts = await Post.find({ author: req.user._id })
            .populate("author", "name role")
            .populate("comments")
            .populate("likes")
            .sort({ createdAt: -1 })
            .exec();

        return res.json({
            posts,
        });
    } catch (error) {
        return res.status(400).json({
            error: "Error while fetching your posts",
        });
    }
};

exports.getAdminPosts = async (req, res) => {
    try {
        const posts = await Post.find()
            .populate("author", "name role")
            .populate("comments")
            .populate("likes")
            .sort({ createdAt: -1 })
            .exec();

        return res.json({
            posts,
        });
    } catch (error) {
        return res.status(400).json({
            error: "Error while fetching admin posts",
        });
    }
};

exports.updatePost = async (req, res) => {
    try {
        const id = req.params.id || req.body.id || req.body.postId;
        const { title, body, image } = req.body;

        if (!id) {
            return res.status(400).json({
                error: "Post id is required",
            });
        }

        const existingPost = await Post.findById(id).populate("author", "role");
        if (!existingPost) {
            return res.status(404).json({
                error: "Post not found",
            });
        }

        const canEdit = isPostOwner(existingPost, req.user) || canAdminEditPost(existingPost, req.user);
        if (!canEdit) {
            return res.status(403).json({
                error: "You can edit only your own posts (admins can edit student posts)",
            });
        }

        if (typeof title === "string" && !title.trim()) {
            return res.status(400).json({
                error: "Title cannot be empty",
            });
        }

        if (typeof body === "string" && !body.trim()) {
            return res.status(400).json({
                error: "Body cannot be empty",
            });
        }

        if (typeof title === "string") existingPost.title = title.trim();
        if (typeof body === "string") existingPost.body = body.trim();
        if (typeof image === "string") existingPost.image = image.trim();

        const updatedPost = await existingPost.save();

        return res.json({
            post: updatedPost,
            message: "Post updated successfully",
        });
    } catch (error) {
        return res.status(400).json({
            error: "Error while updating post",
        });
    }
};

// Delete a post and its related likes/comments
exports.deletePost = async (req, res) => {
    try {
        const id = req.params.id || req.body.id || req.body.postId;

        if (!id) {
            return res.status(400).json({
                error: "Post id is required",
            });
        }

        const existingPost = await Post.findById(id);

        if (!existingPost) {
            return res.status(404).json({
                error: "Post not found",
            });
        }

        const canDelete = isAdminUser(req.user) || isPostOwner(existingPost, req.user);
        if (!canDelete) {
            return res.status(403).json({
                error: "You can delete only your own posts",
            });
        }

        const deletedPost = await Post.findByIdAndDelete(id);
        await Comment.deleteMany({ post: id });
        await Like.deleteMany({ post: id });

        return res.json({
            message: "Post deleted successfully",
            post: deletedPost,
        });
    } catch (error) {
        return res.status(400).json({
            error: "Error while deleting post",
        });
    }
};
