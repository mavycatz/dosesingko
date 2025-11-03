import express from "express";
import { getFeedbackPage, createFeedback, getDashboardStats } 
  from "../controllers/feedbackController.js";

const router = express.Router();

router.get("/", getFeedbackPage);
router.post("/", createFeedback);
router.get("/dashboard", getDashboardStats);


export default router;
