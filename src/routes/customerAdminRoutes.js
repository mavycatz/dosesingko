import express from "express";
import { showCustomerAdminPage, addORNumber, deleteORNumber } from "../controllers/CustomerAdminController.js";
import { ensureAuth, ensureRoles } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", ensureAuth, showCustomerAdminPage);

router.post("/add-or", ensureAuth, ensureRoles("cashier"), addORNumber);

router.post('/delete-or/:orNumber', ensureAuth, ensureRoles('admin', 'manager'), deleteORNumber);

export default router;
