import User from "../models/User.js";

export const ensureAuth = async (req, res, next) => {
  if (!req.session.userId) {
    if (req.xhr || req.headers.accept.includes("json")) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    } else {
      return res.redirect("/users/login");
    }
  }

  try {
    const user = await User.findById(req.session.userId).select("_id username role");
    if (!user) {
      if (req.xhr || req.headers.accept.includes("json")) {
        return res.status(401).json({ success: false, message: "Not authenticated" });
      } else {
        return res.redirect("/users/login");
      }
    }

    req.user = user;
    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


export const ensureRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).send("You do not have permission to access this area");
    }

    const userRole = req.user.role.toLowerCase();
    const allowedRoles = roles.map(r => r.toLowerCase());

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).send("You do not have permission to access this area");
    }

    next();
  };
};

