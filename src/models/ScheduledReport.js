import mongoose from "mongoose";

const ScheduledReportSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  nextRun: { type: Date, required: true },
  status: { type: String, enum: ["Active", "Paused"], default: "Active" },
});

const ScheduledReport = mongoose.model("ScheduledReport", ScheduledReportSchema);
export default ScheduledReport;