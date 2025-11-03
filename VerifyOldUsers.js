import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./src/models/User.js";

dotenv.config();

const DB_URI = process.env.MONGO_URI || "mongodb://localhost:27017/dosesingko_feedback";

const markOldUsersVerified = async () => {
  try {
    await mongoose.connect(DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const result = await User.updateMany(
      { isVerified: { $exists: false } }, // find users without isVerified field
      { $set: { isVerified: true } }      // mark them verified
    );

    console.log(`${result.modifiedCount} old users marked as verified.`);

    mongoose.disconnect();
  } catch (err) {
    console.error("Error updating old users:", err);
    mongoose.disconnect();
  }
};

markOldUsersVerified();
