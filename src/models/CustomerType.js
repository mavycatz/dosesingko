import mongoose from "mongoose";

const customerTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }
});

export default mongoose.model("CustomerType", customerTypeSchema);
