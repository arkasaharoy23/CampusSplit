import express from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { getGroupAnalytics, getUserAnalytics } from "../controllers/analyticsController.js";

const router = express.Router();

router.get("/me", verifyToken, getUserAnalytics);
router.get("/group/:groupId", verifyToken, getGroupAnalytics);

export default router;