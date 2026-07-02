import { db } from "../config/firebase-admin.js";
import admin from "firebase-admin";

export async function createNotification(userId, type, data) {
  const ref = db.collection("notifications").doc();
  const notification = {
    userId,
    type,
    data,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(notification);
  return { id: ref.id, ...notification };
}

export async function notifyGroupMembers(groupId, excludeUid, type, data) {
  const groupSnap = await db.collection("groups").doc(groupId).get();
  if (!groupSnap.exists) return;

  const memberIds = groupSnap.data().memberIds || [];
  const targets = memberIds.filter((uid) => uid !== excludeUid);

  const batch = db.batch();
  targets.forEach((userId) => {
    const ref = db.collection("notifications").doc();
    batch.set(ref, {
      userId,
      type,
      data,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
}

export async function markNotificationsRead(userId, notificationIds) {
  const batch = db.batch();
  notificationIds.forEach((id) => {
    const ref = db.collection("notifications").doc(id);
    batch.update(ref, { read: true });
  });
  await batch.commit();
}