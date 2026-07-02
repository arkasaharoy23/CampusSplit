import { db, auth } from "../config/firebase-admin.js";
import admin from "firebase-admin";
import { sendSuccess, sendError } from "../utils/responseHandler.js";
import { isValidEmail } from "../utils/validators.js";

export const registerUser = async (req, res, next) => {
  try {
    const { uid, email, displayName, fname, lname, username, upiId, photoURL } = req.body;

    if (!uid || !email) return sendError(res, "uid and email are required.", 400);
    if (!isValidEmail(email)) return sendError(res, "Invalid email address.", 400);
    if (!username || username.length < 3) return sendError(res, "Username must be at least 3 characters.", 400);

    const usernameSnap = await db.collection("usernames").doc(username).get();
    if (usernameSnap.exists) return sendError(res, "Username is already taken.", 409);

    const userExists = await db.collection("users").doc(uid).get();
    if (userExists.exists) return sendError(res, "User already registered.", 409);

    const now = admin.firestore.FieldValue.serverTimestamp();
    const userData = {
      uid, email, displayName: displayName || `${fname} ${lname}`,
      fname: fname || "", lname: lname || "",
      username, upiId: upiId || "",
      photoURL: photoURL || "",
      createdAt: now, groups: [],
      totalOwed: 0, totalOwes: 0, totalSettled: 0,
    };

    const batch = db.batch();
    batch.set(db.collection("users").doc(uid), userData);
    batch.set(db.collection("usernames").doc(username), { uid, createdAt: now });
    await batch.commit();

    return sendSuccess(res, { user: userData }, "User registered successfully.", 201);
  } catch (err) {
    next(err);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) return sendError(res, "User not found.", 404);
    return sendSuccess(res, { user: { id: snap.id, ...snap.data() } });
  } catch (err) {
    next(err);
  }
};

export const deleteAccount = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) return sendError(res, "User not found.", 404);

    const userData = userSnap.data();
    const batch = db.batch();

    batch.delete(db.collection("users").doc(uid));
    if (userData.username) {
      batch.delete(db.collection("usernames").doc(userData.username));
    }

    await batch.commit();
    await auth.deleteUser(uid);

    return sendSuccess(res, {}, "Account deleted successfully.");
  } catch (err) {
    next(err);
  }
};