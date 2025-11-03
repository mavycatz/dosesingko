import mongoose from "mongoose";

const CustomReportSchema = new mongoose.Schema({
  title: { type: String, required: true },
  status: { type: String, enum: ["Ready", "Generating"], default: "Generating" },
  description: { type: String },
  dateRange: { type: String },
  keyFinding: { type: String },
  trendData: { type: Object },
  feedbacks: { type: Array, default: [] } // <-- add this
});

export default mongoose.model("CustomReport", CustomReportSchema);
