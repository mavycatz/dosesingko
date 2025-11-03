import express from "express";
import { showRatingDashboard} from "../controllers/RatingAdminController.js";
import { ensureAuth, ensureRoles } from "../middlewares/auth.js";

const router = express.Router();

router.get("/ratingAdmin", ensureAuth, showRatingDashboard);

export default router;
