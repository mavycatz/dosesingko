import express from "express";
import * as publicController from "../controllers/publicFeedbackController.js";

const router = express.Router();


router.get("/publicfeedback", publicController.getAllApprovedFeedbacksWithStats);


export default router;
