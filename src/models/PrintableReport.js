import mongoose from "mongoose";

const PrintableReportSchema = new mongoose.Schema({
  month: {
    type: String,
    default: "All",
  },
  totalFeedback: {
    type: Number,
    required: true,
  },
  avgRating: {
    type: String,
    required: true,
  },
  uniqueCustomers: {
    type: Number,
    required: true,
  },
  data: [
    {
      orNumber: String,
      customerName: String,
      category: String,
      menuItems: [String],
      message: String,
      rating: Number,
      createdAt: Date,
    },
  ],
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  generatedAt: {
    type: Date,
    default: Date.now,
  },
});

const PrintableReport = mongoose.model("PrintableReport", PrintableReportSchema);

export default PrintableReport;
