import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "../config/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

let registeredUser = null;
let formData = {};
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
  if (loading) { text.style.opacity = "0.4"; spinner.classList.remove("hidden"); btn.disabled = true; }
  else { text.style.opacity = "1"; spinner.classList.add("hidden"); btn.disabled = false; }
}

function showError(fgId, errId, msg) {
  document.getElementById(fgId)?.classList.add("error");
  const err = document.getElementById(errId);
  if (err) err.textContent = msg;
}

function clearAllErrors() {
  document.querySelectorAll(".form-group.error").forEach(el => el.classList.remove("error"));
  document.querySelectorAll(".field-error").forEach(el => el.textContent = "");
}

function getFirebaseError(code) {
  const map = {
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/invalid-email": "That doesn't look like a valid email.",
    "auth/weak-password": "Password must be at least 8 characters.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again.",
    "auth/popup-closed-by-user": "Sign-in popup was closed. Try again."
  };
  return map[code] || "Something went wrong. Please try again.";
}

function goToStep(step) {
  document.querySelectorAll(".reg-step").forEach(el => {
    el.classList.remove("active");
    el.style.display = "none";
  });
  const active = document.getElementById(`regStep${step}`);
  active.classList.add("active");
  active.style.display = "block";
  document.querySelectorAll(".prog-step").forEach((el, i) => {
    el.classList.remove("active", "done");
    if (i + 1 < step) el.classList.add("done");
    if (i + 1 === step) el.classList.add("active");
  });
  document.querySelectorAll(".prog-line").forEach((el, i) => {
    el.classList.toggle("done", i + 1 < step);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.getElementById("regPassword").addEventListener("input", () => {
  const val = document.getElementById("regPassword").value;
  const fill = document.getElementById("strengthFill");
  const label = document.getElementById("strengthLabel");
  let score = 0;
  if (val.length >= 8) score++;
  if (val.length >= 12) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const pcts = ["0%", "25%", "50%", "75%", "100%"];
  const colors = ["transparent", "#EF4444", "#F59E0B", "#10B981", "#6C63FF"];
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const s = Math.min(score, 4);
  fill.style.width = pcts[s];
  fill.style.background = colors[s];
  label.textContent = val ? labels[s] : "";
  label.style.color = colors[s];
  document.getElementById("fg-reg-pass").classList.remove("error");
  document.getElementById("err-reg-pass").textContent = "";
});

document.getElementById("toggleRegPass").addEventListener("click", () => {
  const input = document.getElementById("regPassword");
  const btn = document.getElementById("toggleRegPass");
  const isPass = input.type === "password";
  input.type = isPass ? "text" : "password";
  btn.querySelector(".eye-open").style.display = isPass ? "none" : "block";
  btn.querySelector(".eye-closed").style.display = isPass ? "block" : "none";
});

let usernameTimer = null;
document.getElementById("username").addEventListener("input", () => {
  const val = document.getElementById("username").value.trim().toLowerCase();
  const status = document.getElementById("usernameStatus");
  clearTimeout(usernameTimer);
  status.className = "input-status";
  status.textContent = "";
  document.getElementById("fg-username").classList.remove("error");
  document.getElementById("err-username").textContent = "";
  if (!val) return;
  status.className = "input-status checking";
  status.textContent = "Checking…";
  usernameTimer = setTimeout(async () => {
    if (val.length < 3) { status.className = "input-status taken"; status.textContent = "Too short"; return; }
    if (!/^[a-z0-9_.]+$/.test(val)) { status.className = "input-status taken"; status.textContent = "Invalid chars"; return; }
    try {
      const snap = await getDoc(doc(db, "usernames", val));
      status.className = snap.exists() ? "input-status taken" : "input-status available";
      status.textContent = snap.exists() ? "Taken" : "Available ✓";
    } catch { status.textContent = ""; }
  }, 500);
});

document.getElementById("avatarInput").addEventListener("change", () => {
  const file = document.getElementById("avatarInput").files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast("Photo must be under 5MB.", "error"); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("avatarPreview").innerHTML = `<img src="${e.target.result}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
  };
  reader.readAsDataURL(file);
});

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAllErrors();

  const fname = document.getElementById("fname").value.trim();
  const lname = document.getElementById("lname").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const confirm = document.getElementById("confirmPassword").value;
  const agreed = document.getElementById("agreeTerms").checked;

  let valid = true;
  if (!fname) { showError("fg-fname", "err-fname", "First name is required."); valid = false; }
  if (!lname) { showError("fg-lname", "err-lname", "Last name is required."); valid = false; }
  if (!email) { showError("fg-reg-email", "err-reg-email", "Email is required."); valid = false; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError("fg-reg-email", "err-reg-email", "Enter a valid email address."); valid = false; }
  if (!password) { showError("fg-reg-pass", "err-reg-pass", "Password is required."); valid = false; }
  else if (password.length < 8) { showError("fg-reg-pass", "err-reg-pass", "Password must be at least 8 characters."); valid = false; }
  if (password !== confirm) { showError("fg-reg-confirm", "err-confirm", "Passwords do not match."); valid = false; }
  if (!agreed) { document.getElementById("err-terms").textContent = "You must agree to continue."; valid = false; }
  if (!valid) return;

  setLoading("regSubmitBtn", "regSpinner", true);
  formData = { fname, lname, email, password };

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    registeredUser = cred.user;
    await updateProfile(registeredUser, { displayName: `${fname} ${lname}` });
    showToast("Account created! Complete your profile.", "success");
    goToStep(2);
  } catch (err) {
    setLoading("regSubmitBtn", "regSpinner", false);
    const msg = getFirebaseError(err.code);
    if (err.code === "auth/email-already-in-use") showError("fg-reg-email", "err-reg-email", msg);
    else showToast(msg, "error");
  }
});

document.getElementById("backToStep1").addEventListener("click", () => goToStep(1));

document.getElementById("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAllErrors();

  const username = document.getElementById("username").value.trim().toLowerCase();
  const upiId = document.getElementById("upiId").value.trim();

  if (!username) { showError("fg-username", "err-username", "Choose a username."); return; }
  if (username.length < 3) { showError("fg-username", "err-username", "At least 3 characters."); return; }
  if (!/^[a-z0-9_.]+$/.test(username)) { showError("fg-username", "err-username", "Only letters, numbers, dots, and underscores."); return; }

  setLoading("finishBtn", "finishSpinner", true);

  try {
    const usernameSnap = await getDoc(doc(db, "usernames", username));
    if (usernameSnap.exists()) {
      showError("fg-username", "err-username", "That username is already taken.");
      setLoading("finishBtn", "finishSpinner", false);
      return;
    }

    let photoURL = registeredUser.photoURL || "";
    const avatarFile = document.getElementById("avatarInput").files[0];
    if (avatarFile) {
      photoURL = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(avatarFile);
      });
    }

    const userData = {
      uid: registeredUser.uid,
      fname: formData.fname,
      lname: formData.lname,
      displayName: `${formData.fname} ${formData.lname}`,
      email: formData.email,
      username,
      upiId: upiId || "",
      photoURL,
      createdAt: serverTimestamp(),
      groups: [],
      totalOwed: 0,
      totalOwes: 0
    };

    await setDoc(doc(db, "users", registeredUser.uid), userData);
    await setDoc(doc(db, "usernames", username), { uid: registeredUser.uid });
    if (photoURL) await updateProfile(registeredUser, { photoURL });

    showToast("Welcome to CampusSplit! 🎉", "success");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 1400);
  } catch (err) {
    setLoading("finishBtn", "finishSpinner", false);
    showToast("Could not save profile. Try again.", "error");
    console.error(err);
  }
});

document.getElementById("googleRegBtn").addEventListener("click", async () => {
  const btn = document.getElementById("googleRegBtn");
  btn.disabled = true;
  btn.style.opacity = "0.6";
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) {
      registeredUser = user;
      const parts = (user.displayName || "").split(" ");
      formData.fname = parts[0] || "";
      formData.lname = parts.slice(1).join(" ") || "";
      formData.email = user.email || "";
      goToStep(2);
      showToast("Google connected! Complete your profile.", "info");
    } else {
      showToast("Welcome back!", "success");
      setTimeout(() => { window.location.href = "dashboard.html"; }, 1000);
    }
  } catch (err) {
    btn.disabled = false;
    btn.style.opacity = "1";
    if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
      showToast(getFirebaseError(err.code), "error");
    }
  }
});