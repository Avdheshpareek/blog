const jwt = require("jsonwebtoken");
const User = require("../models/user");

exports.auth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "Authentication token missing",
            });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.userId).select("_id name email role");
        if (!user) {
            return res.status(401).json({
                error: "User not found for this token",
            });
        }

        if ((user.role || "").toLowerCase() === "member") {
            user.role = "student";
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({
            error: "Invalid or expired token",
        });
    }
};

exports.isAdmin = (req, res, next) => {
    const userRole = (req.user?.role || "").toLowerCase();
    if (userRole !== "admin") {
        return res.status(403).json({
            error: "Only admin users can perform this action",
        });
    }
    next();
};
