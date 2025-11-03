import mongoose from "mongoose";

const reportSchema = new mongoose.Schema({
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true, maxlength: 150 },
  summary: { type: String },
  filePath: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const Report = mongoose.model("Report", reportSchema);
export default Report;
