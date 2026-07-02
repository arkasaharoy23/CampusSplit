import express from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { getUserProfile, updateUserProfile, searchUserByEmail } from "../controllers/userController.js";

const router = express.Router();

router.get("/search", verifyToken, searchUserByEmail);
router.get("/:uid", verifyToken, getUserProfile);
router.put("/me", verifyToken, updateUserProfile);

export default router;