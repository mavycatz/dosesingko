import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
  menuID: [{ type: mongoose.Schema.Types.ObjectId, ref: "Menu" }],
  ratingID: { type: mongoose.Schema.Types.ObjectId, ref: "Rating" },
  orNumber: { type: String, required: true },
  customerName: { type: String, default: "Anonymous" },
  customerEmail: { type: String, default: "" },
  message: { type: String },
  approved: { type: Boolean, default: false },
  replies: [
    {
      user: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        username: String
      },
      message: String,
      createdAt: { type: Date, default: Date.now }
    }
  ],
  customerType: { type: String, enum: ["Dine-in", "Take-out", "Delivery"], default: "Dine-in" },
  timestamp: { type: String },
  createdAt: { type: Date, default: Date.now },
  archived: { type: Boolean, default: false }
});

const Feedback = mongoose.model("Feedback", feedbackSchema);
export default Feedback;
