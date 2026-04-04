const express = require("express");
const router = express.Router();
const { auth, isAdmin } = require("../middleware/auth");

// Import Controllers
const { createPost, getAllPosts, getMyPosts, getAdminPosts, updatePost, deletePost } = require("../controllers/postcontroller");
const { createComment } = require("../controllers/commentcontroller");
const { likePost, unlikePost } = require("../controllers/likecontroller");

// Mapping Routes
router.post("/posts/create", auth, createPost);
router.get("/posts", getAllPosts);
router.get("/posts/mine", auth, getMyPosts);
router.get("/posts/admin", auth, isAdmin, getAdminPosts);
router.put("/posts/:id", auth, updatePost);
router.delete("/posts/:id", auth, deletePost);
router.post("/posts/delete", auth, deletePost);
router.post("/comments/create", auth, createComment);
router.post("/likes/like", auth, likePost);
router.post("/likes/unlike", auth, unlikePost);

module.exports = router;
