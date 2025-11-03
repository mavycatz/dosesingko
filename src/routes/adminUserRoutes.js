import express from "express";
import { showUserAdminPage, addUserForm, createUser, viewUser, editUserForm, updateUser, deleteUser, verifyUser } from "../controllers/userAdminController.js";
import { ensureAuth, ensureRoles } from "../middlewares/auth.js";

const router = express.Router();

router.get("/user-admin", ensureAuth, ensureRoles("admin", "manager"), showUserAdminPage);
router.get("/users/add", addUserForm);
router.post("/users/add", createUser);
router.get("/users/verify/:token", verifyUser);
router.get("/users/:id", ensureAuth, ensureRoles("admin", "manager"), viewUser);
router.get("/users/:id/edit", ensureAuth, ensureRoles("admin"), editUserForm);
router.post("/users/:id/edit", ensureAuth, ensureRoles("admin"), updateUser);
router.get("/users/:id/delete", ensureAuth, ensureRoles("admin"), deleteUser);

export default router;
