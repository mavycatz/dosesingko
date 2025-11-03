import mongoose from "mongoose";

const ratingSchema = new mongoose.Schema({
  overallExperience: Number,
  overallExperienceReason: String,
  foodQuality: Number,
  foodQualityReason: String,
  ambiance: Number,
  ambianceReason: String,
  service: Number,
  serviceReason: String,
  valueForMoney: Number,
  valueForMoneyReason: String,
  staffAttitude: Number,
  staffAttitudeReason: String,
  bartenderAttitude: Number,
  bartenderAttitudeReason: String,
  recommendToOthers: { type: String, enum: ["yes", "maybe", "no"], default: undefined },
  recommendToOthersReason: String
  }, { timestamps: true});

const Rating = mongoose.model("Rating", ratingSchema);
export default Rating;
