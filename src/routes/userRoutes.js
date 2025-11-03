import express from "express";
import { showLogin, loginUser, logoutUser } from "../controllers/userController.js";

const router = express.Router();

router.get("/login", showLogin);
router.post("/login", loginUser);
router.get("/logout", logoutUser);

export default router;
