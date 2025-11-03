import mongoose from "mongoose";

const ratingFieldSchema = new mongoose.Schema({
  label: { type: String, required: true },
  description: { type: String },
  active: { type: Boolean, default: true }
});

export default mongoose.model("RatingField", ratingFieldSchema);
