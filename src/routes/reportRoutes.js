import express from 'express';
import * as reportController from '../controllers/reportController.js';
import { getRatingsData } from '../controllers/reportController.js'; 
import { ensureAuth, ensureRoles } from '../middlewares/auth.js';

const router = express.Router();

router.get('/dashboard', ensureAuth, reportController.renderDashboardPage);
router.post('/api/add-or', ensureAuth, reportController.addORNumber);
router.post('/generateReport', ensureAuth, ensureRoles("admin", "manager"), reportController.generateReport);
router.get("/analytics/ratings-data", ensureAuth, getRatingsData); 
router.get('/api/feedback', ensureAuth, reportController.getFilteredFeedback);
router.get('/analytics/getFilteredFeedback', ensureAuth, reportController.getFilteredFeedback);
router.get('/analytics/recent-feedback', ensureAuth, reportController.getRecentFeedback);

export default router;
