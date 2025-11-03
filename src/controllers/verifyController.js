import User from "../models/User.js";

export const verifyUser = async (req, res) => {
  const { email, otp } = req.body;
  try {
    const user = await User.findOne({ email });

    if (!user) return res.status(404).send("User not found");
    if (user.verified) return res.send("User already verified");
    if (user.otp !== otp) return res.status(400).send("Invalid OTP");
    if (user.otpExpiresAt < new Date()) return res.status(400).send("OTP expired");

    user.verified = true;
    user.otp = null;
    user.otpExpiresAt = null;
    await user.save();

    res.send("Account verified successfully!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};
