import Feedback from "../models/FeedbackModel.js";
import Customer from "../models/Customer.js";
import Rating from "../models/Rating.js";

export const getAllApprovedFeedbacksWithStats = async (req, res) => {
  try {

    const feedbacks = await Feedback.find({ approved: true })
      .populate("ratingID", "overallExperience foodQuality ambiance service valueForMoney staffAttitude bartenderAttitude")
      .populate("menuID")
      .sort({ createdAt: -1 });


    const cupsServed = await Customer.countDocuments();
    const fiveStarReviews = await Rating.countDocuments({ overallExperience: 5 });
    const happyCustomers = await Feedback.countDocuments();

    const feedbacksWithReplies = await Feedback.find({ "replies.0": { $exists: true } });
    let totalResponseHours = 0;
    feedbacksWithReplies.forEach(fb => {
      const firstReply = fb.replies[0];
      const hours = (firstReply.createdAt - fb.createdAt) / 1000 / 3600;
      totalResponseHours += hours;
    });
    const avgResponse = feedbacksWithReplies.length > 0
      ? (totalResponseHours / feedbacksWithReplies.length).toFixed(1)
      : 0;


    res.render("customers/publicFeedback", {
      feedbacks,
      cupsServed,
      fiveStarReviews,
      happyCustomers,
      avgResponse
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to load feedbacks and stats");
  }
};
