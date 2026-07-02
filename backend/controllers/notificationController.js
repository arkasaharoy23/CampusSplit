import { db } from "../config/firebase-admin.js";
import admin from "firebase-admin";
import { sendSuccess, sendError } from "../utils/responseHandler.js";
import { markNotificationsRead } from "../services/notificationService.js";

export const getNotifications = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const snap = await db.collection("notifications").where("userId", "==", uid).get();
    const notifications = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    notifications.sort((a, b) => {
      const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bt - at;
    });
    return sendSuccess(res, { notifications });
  } catch (err) {
    next(err);
  }
};

export const markAsRead = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "ids array is required.", 400);
    }

    await markNotificationsRead(uid, ids);
    return sendSuccess(res, {}, "Notifications marked as read.");
  } catch (err) {
    next(err);
  }
};

export const markAllAsRead = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const snap = await db.collection("notifications")
      .where("userId", "==", uid)
      .where("read", "==", false)
      .get();

    if (!snap.empty) {
      const batch = db.batch();
      snap.docs.forEach((doc) => batch.update(doc.ref, { read: true }));
      await batch.commit();
    }

    return sendSuccess(res, { count: snap.size }, "All notifications marked as read.");
  } catch (err) {
    next(err);
  }
};

export const deleteNotification = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { notifId } = req.params;

    const snap = await db.collection("notifications").doc(notifId).get();
    if (!snap.exists) return sendError(res, "Notification not found.", 404);
    if (snap.data().userId !== uid) return sendError(res, "Access denied.", 403);

    await db.collection("notifications").doc(notifId).delete();
    return sendSuccess(res, {}, "Notification deleted.");
  } catch (err) {
    next(err);
  }
};