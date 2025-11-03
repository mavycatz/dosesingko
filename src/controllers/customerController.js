import Customer from "../models/Customer.js";
import Feedback from "../models/FeedbackModel.js";
import Rating from "../models/Rating.js";
import Menu from "../models/Menu.js";


export const showOrNumberPage = (req, res) => {
  res.render("customers/orNumberForm", { error: null });
};

export const submitOrNumber = async (req, res) => {
  try {
    const { orNumber } = req.body;

    if (!orNumber?.trim()) {
      return res.render("customers/orNumberForm", { error: "Please enter a valid OR number." });
    }

    const customer = await Customer.findOne({ orNumber: orNumber.trim() });
    if (!customer) {
      return res.render("customers/orNumberForm", { error: "OR number not found. Please check with cashier." });
    }

    const existingFeedback = await Feedback.findOne({ orNumber: orNumber.trim() });
    if (existingFeedback) {
      return res.render("customers/orNumberForm", { 
        error: "Feedback already submitted for this OR number." 
      });
    }

    req.session.customerId = customer._id.toString();
    req.session.orNumber = customer.orNumber;

    res.redirect("/customers/feedback");
  } catch (err) {
    console.error("submitOrNumber error:", err);
    res.render("customers/orNumberForm", { error: "Server error. Try again later." });
  }
};


export const getFeedbackPage = async (req, res) => {
  try {
    const { customerId, orNumber } = req.session;
    if (!customerId || !orNumber) return res.redirect("/customers/or-number");

    const customer = await Customer.findById(customerId);
    if (!customer) {
      req.session.customerId = null;
      req.session.orNumber = null;
      return res.redirect("/customers/or-number");
    }

    const menus = await Menu.find();
    const feedbacks = await Feedback.find({ orNumber })
      .populate("ratingID")
      .sort({ createdAt: -1 });

    const allRatings = await Rating.find();
    const totalReviews = allRatings.length;
    const overallSum = allRatings.reduce((sum, r) => sum + (r.overallExperience || 0), 0);
    const averageRating = totalReviews ? (overallSum / totalReviews).toFixed(1) : 0;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const feedbackThisMonth = await Rating.countDocuments({ createdAt: { $gte: startOfMonth } });

    res.render("customers/feedbackpage", {
      orNumber,
      menus,
      feedbacks,
      totalReviews,
      averageRating,
      feedbackThisMonth,
      success: req.query.success ? "Feedback submitted successfully!" : null
    });
  } catch (err) {
    console.error("getFeedbackPage error:", err);
    res.status(500).send("Server Error");
  }
};


export const createFeedback = async (req, res) => {
  try {
    const { customerId, orNumber } = req.session;
    if (!customerId || !orNumber) return res.redirect("/customers/or-number");

    const customer = await Customer.findById(customerId);
    if (!customer) {
      req.session.customerId = null;
      req.session.orNumber = null;
      return res.redirect("/customers/or-number");
    }

    const safeNumber = (val) => isNaN(Number(val)) ? 0 : Number(val);


    const rating = await Rating.create({
      overallExperience: safeNumber(req.body.overallExperience),
      overallExperienceReason: req.body.overallExperienceReason,
      foodQuality: safeNumber(req.body.foodQuality),
      foodQualityReason: req.body.foodQualityReason,
      ambiance: safeNumber(req.body.ambiance),
      ambianceReason: req.body.ambianceReason,
      service: safeNumber(req.body.service),
      serviceReason: req.body.serviceReason,
      valueForMoney: safeNumber(req.body.valueForMoney),
      valueForMoneyReason: req.body.valueForMoneyReason,
      staffAttitude: safeNumber(req.body.staffAttitude),
      staffAttitudeReason: req.body.staffAttitudeReason,
      bartenderAttitude: safeNumber(req.body.bartenderAttitude),
      bartenderAttitudeReason: req.body.bartenderAttitudeReason,
      recommendToOthers: req.body.recommendToOthers === "true",
      recommendToOthersReason: req.body.recommendToOthersReason
    });


    await Feedback.create({
      customer: customer._id,  
      orNumber: customer.orNumber,  
      customerName: req.body.customerName || "Anonymous",
      customerEmail: req.body.customerEmail || "",
      message: req.body.message,
      category: req.body.category,
      menuID: Array.isArray(req.body.menuID) ? req.body.menuID : [req.body.menuID],
      ratingID: rating._id,
      customerType: req.body.customerType || "Dine-in"
    });

    res.redirect("/customers/feedback?success=true");

  } catch (err) {
    console.error("createFeedback error:", err);
    res.status(500).send("Server Error");
  }
};
