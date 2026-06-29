import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../config/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

const toastContainer = document.getElementById("toastContainer");

function showToast(message, type = "info") {
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "toastOut 0.3s ease forwards";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function setLoading(btnId, spinnerId, loading) {
  const btn = document.getElementById(btnId);
  const spinner = document.getElementById(spinnerId);
  const text = btn.querySelector(".btn-text");
  if (loading) {
    text.style.opacity = "0.4";
    spinner.classList.remove("hidden");
    btn.disabled = true;
  } else {
    text.style.opacity = "1";
    spinner.classList.add("hidden");
    btn.disabled = false;
  }
}

function showError(fgId, errId, message) {
  document.getElementById(fgId)?.classList.add("error");
  const err = document.getElementById(errId);
  if (err) err.textContent = message;
}

function clearAllErrors() {
  document.querySelectorAll(".form-group.error").forEach(el => el.classList.remove("error"));
  document.querySelectorAll(".field-error").forEach(el => el.textContent = "");
}

function getFirebaseError(code) {
  const map = {
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password. Try again.",
    "auth/invalid-email": "That doesn't look like a valid email.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/popup-closed-by-user": "Sign-in popup was closed. Try again."
  };
  return map[code] || "Something went wrong. Please try again.";
}

const togglePass = document.getElementById("togglePass");
togglePass.addEventListener("click", () => {
  const input = document.getElementById("password");
  const isPass = input.type === "password";
  input.type = isPass ? "text" : "password";
  togglePass.querySelector(".eye-open").style.display = isPass ? "none" : "block";
  togglePass.querySelector(".eye-closed").style.display = isPass ? "block" : "none";
});

document.getElementById("email").addEventListener("input", () => {
  document.getElementById("fg-email").classList.remove("error");
  document.getElementById("err-email").textContent = "";
});
document.getElementById("password").addEventListener("input", () => {
  document.getElementById("fg-password").classList.remove("error");
  document.getElementById("err-password").textContent = "";
});

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAllErrors();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const remember = document.getElementById("remember").checked;

  let valid = true;
  if (!email) { showError("fg-email", "err-email", "Email is required."); valid = false; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError("fg-email", "err-email", "Enter a valid email address."); valid = false; }
  if (!password) { showError("fg-password", "err-password", "Password is required."); valid = false; }
  if (!valid) return;

  setLoading("submitBtn", "spinner", true);
  try {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, password);
    showToast("Welcome back! Redirecting…", "success");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 1200);
  } catch (err) {
    setLoading("submitBtn", "spinner", false);
    const msg = getFirebaseError(err.code);
    if (["auth/invalid-email", "auth/user-not-found", "auth/invalid-credential"].includes(err.code)) {
      showError("fg-email", "err-email", msg);
    } else if (err.code === "auth/wrong-password") {
      showError("fg-password", "err-password", msg);
    } else {
      showToast(msg, "error");
    }
  }
});

document.getElementById("googleBtn").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, googleProvider);
    showToast("Signed in with Google!", "success");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 1000);
  } catch (err) {
    if (err.code !== "auth/popup-closed-by-user") showToast(getFirebaseError(err.code), "error");
  }
});

const forgotModal = document.getElementById("forgotModal");
document.getElementById("forgotLink").addEventListener("click", (e) => { e.preventDefault(); forgotModal.classList.remove("hidden"); });
document.getElementById("modalClose").addEventListener("click", () => {
  forgotModal.classList.add("hidden");
  document.getElementById("err-reset").textContent = "";
  document.getElementById("resetEmail").value = "";
});
forgotModal.addEventListener("click", (e) => { if (e.target === forgotModal) forgotModal.classList.add("hidden"); });

document.getElementById("resetBtn").addEventListener("click", async () => {
  const email = document.getElementById("resetEmail").value.trim();
  const errReset = document.getElementById("err-reset");
  const btn = document.getElementById("resetBtn");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errReset.textContent = "Enter a valid email address.";
    return;
  }
  errReset.textContent = "";
  btn.disabled = true;
  btn.querySelector(".btn-text").textContent = "Sending…";
  try {
    await sendPasswordResetEmail(auth, email);
    showToast("Reset link sent! Check your inbox.", "success");
    forgotModal.classList.add("hidden");
  } catch (err) {
    errReset.textContent = getFirebaseError(err.code);
  } finally {
    btn.disabled = false;
    btn.querySelector(".btn-text").textContent = "Send reset link";
  }
});