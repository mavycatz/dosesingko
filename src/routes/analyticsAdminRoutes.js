import express from "express";
import {
  getStatsCards,
  getCategories,
  getCustomerTypes,
  getFilteredFeedback,
  getWeeklyFeedbackTrends,
  getSentimentTrends,
  getWeeklyFeedbackVolumeAndRating,
  getMonthlyComparison,
  getWeeklyRatingTrends,
  getFeedbackVolumeByDay,
  getTopCustomerIssues,
  getSatisfactionHeatmap,
  getPerformanceAndRatingReport,
  getCorrelationReport,
  getStatisticsSummary,
  getMostCommonNegativeIssues,
  getIssueProgress,
  getSegmentAnalysis,
  getPerformanceMetrics,
  getSatisfactionHeatmapData
} from "../controllers/analyticsAdminController.js";

import { ensureAuth, ensureRoles } from "../middlewares/auth.js";

const router = express.Router();


router.use(ensureAuth);                
router.use(ensureRoles("admin", "manager")); 

router.get("/", getSatisfactionHeatmap);
router.get("/stats", getStatsCards);
router.get("/categories", getCategories);
router.get("/customer-types", getCustomerTypes);
router.get("/filtered-feedback", getFilteredFeedback);
router.get("/weekly-trends", getWeeklyFeedbackTrends);
router.get("/trends/sentiment", getSentimentTrends);
router.get("/weekly-feedback-volume-rating", getWeeklyFeedbackVolumeAndRating);
router.get("/reports/monthly-comparison", getMonthlyComparison);
router.get("/reports/weekly-rating-trends", getWeeklyRatingTrends);
router.get("/reports/volume-by-day", getFeedbackVolumeByDay);
router.get("/reports/top-issues", getTopCustomerIssues);
router.get("/reports/heatmap", getSatisfactionHeatmap);
router.get("/reports/performance-rating", getPerformanceAndRatingReport);
router.get("/reports/correlation", getCorrelationReport);
router.get("/statistics/summary", getStatisticsSummary);
router.get("/reports/negative-issues", getMostCommonNegativeIssues);
router.get("/reports/issue-progress", getIssueProgress);
router.get("/segments", getSegmentAnalysis);
router.get("/performance", getPerformanceMetrics);
router.get("/reports/heatmap", getSatisfactionHeatmap);
router.get("/reports/heatmap-data", getSatisfactionHeatmapData);


export default router;
