import express from "express";
import multer from "multer";
import { 
  showReportsAdmin, 
  generateReport, 
  generatePrintableReport, 
  downloadCustomReport,
  createSixMonthTrendReport,       
  createServiceIssueReport,
  deleteCustomReport            
} from "../controllers/ReportAdminController.js";
import { ensureAuth, ensureRoles } from "../middlewares/auth.js";

const router = express.Router();
const upload = multer();

router.get("/", ensureAuth, showReportsAdmin);

router.post("/generate", ensureAuth, ensureRoles("admin", "manager"), upload.none(), generateReport);

router.post("/print-report", ensureAuth, ensureRoles("admin", "manager"), upload.none(), generatePrintableReport);

router.get("/custom-reports/download/:id", ensureAuth, ensureRoles("admin", "manager", "cashier"), downloadCustomReport);

router.post("/reportsadmin/generate-six-month-trend", ensureAuth, ensureRoles("admin", "manager"), upload.none(), createSixMonthTrendReport);

router.post("/reportsadmin/generate-service-issues", ensureAuth, ensureRoles("admin", "manager"), upload.none(), createServiceIssueReport);

router.post("/custom-reports/delete/:id", ensureAuth, ensureRoles("admin", "manager"), upload.none(), deleteCustomReport);

router.post("/preview-report", ensureAuth, ensureRoles("admin", "manager"), upload.none(), generatePrintableReport);

export default router;
