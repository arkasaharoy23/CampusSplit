import express from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { registerUser, getMe, deleteAccount } from "../controllers/authController.js";

const router = express.Router();

router.post("/register", authLimiter, registerUser);
router.get("/me", verifyToken, getMe);
router.delete("/delete-account", verifyToken, deleteAccount);

export default router;