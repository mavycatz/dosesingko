import bcrypt from "bcrypt";
import User from "../models/User.js";

export const showLogin = (req, res) => {
  let captchaQuestion = null;

  if (["localhost", "127.0.0.1", "::1"].includes(req.hostname)) {
    const a = Math.floor(Math.random() * 10);
    const b = Math.floor(Math.random() * 10);
    req.session.captchaAnswer = a + b;
    captchaQuestion = `${a} + ${b} = ?`;
  }

  res.render("users/login", { 
    error: null, 
    captchaQuestion, 
    otpRequired: false, 
    activeItem: "Login"
  });
};


export const loginUser = async (req, res) => {
  try {
    const { username, password, remember, captchaAnswer, otp } = req.body;
    let captchaQuestion = null;


    const user = await User.findOne({
      $or: [{ email: username }, { username: username }],
    }).select("+password +otp +otpExpires +isVerified");

    if (!user) {
      return res.render("users/login", { 
        error: "Invalid credentials", 
        captchaQuestion, 
        otpRequired: false,
        username 
      });
    }

    let otpRequired = false;


    if (!user.isVerified) {
      otpRequired = true;

      if (!otp || otp !== user.otp || user.otpExpires < Date.now()) {
        return res.render("users/login", {
          error: "Please enter the correct OTP sent to your email to verify your account.",
          captchaQuestion: null, 
          otpRequired,
          username
        });
      }


      user.isVerified = true;
      user.otp = undefined;
      user.otpExpires = undefined;
      await user.save();
    } else {
      if (["localhost", "127.0.0.1", "::1"].includes(req.hostname)) {
        captchaQuestion = req.session.captchaAnswer ? `${req.session.captchaAnswer} ?` : null;

        if (!req.session.captchaAnswer || Number(captchaAnswer) !== req.session.captchaAnswer) {
          const a = Math.floor(Math.random() * 10);
          const b = Math.floor(Math.random() * 10);
          req.session.captchaAnswer = a + b;
          captchaQuestion = `${a} + ${b} = ?`;

          return res.render("users/login", {
            error: "Invalid CAPTCHA, please try again.",
            captchaQuestion,
            otpRequired: false,
            username
          });
        }
        req.session.captchaAnswer = null;
      }


      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        user.loginAttempts += 1;
        if (user.loginAttempts >= 5) user.lockUntil = Date.now() + 30 * 60 * 1000;
        await user.save();
        return res.render("users/login", { 
          error: "Invalid credentials", 
          captchaQuestion, 
          otpRequired: false,
          username
        });
      }


      if (user.otp && user.otpExpires > Date.now()) {
        otpRequired = true;
        if (!otp || otp !== user.otp) {
          return res.render("users/login", {
            error: "Please enter the correct OTP sent to your email.",
            captchaQuestion: null, 
            otpRequired,
            username
          });
        }
        user.otp = undefined;
        user.otpExpires = undefined;
      }
    }


    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    await user.save();

    req.session.userId = user._id;
    req.session.userRole = user.role;

    if (remember) req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000;
    else req.session.cookie.expires = false;

    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    res.render("users/login", { 
      error: "Server error. Try again later.", 
      captchaQuestion: null, 
      otpRequired: false 
    });
  }
};


export const showUserAdminPage = async (req, res) => {
  try {
    const users = await User.find().lean();
    res.render("analytics/userAdmin", { users });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

export const logoutUser = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error(err);
      return res.status(500).send("Could not log out. Try again.");
    }
    res.redirect("/users/login");
  });
};