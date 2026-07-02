import { db } from "../config/firebase-admin.js";
import admin from "firebase-admin";
import { sendSuccess, sendError } from "../utils/responseHandler.js";
import { recordSettlement, simplifyGroupDebts } from "../services/debtSimplificationService.js";
import { notifyGroupMembers } from "../services/notificationService.js";

export const settleUp = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { groupId, toUid, amount } = req.body;

    if (!groupId) return sendError(res, "groupId is required.", 400);
    if (!toUid) return sendError(res, "toUid is required.", 400);
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return sendError(res, "Valid amount is required.", 400);
    }

    const groupSnap = await db.collection("groups").doc(groupId).get();
    if (!groupSnap.exists) return sendError(res, "Group not found.", 404);

    const group = groupSnap.data();
    if (!group.memberIds.includes(uid)) return sendError(res, "Access denied.", 403);
    if (!group.memberIds.includes(toUid)) return sendError(res, "Recipient is not in this group.", 400);

    const result = await recordSettlement(groupId, uid, toUid, amount);

    await notifyGroupMembers(groupId, uid, "settlement_done", {
      groupId, groupName: group.name,
      from: uid, to: toUid, amount,
      message: `A settlement of ₹${amount} was recorded in "${group.name}"`,
    });

    return sendSuccess(res, { settlement: result }, "Settlement recorded.", 201);
  } catch (err) {
    next(err);
  }
};

export const getGroupSettlements = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { groupId } = req.params;

    const groupSnap = await db.collection("groups").doc(groupId).get();
    if (!groupSnap.exists) return sendError(res, "Group not found.", 404);
    if (!groupSnap.data().memberIds.includes(uid)) return sendError(res, "Access denied.", 403);

    const snap = await db.collection("settlements").where("groupId", "==", groupId).get();
    const settlements = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    settlements.sort((a, b) => {
      const at = a.settledAt?.toMillis ? a.settledAt.toMillis() : 0;
      const bt = b.settledAt?.toMillis ? b.settledAt.toMillis() : 0;
      return bt - at;
    });

    return sendSuccess(res, { settlements });
  } catch (err) {
    next(err);
  }
};

export const getSuggestedSettlements = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { groupId } = req.params;

    const groupSnap = await db.collection("groups").doc(groupId).get();
    if (!groupSnap.exists) return sendError(res, "Group not found.", 404);
    if (!groupSnap.data().memberIds.includes(uid)) return sendError(res, "Access denied.", 403);

    const suggestions = await simplifyGroupDebts(groupId);
    return sendSuccess(res, { suggestions });
  } catch (err) {
    next(err);
  }
};

export const getUserSettlements = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const sentSnap = await db.collection("settlements").where("from", "==", uid).get();
    const receivedSnap = await db.collection("settlements").where("to", "==", uid).get();

    const sent = sentSnap.docs.map((doc) => ({ id: doc.id, direction: "sent", ...doc.data() }));
    const received = receivedSnap.docs.map((doc) => ({ id: doc.id, direction: "received", ...doc.data() }));
    const all = [...sent, ...received].sort((a, b) => {
      const at = a.settledAt?.toMillis ? a.settledAt.toMillis() : 0;
      const bt = b.settledAt?.toMillis ? b.settledAt.toMillis() : 0;
      return bt - at;
    });

    return sendSuccess(res, { settlements: all });
  } catch (err) {
    next(err);
  }
};