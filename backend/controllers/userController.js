import { db } from "../config/firebase-admin.js";
import { sendSuccess, sendError } from "../utils/responseHandler.js";

export const getUserProfile = async (req, res, next) => {
  try {
    const { uid } = req.params;
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) return sendError(res, "User not found.", 404);
    const { uid: _uid, email, ...publicData } = snap.data();
    return sendSuccess(res, { user: { id: snap.id, ...publicData } });
  } catch (err) {
    next(err);
  }
};

export const updateUserProfile = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { fname, lname, username, upiId, photoURL } = req.body;

    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) return sendError(res, "User not found.", 404);
    const currentData = userSnap.data();

    const updates = {};
    if (fname) updates.fname = fname;
    if (lname) updates.lname = lname;
    if (fname || lname) updates.displayName = `${fname || currentData.fname} ${lname || currentData.lname}`;
    if (upiId !== undefined) updates.upiId = upiId;
    if (photoURL !== undefined) updates.photoURL = photoURL;

    if (username && username !== currentData.username) {
      if (username.length < 3) return sendError(res, "Username too short.", 400);
      if (!/^[a-z0-9_.]+$/.test(username)) return sendError(res, "Username contains invalid characters.", 400);
      const taken = await db.collection("usernames").doc(username).get();
      if (taken.exists) return sendError(res, "Username already taken.", 409);

      const batch = db.batch();
      if (currentData.username) batch.delete(db.collection("usernames").doc(currentData.username));
      batch.set(db.collection("usernames").doc(username), { uid });
      batch.update(db.collection("users").doc(uid), { ...updates, username });
      await batch.commit();
    } else {
      await db.collection("users").doc(uid).update(updates);
    }

    return sendSuccess(res, { updates }, "Profile updated successfully.");
  } catch (err) {
    next(err);
  }
};

export const searchUserByEmail = async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) return sendError(res, "Email query is required.", 400);

    const snap = await db.collection("users").where("email", "==", email.toLowerCase()).limit(1).get();
    if (snap.empty) return sendSuccess(res, { found: false, user: null });

    const doc = snap.docs[0];
    const { uid: _uid, email: _email, ...publicData } = doc.data();
    return sendSuccess(res, { found: true, user: { id: doc.id, ...publicData } });
  } catch (err) {
    next(err);
  }
};