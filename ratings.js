import mongoose from "mongoose";
import Rating from "./src/models/Rating.js";
import Feedback from "./src/models/FeedbackModel.js";

const uri = "mongodb://localhost:27017/dosesingko_feedback";

const feedbackRatingsData = [
  { "overallExperience": 5, "overallExperienceReason": "Great overall service and atmosphere", "foodQuality": 5, "foodQualityReason": "Food was fresh and well-prepared", "ambiance": 4, "ambianceReason": "Cozy and clean environment", "service": 5, "serviceReason": "Staff was attentive", "valueForMoney": 4, "valueForMoneyReason": "Reasonable pricing", "staffAttitude": 5, "staffAttitudeReason": "Friendly and helpful", "bartenderAttitude": 4, "bartenderAttitudeReason": "Quick service at the bar", "recommendToOthers": "yes", "recommendToOthersReason": "Would definitely come back" },
  // ...add all other rating objects here
];

async function repopulateRatings() {
  await mongoose.connect(uri);

  const feedbacks = await Feedback.find({ ratingID: { $exists: false } }).sort({ createdAt: 1 });

  for (let i = 0; i < feedbacks.length; i++) {
    const ratingData = feedbackRatingsData[i % feedbackRatingsData.length]; // cycle if fewer rating objects
    const rating = await Rating.create(ratingData);
    feedbacks[i].ratingID = rating._id;
    await feedbacks[i].save();
  }

  console.log("Repopulated missing ratings successfully!");

  await mongoose.disconnect();
}

repopulateRatings();
