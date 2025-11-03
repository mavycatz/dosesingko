import express from "express";
import mongoose from "mongoose";
import session from "express-session";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import sgMail from "@sendgrid/mail";

// Import routes
import feedbackRoutes from "./src/routes/feedbackRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import customerRoutes from "./src/routes/customerRoutes.js";
import reportRoutes from './src/routes/reportRoutes.js';
import feedbackAdminRoutes from "./src/routes/feedbackAdminRoutes.js";
import customerAdminRoutes from "./src/routes/CustomerAdminRoutes.js";
import reportsAdminRoutes from './src/routes/ReportAdminRoutes.js';
import ratingAdminRoutes from "./src/routes/ratingAdminRoutes.js";
import adminUserRoutes from "./src/routes/adminUserRoutes.js";
import analyticsAdminRoutes from './src/routes/analyticsAdminRoutes.js';
import publicFeedbackRoutes from "./src/routes/publicFeedbackRoutes.js";

// Fetch Google responses
import './fetchGoogleResponses.js';

// -------------------
// CONFIG
// -------------------
dotenv.config(); // Must be called before accessing process.env

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY is missing in .env");
}
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// -------------------
// APP INIT
// -------------------
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------
// VIEWS SETUP
// -------------------
const viewsPath = path.join(__dirname, "src/views");
console.log("Views path:", viewsPath);
console.log("Files in views folder:", fs.readdirSync(viewsPath));
app.set("view engine", "ejs");
app.set("views", viewsPath);

// -------------------
// MIDDLEWARE
// -------------------
app.use('/bootstrap', express.static(path.join(__dirname, 'node_modules/bootstrap/dist')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || "secret",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 30 * 60 * 1000 }
}));

// ✅ GLOBAL EJS VARIABLES (User Role + Active Item)
app.use((req, res, next) => {
  res.locals.userRole = req.session.userRole || null;
  res.locals.activeItem = null;
  next();
});

// -------------------
// ROUTES
// -------------------

app.use((req, res, next) => {
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  next();
});

app.use("/feedback", feedbackRoutes);
app.use("/customers", customerRoutes);
app.use("/users", userRoutes);
app.use("/", reportRoutes);
app.use("/", feedbackAdminRoutes);
app.use("/customer-admin", customerAdminRoutes);
app.use("/", ratingAdminRoutes);
app.use("/reportsadmin", reportsAdminRoutes);
app.use("/analytics", analyticsAdminRoutes);
app.use("/", adminUserRoutes);
app.use("/", publicFeedbackRoutes);

// Login page
app.get("/users/login", (req, res) => {
  res.render("users/login", { error: null, captchaQuestion: null });
});

// Home page
app.get("/", (req, res) => res.render("home"));

// -------------------
// MONGODB
// -------------------
const PORT = process.env.PORT || 7000;
const MONGOURL = process.env.MONGO_URL;
console.log(process.env.HF_API_KEY);
if (!MONGOURL) throw new Error("MONGO_URL is missing. Check your .env file.");

mongoose.connect(MONGOURL)
  .then(() => {
    console.log("Database connected");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.error(err));

  console.log("SendGrid Key starts with:", process.env.SENDGRID_API_KEY?.slice(0,3));
