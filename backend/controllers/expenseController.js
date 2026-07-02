import { db } from "../config/firebase-admin.js";
import admin from "firebase-admin";
import { sendSuccess, sendError } from "../utils/responseHandler.js";
import { isValidAmount, isValidSplitType, validateSplits } from "../utils/validators.js";
import { recalculateMemberBalances, reverseExpenseBalances } from "../utils/calculateBalance.js";
import { notifyGroupMembers } from "../services/notificationService.js";

function computeSplits(members, amount, splitType, rawSplits) {
  const splits = {};
  const checkedIds = Object.keys(rawSplits).filter((uid) => rawSplits[uid] !== null);

  if (splitType === "equal") {
    const share = Math.round((amount / checkedIds.length) * 100) / 100;
    checkedIds.forEach((uid) => { splits[uid] = share; });
    members.filter(id => !checkedIds.includes(id)).forEach(id => { splits[id] = 0; });
  } else if (splitType === "percentage") {
    checkedIds.forEach((uid) => {
      splits[uid] = Math.round((amount * (rawSplits[uid] / 100)) * 100) / 100;
    });
    members.filter(id => !checkedIds.includes(id)).forEach(id => { splits[id] = 0; });
  } else if (splitType === "exact") {
    checkedIds.forEach((uid) => { splits[uid] = parseFloat(rawSplits[uid]); });
    members.filter(id => !checkedIds.includes(id)).forEach(id => { splits[id] = 0; });
  } else if (splitType === "shares") {
    const total = Object.values(rawSplits).reduce((a, b) => a + b, 0);
    checkedIds.forEach((uid) => {
      splits[uid] = total > 0 ? Math.round((amount * (rawSplits[uid] / total)) * 100) / 100 : 0;
    });
    members.filter(id => !checkedIds.includes(id)).forEach(id => { splits[id] = 0; });
  }

  return splits;
}

export const addExpense = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const {
      groupId, description, amount, originalAmount, originalCurrency,
      exchangeRateUsed, category, paidBy, splitType, splits: rawSplits,
    } = req.body;

    if (!groupId) return sendError(res, "groupId is required.", 400);
    if (!description?.trim()) return sendError(res, "Description is required.", 400);
    if (!isValidAmount(amount)) return sendError(res, "Invalid amount.", 400);
    if (!isValidSplitType(splitType)) return sendError(res, "Invalid split type.", 400);

    const groupSnap = await db.collection("groups").doc(groupId).get();
    if (!groupSnap.exists) return sendError(res, "Group not found.", 404);
    const group = groupSnap.data();
    if (!group.memberIds.includes(uid)) return sendError(res, "Access denied.", 403);

    const validation = validateSplits(rawSplits, amount, splitType);
    if (!validation.valid) return sendError(res, validation.message, 400);

    const splits = computeSplits(group.memberIds, amount, splitType, rawSplits);

    const paidBySnap = await db.collection("users").doc(paidBy).get();
    const paidByName = paidBySnap.exists ? paidBySnap.data().displayName : "Unknown";

    const now = admin.firestore.FieldValue.serverTimestamp();
    const expenseRef = db.collection("expenses").doc();
    const expenseData = {
      groupId, groupName: group.name, description: description.trim(),
      amount, originalAmount: originalAmount || amount,
      originalCurrency: originalCurrency || "INR",
      exchangeRateUsed: exchangeRateUsed || 1,
      category: category || "other",
      paidBy, paidByName, splitType, splits,
      memberIds: group.memberIds,
      createdBy: uid, createdAt: now,
    };

    const newBalances = recalculateMemberBalances(group.memberBalances || {}, expenseData, paidBy, splits);

    const batch = db.batch();
    batch.set(expenseRef, expenseData);
    batch.update(db.collection("groups").doc(groupId), {
      memberBalances: newBalances,
      totalExpenses: admin.firestore.FieldValue.increment(amount),
      updatedAt: now,
    });
    await batch.commit();

    await notifyGroupMembers(groupId, uid, "expense_added", {
      groupId, groupName: group.name, expenseId: expenseRef.id,
      description: description.trim(), amount, paidBy,
      message: `${paidByName} added "${description.trim()}" (₹${amount})`,
    });

    return sendSuccess(res, { expense: { id: expenseRef.id, ...expenseData } }, "Expense added.", 201);
  } catch (err) {
    next(err);
  }
};

export const getGroupExpenses = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { groupId } = req.params;

    const groupSnap = await db.collection("groups").doc(groupId).get();
    if (!groupSnap.exists) return sendError(res, "Group not found.", 404);
    if (!groupSnap.data().memberIds.includes(uid)) return sendError(res, "Access denied.", 403);

    const snap = await db.collection("expenses").where("groupId", "==", groupId).get();
    const expenses = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    expenses.sort((a, b) => {
      const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bt - at;
    });

    return sendSuccess(res, { expenses });
  } catch (err) {
    next(err);
  }
};

export const deleteExpense = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { expenseId } = req.params;

    const snap = await db.collection("expenses").doc(expenseId).get();
    if (!snap.exists) return sendError(res, "Expense not found.", 404);
    const expense = snap.data();

    if (expense.createdBy !== uid && expense.paidBy !== uid) {
      return sendError(res, "Only the expense creator or payer can delete it.", 403);
    }

    const groupSnap = await db.collection("groups").doc(expense.groupId).get();
    if (!groupSnap.exists) return sendError(res, "Group not found.", 404);

    const newBalances = reverseExpenseBalances(groupSnap.data().memberBalances || {}, expense);

    const batch = db.batch();
    batch.delete(db.collection("expenses").doc(expenseId));
    batch.update(db.collection("groups").doc(expense.groupId), {
      memberBalances: newBalances,
      totalExpenses: admin.firestore.FieldValue.increment(-expense.amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return sendSuccess(res, {}, "Expense deleted.");
  } catch (err) {
    next(err);
  }
};