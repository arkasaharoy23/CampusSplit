import express from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import {
  getNotifications, markAsRead,
  markAllAsRead, deleteNotification,
} from "../controllers/notificationController.js";

const router = express.Router();

router.get("/", verifyToken, getNotifications);
router.put("/read", verifyToken, markAsRead);
router.put("/read-all", verifyToken, markAllAsRead);
router.delete("/:notifId", verifyToken, deleteNotification);

export default router;