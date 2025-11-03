import express from "express";
import { ensureAuth, ensureRoles } from "../middlewares/auth.js";
import * as feedbackAdminController from "../controllers/FeedbackAdminController.js";
import { getAiReply } from "../controllers/FeedbackAdminController.js";

const router = express.Router();

// ---------------- Feedback Admin ----------------

router.get(
  "/feedbackadmin",
  ensureAuth,
  ensureRoles("admin", "manager", "cashier"),
  feedbackAdminController.getAllFeedbacks
);

router.post(
  "/feedback/approve/:id",
  ensureAuth,
  ensureRoles("admin", "manager"),
  feedbackAdminController.approveFeedback
);

router.post(
  "/feedback/reply/:id",
  ensureAuth,
  ensureRoles("admin", "manager"),
  feedbackAdminController.replyFeedback
);

router.post(
  "/feedback/delete/:id",
  ensureAuth,
  ensureRoles("admin", "manager"),
  feedbackAdminController.deleteFeedback
);

router.post(
  "/feedback/reply/delete/:feedbackId/:replyId",
  ensureAuth,
  ensureRoles("admin", "manager"),
  feedbackAdminController.deleteReply
);

router.post(
  "/feedback/reply/edit/:feedbackId/:replyId",
  ensureAuth,
  ensureRoles("admin", "manager"),
  feedbackAdminController.editReply
);

router.get(
  "/feedback/edit/:id",
  ensureAuth,
  ensureRoles("admin", "manager"),
  feedbackAdminController.getEditFeedback
);

router.post(
  "/feedback/edit/:id",
  ensureAuth,
  ensureRoles("admin", "manager"),
  feedbackAdminController.postEditFeedback
);

// ---------------- Menu Management ----------------

router.post(
  "/menu",
  ensureAuth,
  ensureRoles("admin", "manager"),
  feedbackAdminController.addMenu
);

router.delete(
  "/menu/:id",
  ensureAuth,
  ensureRoles("admin", "manager"),
  feedbackAdminController.deleteMenu
);

router.put(
  "/menu/:id",
  ensureAuth,
  ensureRoles("admin", "manager"),
  feedbackAdminController.editMenu
);

router.put(
  "/menu/:id/archive",
  ensureAuth,
  ensureRoles("admin", "manager"),
  feedbackAdminController.archiveMenu
);

router.put(
  "/menu/:id/unarchive",
  ensureAuth,
  ensureRoles("admin", "manager"),
  feedbackAdminController.unarchiveMenu
);

router.get(
  "/menu/archived",
  ensureAuth,
  ensureRoles("admin", "manager"),
  feedbackAdminController.getArchivedMenus
);

// ✅ FIXED multi-delete route (correct controller reference)
router.post(
  "/feedback/delete-multiple",
  ensureAuth,
  ensureRoles("admin", "manager"),
  feedbackAdminController.deleteMultipleFeedbacks
);

// AI auto-reply
router.get(
  "/ai-reply/:id",
  ensureAuth,
  ensureRoles("admin", "manager"),
  getAiReply
);

export default router;
