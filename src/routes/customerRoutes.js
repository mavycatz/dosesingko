import express from "express";
import {
  showOrNumberPage,
  submitOrNumber,
  getFeedbackPage,
  createFeedback
} from "../controllers/customerController.js";

import { requireORNumber } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/or-number", showOrNumberPage);
router.post("/or-number", submitOrNumber);

router.get("/feedback", requireORNumber, getFeedbackPage);
router.post("/feedback", requireORNumber, createFeedback);

export default router;
