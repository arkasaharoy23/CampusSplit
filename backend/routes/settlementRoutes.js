import express from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import {
  settleUp, getGroupSettlements,
  getSuggestedSettlements, getUserSettlements,
} from "../controllers/settlementController.js";

const router = express.Router();

router.post("/", verifyToken, settleUp);
router.get("/me", verifyToken, getUserSettlements);
router.get("/group/:groupId", verifyToken, getGroupSettlements);
router.get("/group/:groupId/suggestions", verifyToken, getSuggestedSettlements);

export default router;