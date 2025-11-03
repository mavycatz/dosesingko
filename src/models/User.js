import mongoose from "mongoose";
import bcrypt from "bcrypt";

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ["admin", "manager", "cashier"], default: "cashier" },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  isTwoFactorEnabled: { type: Boolean, default: false },

  otp: { type: String },
  otpExpires: { type: Date },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String }
});


UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

UserSchema.methods.isLocked = function() {
  return this.lockUntil && this.lockUntil > Date.now();
};

export default mongoose.model("User", UserSchema);
