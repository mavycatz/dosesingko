import Customer from "../models/Customer.js";
import Feedback from "../models/FeedbackModel.js";
import Rating from "../models/Rating.js";
import Menu from "../models/Menu.js";
import { generateFeedbackReply } from "../services/aiReply.js";

export const getAllFeedbacks = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const { search, month, day, year, status, rating } = req.query;
    const now = new Date();

    let filter = {};

    if (search?.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { customerName: regex },
        { customerEmail: regex },
        { message: regex }
      ];
    }

    if (year || month || day) {
      const y = year ? parseInt(year) : 1970;
      const m = month ? parseInt(month) - 1 : 0;
      const d = day ? parseInt(day) : 1;

      let startDate, endDate;
      if (year && month && day) {
        startDate = new Date(y, m, d, 0, 0, 0);
        endDate = new Date(y, m, d, 23, 59, 59);
      } else if (year && month) {
        startDate = new Date(y, m, 1, 0, 0, 0);
        endDate = new Date(y, m + 1, 0, 23, 59, 59);
      } else if (year && !month && !day) {
        startDate = new Date(y, 0, 1, 0, 0, 0);
        endDate = new Date(y, 11, 31, 23, 59, 59);
      } else if (month && !year) {
        const currentYear = now.getFullYear();
        startDate = new Date(currentYear, m, 1, 0, 0, 0);
        endDate = new Date(currentYear, m + 1, 0, 23, 59, 59);
      } else if (day && !month && !year) {
        startDate = new Date(now.getFullYear(), now.getMonth(), d, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), d, 23, 59, 59);
      }
      filter.createdAt = { $gte: startDate, $lte: endDate };
    }

    let feedbacks = await Feedback.find(filter)
      .populate("menuID")
      .populate("ratingID")
      .sort({ createdAt: -1 });

    if (rating) {
      const targetRating = parseInt(rating);
      feedbacks = feedbacks.filter(fb => fb.ratingID?.overallExperience === targetRating);
    }

    if (status === "pending") feedbacks = feedbacks.filter(fb => !fb.replies?.length);
    else if (status === "urgent") feedbacks = feedbacks.filter(fb =>
      fb.ratingID?.overallExperience <= 3 && (!fb.approved || !fb.replies?.length)
    );
    else if (status === "responded") feedbacks = feedbacks.filter(fb => fb.replies?.length > 0);
    else if (status === "new") {
      const recentCutoff = new Date();
      recentCutoff.setHours(recentCutoff.getHours() - 24);
      feedbacks = feedbacks.filter(fb => fb.createdAt >= recentCutoff);
    }

    const totalFeedbacks = feedbacks.length;
    const paginatedFeedbacks = feedbacks.slice(skip, skip + limit);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const allFeedbacks = await Feedback.find().populate("ratingID");
    const statusCounts = {
      all: allFeedbacks.length,
      new: allFeedbacks.filter(fb => fb.createdAt >= todayStart).length,
      pending: allFeedbacks.filter(fb => !fb.replies?.length).length,
      urgent: allFeedbacks.filter(fb =>
        fb.ratingID?.overallExperience <= 3 && (!fb.approved || !fb.replies?.length)
      ).length,
      responded: allFeedbacks.filter(fb => fb.replies?.length > 0).length
    };

    const menus = await Menu.find().sort({ itemCategory: 1, itemName: 1 });

    res.render("analytics/feedbackadmin", {
      user: req.user,
      feedbacks: paginatedFeedbacks,
      statusCounts,
      query: req.query,
      currentPage: page,
      totalPages: Math.ceil(totalFeedbacks / limit),
      activeItem: "Feedback",
      menus
    });
  } catch (err) {
    console.error("Error fetching feedbacks:", err);
    res.status(500).send("Server Error");
  }
};


export const addMenu = async (req, res) => {
  try {
    const { itemName, itemCategory, itemDescription, price } = req.body;
    const newMenu = new Menu({ itemName, itemCategory, itemDescription, price });
    await newMenu.save();
    res.status(200).json(newMenu);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add menu" });
  }
};


export const deleteMenu = async (req, res) => {
  try {
    const { id } = req.params;
    await Menu.findByIdAndDelete(id);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete menu" });
  }
};


export const editMenu = async (req, res) => {
  try {
    const { id } = req.params;
    const { itemName, itemCategory, itemDescription, price } = req.body;

    const updatedMenu = await Menu.findByIdAndUpdate(
      id,
      { itemName, itemCategory, itemDescription, price },
      { new: true }
    );

    if (!updatedMenu) return res.status(404).json({ error: "Menu not found" });
    res.status(200).json(updatedMenu);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update menu" });
  }
};

export const getEditFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id)
      .populate("ratingID")
      .populate("menuID");
    const menus = await Menu.find();

    res.render("editFeedback", { feedback, menus });
  } catch (err) {
    res.status(500).send("Error loading feedback edit form");
  }
};


