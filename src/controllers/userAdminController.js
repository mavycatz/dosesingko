import crypto from "crypto";
import sgMail from "@sendgrid/mail";
import User from "../models/User.js";

export const showUserAdminPage = async (req, res) => {
  try {
    const { search, role } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { role: { $regex: search, $options: "i" } },
      ];
    }

    if (role) {
      filter.role = role;
    }

    const users = await User.find(filter).sort({ createdAt: -1 }).lean();

    const totalUsers = await User.countDocuments();
    const activeUsers = users.filter(u => !u.lockUntil || u.lockUntil < new Date()).length;
    const administrators = users.filter(u => u.role === "admin").length;
    const activeToday = users.filter(u => u.lastLogin && new Date(u.lastLogin).toDateString() === new Date().toDateString()).length;

    const successMessage = req.query.success || null;

    res.render("analytics/userAdmin", {
      users,
      totalUsers,
      activeUsers,
      administrators,
      activeToday,
      successMessage,
      search: search || "",
      selectedRole: role || ""
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};


export const addUserForm = (req, res) => {
  res.render("analytics/userAdmin");
};

export const createUser = async (req, res) => {
  try {
    const { username, email, role } = req.body;

    const tempPassword = Math.random().toString(36).slice(-8);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const token = crypto.randomBytes(32).toString("hex");

    const user = await User.create({
      username,
      email,
      password: tempPassword,
      role,
      otp,
      otpExpires: Date.now() + 15 * 60 * 1000, 
      verificationToken: token,
      verificationTokenExpires: Date.now() + 15 * 60 * 1000
    });

    const verifyLink = `${req.protocol}://${req.get("host")}/users/verify/${token}`;

    await sgMail.send({
      to: email,
      from: "dosesingkoquezon@gmail.com",
      subject: "A Sip of Security – Verify Your Account",
      html: `
        <p>Hello ${username},</p>
        <p>We’re excited to have you at Dose Singko! ☕✨ Before you can start enjoying the full experience, we need a quick check to keep your account safe.</p>
        <p>Here’s everything you need:</p>
        <ul>
          <li><b>Username:</b> ${username}</li>
          <li><b>Temporary Password:</b> ${tempPassword}</li>
          <li><b>One-Time Password (OTP):</b> ${otp}</li>
        </ul>
        <p>Click the link below to verify your account and get brewing:</p>
          <p><a href="${verifyLink}" target="_blank" rel="noopener noreferrer">${verifyLink}</a></p>
          <p>Think of this as a warm cup of coffee—quick, refreshing, and exactly what you need to start your day! 🍰</p>
        <p>If you didn’t request this, no worries—just ignore this email and your account stays secure.</p>
        <p>Warmly,<br/>Dose Singko Team</p>
      `
    });

    return res.redirect("/user-admin?success=User created and email sent!");
  } catch (err) {
    console.error("CreateUser error:", err);
    return res.redirect("/user-admin?error=Failed to create user");
  }
};
export const verifyUser = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.redirect("/users/login?error=Invalid or expired verification link");
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();


    res.redirect("/users/login?success=Your account has been verified! Please log in.");
  } catch (err) {
    console.error(err);
    res.redirect("/users/login?error=Server error during verification");
  }
};

export const viewUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).send("User not found");
    res.render("analytics/viewUser", { user });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

export const editUserForm = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).send("User not found");
    res.render("analytics/editUser", { user });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

export const updateUser = async (req, res) => {
  try {
    const { username, email, role } = req.body;
    await User.findByIdAndUpdate(req.params.id, { username, email, role });
    res.redirect("/user-admin?success=User updated successfully!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

export const deleteUser = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.redirect("/user-admin?success=User deleted successfully!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};