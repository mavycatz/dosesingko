import mongoose from "mongoose";

const CustomerSchema = new mongoose.Schema({
  orNumber: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});

const Customer = mongoose.model("Customer", CustomerSchema);
export default Customer;
