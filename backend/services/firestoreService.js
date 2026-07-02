import { db } from "../config/firebase-admin.js";

export const firestoreService = {
  async getDoc(collection, id) {
    const snap = await db.collection(collection).doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
  },

  async setDoc(collection, id, data) {
    await db.collection(collection).doc(id).set(data, { merge: true });
    return { id, ...data };
  },

  async updateDoc(collection, id, data) {
    await db.collection(collection).doc(id).update(data);
    return { id, ...data };
  },

  async deleteDoc(collection, id) {
    await db.collection(collection).doc(id).delete();
    return { id };
  },

  async addDoc(collection, data) {
    const ref = await db.collection(collection).add(data);
    return { id: ref.id, ...data };
  },

  async queryDocs(collection, filters = [], orderByField = null, limitCount = null) {
    let ref = db.collection(collection);
    filters.forEach(([field, op, value]) => {
      ref = ref.where(field, op, value);
    });
    if (orderByField) ref = ref.orderBy(orderByField, "desc");
    if (limitCount) ref = ref.limit(limitCount);
    const snap = await ref.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  getTimestamp() {
    return db.FieldValue ? db.FieldValue.serverTimestamp() : new Date();
  },

  serverTimestamp() {
    const { FieldValue } = await import("firebase-admin/firestore");
    return FieldValue.serverTimestamp();
  },

  arrayUnion(...items) {
    const admin = require("firebase-admin");
    return admin.firestore.FieldValue.arrayUnion(...items);
  },

  arrayRemove(...items) {
    const admin = require("firebase-admin");
    return admin.firestore.FieldValue.arrayRemove(...items);
  },

  increment(n) {
    const admin = require("firebase-admin");
    return admin.firestore.FieldValue.increment(n);
  },
};