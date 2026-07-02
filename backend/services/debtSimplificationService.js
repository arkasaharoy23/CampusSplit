import { generateSettlements } from "../utils/generateSettlement.js";
import { db } from "../config/firebase-admin.js";
import admin from "firebase-admin";

export async function simplifyGroupDebts(groupId) {
  const groupRef = db.collection("groups").doc(groupId);
  const groupSnap = await groupRef.get();

  if (!groupSnap.exists) throw new Error("Group not found.");

  const groupData = groupSnap.data();
  const memberBalances = groupData.memberBalances || {};

  const settlements = generateSettlements(memberBalances);
  return settlements;
}

export async function recordSettlement(groupId, fromUid, toUid, amount) {
  const groupRef = db.collection("groups").doc(groupId);
  const groupSnap = await groupRef.get();

  if (!groupSnap.exists) throw new Error("Group not found.");

  const groupData = groupSnap.data();
  const balances = { ...(groupData.memberBalances || {}) };

  if (!(fromUid in balances)) balances[fromUid] = 0;
  if (!(toUid in balances)) balances[toUid] = 0;

  balances[fromUid] = Math.round((balances[fromUid] + amount) * 100) / 100;
  balances[toUid] = Math.round((balances[toUid] - amount) * 100) / 100;

  const settlementRef = db.collection("settlements").doc();
  const settlementData = {
    groupId,
    from: fromUid,
    to: toUid,
    amount,
    settledAt: admin.firestore.FieldValue.serverTimestamp(),
    status: "completed",
  };

  const batch = db.batch();
  batch.set(settlementRef, settlementData);
  batch.update(groupRef, {
    memberBalances: balances,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return { id: settlementRef.id, ...settlementData, memberBalances: balances };
}