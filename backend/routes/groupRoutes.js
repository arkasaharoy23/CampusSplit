import express from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import {
  createGroup, getGroup, getUserGroups,
  updateGroup, deleteGroup, addMember,
  removeMember, joinByInviteCode,
} from "../controllers/groupController.js";

const router = express.Router();

router.get("/", verifyToken, getUserGroups);
router.post("/", verifyToken, createGroup);
router.get("/join/:code", verifyToken, joinByInviteCode);
router.get("/:groupId", verifyToken, getGroup);
router.put("/:groupId", verifyToken, updateGroup);
router.delete("/:groupId", verifyToken, deleteGroup);
router.post("/:groupId/members", verifyToken, addMember);
router.delete("/:groupId/members/:memberId", verifyToken, removeMember);

export default router;