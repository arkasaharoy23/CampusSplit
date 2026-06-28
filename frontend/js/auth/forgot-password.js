import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, sendPasswordResetEmail, confirmPasswordReset, verifyPasswordResetCode } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../config/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export async function sendResetEmail(email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  await sendPasswordResetEmail(auth, email, {
    url: window.location.origin + "/login.html"
  });
}

export async function verifyResetCode(oobCode) {
  const email = await verifyPasswordResetCode(auth, oobCode);
  return email;
}

export async function confirmReset(oobCode, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  await confirmPasswordReset(auth, oobCode, newPassword);
}

export function getOobCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("oobCode") || null;
}