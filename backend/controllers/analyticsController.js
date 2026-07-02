import { db } from "../config/firebase-admin.js";
import { sendSuccess, sendError } from "../utils/responseHandler.js";

export const getGroupAnalytics = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { groupId } = req.params;

    const groupSnap = await db.collection("groups").doc(groupId).get();
    if (!groupSnap.exists) return sendError(res, "Group not found.", 404);
    if (!groupSnap.data().memberIds.includes(uid)) return sendError(res, "Access denied.", 403);

    const expensesSnap = await db.collection("expenses").where("groupId", "==", groupId).get();
    const expenses = expensesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const categoryBreakdown = {};
    const monthlyTrend = {};
    const memberSpend = {};

    expenses.forEach((e) => {
      const cat = e.category || "other";
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (e.amount || 0);

      const date = e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthlyTrend[monthKey] = (monthlyTrend[monthKey] || 0) + (e.amount || 0);

      const payer = e.paidBy;
      if (payer) memberSpend[payer] = (memberSpend[payer] || 0) + (e.amount || 0);
    });

    return sendSuccess(res, {
      totalAmount,
      expenseCount: expenses.length,
      categoryBreakdown,
      monthlyTrend,
      memberSpend,
    });
  } catch (err) {
    next(err);
  }
};

export const getUserAnalytics = async (req, res, next) => {
  try {
    const uid = req.user.uid;

    const expensesSnap = await db.collection("expenses").where("memberIds", "array-contains", uid).get();
    const expenses = expensesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const totalPaid = expenses.filter(e => e.paidBy === uid).reduce((sum, e) => sum + (e.amount || 0), 0);
    const categoryBreakdown = {};
    const monthlyTrend = {};

    expenses.forEach((e) => {
      const cat = e.category || "other";
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (e.splits?.[uid] || 0);

      const date = e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthlyTrend[monthKey] = (monthlyTrend[monthKey] || 0) + (e.splits?.[uid] || 0);
    });

    const groupsSnap = await db.collection("groups").where("memberIds", "array-contains", uid).get();
    const totalOwed = Object.values(
      Object.fromEntries(groupsSnap.docs.map(d => [d.id, d.data().memberBalances?.[uid] || 0]))
    ).filter(v => v > 0).reduce((a, b) => a + b, 0);

    const totalOwes = Object.values(
      Object.fromEntries(groupsSnap.docs.map(d => [d.id, d.data().memberBalances?.[uid] || 0]))
    ).filter(v => v < 0).reduce((a, b) => a + Math.abs(b), 0);

    return sendSuccess(res, {
      totalPaid,
      totalOwed,
      totalOwes,
      expenseCount: expenses.length,
      groupCount: groupsSnap.size,
      categoryBreakdown,
      monthlyTrend,
    });
  } catch (err) {
    next(err);
  }
};