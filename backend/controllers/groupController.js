import { db } from "../config/firebase-admin.js";
import admin from "firebase-admin";
import { sendSuccess, sendError } from "../utils/responseHandler.js";
import { notifyGroupMembers } from "../services/notificationService.js";

export const createGroup = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { name, emoji, category, description, memberEmails } = req.body;

    if (!name || name.trim().length < 2) return sendError(res, "Group name must be at least 2 characters.", 400);

    const memberIds = [uid];
    const pendingInvites = [];

    if (Array.isArray(memberEmails) && memberEmails.length > 0) {
      for (const email of memberEmails) {
        const snap = await db.collection("users").where("email", "==", email).limit(1).get();
        if (!snap.empty) {
          const memberId = snap.docs[0].id;
          if (!memberIds.includes(memberId)) memberIds.push(memberId);
        } else {
          pendingInvites.push(email);
        }
      }
    }

    const memberBalances = {};
    memberIds.forEach((id) => { memberBalances[id] = 0; });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const groupRef = db.collection("groups").doc();
    const groupData = {
      name: name.trim(), emoji: emoji || "👥",
      category: category || "general",
      description: description || "",
      createdBy: uid, memberIds, pendingInvites,
      memberBalances, totalExpenses: 0,
      createdAt: now, updatedAt: now,
    };

    await groupRef.set(groupData);

    await notifyGroupMembers(groupRef.id, uid, "group_created", {
      groupId: groupRef.id, groupName: name,
      createdBy: uid, message: `You were added to "${name}"`,
    });

    return sendSuccess(res, { group: { id: groupRef.id, ...groupData } }, "Group created.", 201);
  } catch (err) {
    next(err);
  }
};

export const getGroup = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { groupId } = req.params;

    const snap = await db.collection("groups").doc(groupId).get();
    if (!snap.exists) return sendError(res, "Group not found.", 404);

    const group = snap.data();
    if (!group.memberIds.includes(uid)) return sendError(res, "You are not a member of this group.", 403);

    return sendSuccess(res, { group: { id: snap.id, ...group } });
  } catch (err) {
    next(err);
  }
};

export const getUserGroups = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const snap = await db.collection("groups").where("memberIds", "array-contains", uid).get();
    const groups = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    groups.sort((a, b) => {
      const at = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const bt = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return bt - at;
    });
    return sendSuccess(res, { groups });
  } catch (err) {
    next(err);
  }
};

export const updateGroup = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { groupId } = req.params;
    const { name, emoji, category, description } = req.body;

    const snap = await db.collection("groups").doc(groupId).get();
    if (!snap.exists) return sendError(res, "Group not found.", 404);
    if (!snap.data().memberIds.includes(uid)) return sendError(res, "Access denied.", 403);

    const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (name) updates.name = name.trim();
    if (emoji) updates.emoji = emoji;
    if (category) updates.category = category;
    if (description !== undefined) updates.description = description;

    await db.collection("groups").doc(groupId).update(updates);
    return sendSuccess(res, { updates }, "Group updated.");
  } catch (err) {
    next(err);
  }
};

export const deleteGroup = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { groupId } = req.params;

    const snap = await db.collection("groups").doc(groupId).get();
    if (!snap.exists) return sendError(res, "Group not found.", 404);
    if (snap.data().createdBy !== uid) return sendError(res, "Only the group creator can delete this group.", 403);

    await db.collection("groups").doc(groupId).delete();
    return sendSuccess(res, {}, "Group deleted.");
  } catch (err) {
    next(err);
  }
};

export const addMember = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { groupId } = req.params;
    const { email } = req.body;

    if (!email) return sendError(res, "Email is required.", 400);

    const groupSnap = await db.collection("groups").doc(groupId).get();
    if (!groupSnap.exists) return sendError(res, "Group not found.", 404);
    if (!groupSnap.data().memberIds.includes(uid)) return sendError(res, "Access denied.", 403);

    const userSnap = await db.collection("users").where("email", "==", email).limit(1).get();

    if (!userSnap.empty) {
      const newMemberId = userSnap.docs[0].id;
      if (groupSnap.data().memberIds.includes(newMemberId)) {
        return sendError(res, "This user is already a member.", 409);
      }
      await db.collection("groups").doc(groupId).update({
        memberIds: admin.firestore.FieldValue.arrayUnion(newMemberId),
        [`memberBalances.${newMemberId}`]: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await notifyGroupMembers(groupId, uid, "member_added", {
        groupId, groupName: groupSnap.data().name,
        newMember: email, message: `${email} joined "${groupSnap.data().name}"`,
      });
      return sendSuccess(res, { added: true, uid: newMemberId }, "Member added.");
    } else {
      await db.collection("groups").doc(groupId).update({
        pendingInvites: admin.firestore.FieldValue.arrayUnion(email),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return sendSuccess(res, { added: false, invited: true }, "Invite sent.");
    }
  } catch (err) {
    next(err);
  }
};

export const removeMember = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { groupId, memberId } = req.params;

    const snap = await db.collection("groups").doc(groupId).get();
    if (!snap.exists) return sendError(res, "Group not found.", 404);

    const group = snap.data();
    if (group.createdBy !== uid && memberId !== uid) {
      return sendError(res, "Only the creator can remove other members.", 403);
    }

    const balance = group.memberBalances?.[memberId] || 0;
    if (Math.abs(balance) > 0.5) {
      return sendError(res, "Member must settle their balance before leaving.", 400);
    }

    await db.collection("groups").doc(groupId).update({
      memberIds: admin.firestore.FieldValue.arrayRemove(memberId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return sendSuccess(res, {}, "Member removed.");
  } catch (err) {
    next(err);
  }
};

export const joinByInviteCode = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { code } = req.params;

    const snap = await db.collection("groups").where("inviteCode", "==", code).limit(1).get();
    if (snap.empty) return sendError(res, "Invalid or expired invite code.", 404);

    const groupDoc = snap.docs[0];
    const group = groupDoc.data();

    if (group.memberIds.includes(uid)) {
      return sendSuccess(res, { groupId: groupDoc.id, alreadyMember: true }, "You are already a member.");
    }

    await groupDoc.ref.update({
      memberIds: admin.firestore.FieldValue.arrayUnion(uid),
      [`memberBalances.${uid}`]: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return sendSuccess(res, { groupId: groupDoc.id, groupName: group.name }, "Joined group successfully.");
  } catch (err) {
    next(err);
  }
};