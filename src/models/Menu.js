import mongoose from "mongoose";

const menuSchema = new mongoose.Schema({
  itemName: { type: String, required: true },
  itemCategory: { type: String, required: true },
  itemDescription: { type: String },
  price: { type: Number, required: true },
  archived: { type: Boolean, default: false }
});

export default mongoose.model("Menu", menuSchema);
