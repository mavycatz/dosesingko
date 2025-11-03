import Customer from "../models/Customer.js";
import Feedback from "../models/FeedbackModel.js";
import Rating from "../models/Rating.js";
import Menu from "../models/Menu.js";


export const getFeedbackPage = async (req, res) => {
  
  const orNumber = req.session.orNumber || "";
  if (!orNumber) {
    return res.redirect("/customers/or-number");
  }

  try {
    const menus = await Menu.find();
    const feedbacks = await Feedback.find()
      .populate("ratingID")
      .sort({ createdAt: -1 })
      .limit(5);

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
    console.error(err);
    res.status(500).send("Server Error");
  }
};
export const createFeedback = async (req, res) => {
  try {
    const customerId = req.session.customerId;
    const orNumber = req.session.orNumber;

    if (!customerId || !orNumber) {
      return res.redirect("/customers/or-number");
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      req.session.customerId = null;
      req.session.orNumber = null;
      return res.redirect("/customers/or-number");
    }

    const {
      customerName,
      customerEmail,
      message,
      category,
      menuID,
      overallExperience,
      overallExperienceReason,
      foodQuality,
      foodQualityReason,
      ambiance,
      ambianceReason,
      service,
      serviceReason,
      valueForMoney,
      valueForMoneyReason,
      staffAttitude,
      staffAttitudeReason,
      bartenderAttitude,
      bartenderAttitudeReason,
      recommendToOthers,
      recommendToOthersReason
    } = req.body;

    const safeNumber = (val) => {
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    };


    const rating = await Rating.create({
      overallExperience: safeNumber(overallExperience),
      overallExperienceReason,
      foodQuality: safeNumber(foodQuality),
      foodQualityReason,
      ambiance: safeNumber(ambiance),
      ambianceReason,
      service: safeNumber(service),
      serviceReason,
      valueForMoney: safeNumber(valueForMoney),
      valueForMoneyReason,
      staffAttitude: safeNumber(staffAttitude),
      staffAttitudeReason,
      bartenderAttitude: safeNumber(bartenderAttitude),
      bartenderAttitudeReason,
      recommendToOthers,
      recommendToOthersReason
    });


    await Feedback.create({
      customer: customer._id,    
      orNumber: customer.orNumber, 
      customerName: customerName || "Anonymous",
      customerEmail: customerEmail || "",
      message,
      category,
      menuID: Array.isArray(menuID) ? menuID : [menuID],
      ratingID: rating._id
    });

    res.redirect("/customers/feedback?success=true");

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const allRatings = await Rating.find();
    const totalReviews = allRatings.length;
    const overallSum = allRatings.reduce((sum, r) => sum + (r.overallExperience || 0), 0);
    const averageRating = totalReviews ? (overallSum / totalReviews).toFixed(1) : 0;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const feedbackThisMonth = await Rating.countDocuments({ createdAt: { $gte: startOfMonth } });

    res.render("dashboard", {
      totalReviews,
      averageRating,
      feedbackThisMonth
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

