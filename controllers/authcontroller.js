const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");

function normalizeRole(role) {
    const roleValue = (role || "student").toLowerCase();
    return roleValue === "member" ? "student" : roleValue;
}

exports.signup = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const normalizedEmail = email?.trim().toLowerCase();
        const normalizedName = name?.trim();

        if (!normalizedName || !normalizedEmail || !password) {
            return res.status(400).json({
                error: "Name, email and password are required",
            });
        }

        const normalizedRole = normalizeRole(role);
        if (!["admin", "student"].includes(normalizedRole)) {
            return res.status(400).json({
                error: "Role must be admin or student",
            });
        }

        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(409).json({
                error: "User already exists with this email",
            });     
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            name: normalizedName,
            email: normalizedEmail,
            password: hashedPassword,
            role: normalizedRole,
        });

        return res.status(201).json({
            message: "Signup successful",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        return res.status(500).json({
            error: "Error while signing up",
        });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = email?.trim().toLowerCase();

        if (!normalizedEmail || !password) {
            return res.status(400).json({
                error: "Email and password are required",
            });
        }

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(401).json({
                error: "Invalid credentials",
            });
        }

        let isPasswordValid = false;

        if (typeof user.password === "string" && user.password.startsWith("$2")) {
            isPasswordValid = await bcrypt.compare(password, user.password);
        } else if (typeof user.password === "string" && user.password === password) {
            isPasswordValid = true;
            user.password = await bcrypt.hash(password, 10);
            await user.save();
        }

        if (!isPasswordValid) {
            return res.status(401).json({
                error: "Invalid credentials",
            });
        }

        const token = jwt.sign(
            {
                userId: user._id,
                email: user.email,
                name: user.name,
                role: normalizeRole(user.role),
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        return res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: normalizeRole(user.role),
            },
        });
    } catch (error) {
        return res.status(500).json({
            error: "Error while logging in",
        });
    }
};