export const postEditFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id).populate("ratingID");

    if (!feedback) return res.status(404).send("Feedback not found");

    const rating = await Rating.findById(feedback.ratingID);


    rating.overallExperience = req.body.overallExperience;
    rating.overallExperienceReason = req.body.overallExperienceReason;
    rating.foodQuality = req.body.foodQuality;
    rating.foodQualityReason = req.body.foodQualityReason;
    rating.ambiance = req.body.ambiance;
    rating.ambianceReason = req.body.ambianceReason;
    rating.service = req.body.service;
    rating.serviceReason = req.body.serviceReason;
    rating.valueForMoney = req.body.valueForMoney;
    rating.valueForMoneyReason = req.body.valueForMoneyReason;
    rating.staffAttitude = req.body.staffAttitude;
    rating.staffAttitudeReason = req.body.staffAttitudeReason;
    rating.bartenderAttitude = req.body.bartenderAttitude;
    rating.bartenderAttitudeReason = req.body.bartenderAttitudeReason;
    rating.recommendToOthers = req.body.recommendToOthers;
    rating.recommendToOthersReason = req.body.recommendToOthersReason;
    await rating.save();


    feedback.message = req.body.message;
    feedback.customerName = req.body.customerName;
    feedback.customerEmail = req.body.customerEmail;
    feedback.customerType = req.body.customerType;
    feedback.menuID = req.body["menuID[]"];
    await feedback.save();

    res.redirect("/feedbackadmin");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating feedback");
  }
};

export const getArchivedMenus = async (req, res) => {
  try {
    const archivedMenus = await Menu.find({ archived: true });
    res.status(200).json(archivedMenus);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch archived menus" });
  }
};
export const archiveMenu = async (req, res) => {
  try {
    const { id } = req.params;
    await Menu.findByIdAndUpdate(id, { archived: true });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to archive menu" });
  }
};


export const unarchiveMenu = async (req, res) => {
  try {
    const { id } = req.params;
    await Menu.findByIdAndUpdate(id, { archived: false });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to unarchive menu" });
  }
};

export const approveFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) return res.status(404).json({ success: false, message: "Feedback not found." });

    feedback.approved = !feedback.approved;
    await feedback.save();

    res.json({
      success: true,
      approved: feedback.approved,
      message: feedback.approved ? "Feedback approved!" : "Feedback unapproved!"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "You do not have permission to access this area." });
  }
};
export const deleteFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) return res.status(404).json({ success: false, message: "Feedback not found." });

    await Feedback.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Feedback deleted successfully!" });
  } catch (err) {
    console.error(err);
    res.status(403).json({ success: false, message: "You do not have permission to access this area." });
  }
};
export const replyFeedback = async (req, res) => {
  try {
    const feedbackId = req.params.id;
    let replyMessage = req.body.replyMessage;

    const feedback = await Feedback.findById(feedbackId);
    if (!feedback) {
      return res.status(404).json({ success: false, message: "Feedback not found." });
    }

    if (!replyMessage || !replyMessage.trim()) {
      replyMessage = await generateFeedbackReply(feedback.message);
    }

    feedback.replies = feedback.replies || [];

    const reply = {
      user: { _id: req.user._id, username: req.user.username },
      message: replyMessage.trim(),
      createdAt: new Date(),
    };

    feedback.replies.push(reply);
    await feedback.save();

    res.json({ success: true, message: "Reply added successfully!", reply });
  } catch (err) {
    console.error("Reply Feedback Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getAiReply = async (req, res) => {
  try {
    const feedbackId = req.params.id;
    const feedback = await Feedback.findById(feedbackId);
    if (!feedback) return res.status(404).json({ success: false, message: "Feedback not found." });

    const suggestedReply = await generateFeedbackReply(feedback.message);

    feedback.replies.push({ message: suggestedReply, user: { username: "Admin" } });
    await feedback.save();

    res.json({ success: true, suggestedReply });
  } catch (err) {
    console.error("AI Reply Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteReply = async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.feedbackId);
    if (!feedback) return res.status(404).json({ success: false, message: "Feedback not found." });

    feedback.replies = feedback.replies.filter(r => r._id.toString() !== req.params.replyId);
    await feedback.save();

    res.json({ success: true, message: "Reply deleted successfully!" });
  } catch (err) {
    console.error(err);
    res.status(403).json({ success: false, message: "You do not have permission to access this area." });
  }
};

export const editReply = async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.feedbackId);
    if (!feedback) return res.status(404).json({ success: false, message: "Feedback not found." });

    const reply = feedback.replies.id(req.params.replyId);
    if (!reply) return res.status(404).json({ success: false, message: "Reply not found." });

    reply.message = req.body.replyMessage.trim() || "N/A";
    reply.createdAt = new Date();
    await feedback.save();

    res.json({ success: true, message: "Reply updated successfully!" });
  } catch (err) {
    console.error(err);
    res.status(403).json({ success: false, message: "You do not have permission to access this area." });
  }
};
export const deleteMultipleFeedbacks = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.ids];
    if (!ids || ids.length === 0) {
      return res.status(400).json({ success: false, message: "No feedbacks selected" });
    }

    await Feedback.deleteMany({ _id: { $in: ids } });

    res.json({ success: true, message: "Feedback(s) deleted successfully" });
  } catch (err) {
    console.error("Error deleting feedbacks:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


