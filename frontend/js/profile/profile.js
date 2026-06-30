import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "../config/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentUserData = null;

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

function clearError(fgId, errId) {
  document.getElementById(fgId)?.classList.remove("error");
  const err = document.getElementById(errId);
  if (err) err.textContent = "";
}

function getFirebaseError(code) {
  const map = {
    "auth/wrong-password": "Current password is incorrect.",
    "auth/weak-password": "Password must be at least 8 characters.",
    "auth/requires-recent-login": "Please log out and back in, then try again.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again.",
    "auth/network-request-failed": "Network error. Check your connection."
  };
  return map[code] || "Something went wrong. Please try again.";
}

const hamburgerBtn = document.getElementById("hamburgerBtn");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");

hamburgerBtn.addEventListener("click", () => {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("open");
});
sidebarOverlay.addEventListener("click", () => {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("open");
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch {
    showToast("Could not log out. Try again.", "error");
  }
});

function formatJoinDate(timestamp) {
  if (!timestamp?.toDate) return "";
  const date = timestamp.toDate();
  return "Joined " + date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

async function loadProfile(user) {
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) {
      showToast("Profile not found.", "error");
      return;
    }

    const data = snap.data();
    currentUserData = data;

    document.getElementById("sidebarName").textContent = data.displayName || "User";
    document.getElementById("sidebarEmail").textContent = data.email || "";
    document.getElementById("profileDisplayName").textContent = data.displayName || "User";
    document.getElementById("profileUsername").textContent = "@" + (data.username || "user");
    document.getElementById("profileJoined").textContent = formatJoinDate(data.createdAt);

    document.getElementById("fname").value = data.fname || "";
    document.getElementById("lname").value = data.lname || "";
    document.getElementById("usernameField").value = data.username || "";
    document.getElementById("emailField").value = data.email || "";
    document.getElementById("upiField").value = data.upiId || "";

    if (data.photoURL) {
      const imgHtml = `<img src="${data.photoURL}" alt="${data.displayName}" />`;
      document.getElementById("sidebarAvatar").innerHTML = imgHtml;
      document.getElementById("avatarEditPreview").innerHTML = imgHtml;
    }

    document.getElementById("statGroups").textContent = (data.groups || []).length;

    const expensesQ = query(collection(db, "expenses"), where("memberIds", "array-contains", user.uid));
    const expensesSnap = await getDocs(expensesQ);
    document.getElementById("statExpenses").textContent = expensesSnap.size;

    const settledAmount = data.totalSettled || 0;
    document.getElementById("statSettled").textContent = "₹" + settledAmount.toLocaleString("en-IN");

    const isGoogleUser = user.providerData.some(p => p.providerId === "google.com");
    if (isGoogleUser) {
      document.getElementById("authProviderLabel").textContent = "Signed in with Google";
      document.getElementById("providerBadge").textContent = "Google";
      document.getElementById("changePassBtn").disabled = true;
      document.getElementById("changePassBtn").title = "Not available for Google accounts";
    }
  } catch (err) {
    console.error(err);
    showToast("Failed to load profile.", "error");
  }
}

let avatarFile = null;
document.getElementById("avatarFileInput").addEventListener("change", () => {
  const file = document.getElementById("avatarFileInput").files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast("Photo must be under 5MB.", "error");
    return;
  }
  avatarFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("avatarEditPreview").innerHTML = `<img src="${e.target.result}" alt="Avatar" />`;
  };
  reader.readAsDataURL(file);
});

let usernameTimer = null;
document.getElementById("usernameField").addEventListener("input", () => {
  const val = document.getElementById("usernameField").value.trim().toLowerCase();
  const status = document.getElementById("usernameStatus");
  clearError("fg-username", "err-username");
  clearTimeout(usernameTimer);

  if (!val || val === currentUserData?.username) {
    status.textContent = "";
    return;
  }

  status.className = "input-status checking";
  status.textContent = "Checking…";

  usernameTimer = setTimeout(async () => {
    if (val.length < 3) { status.className = "input-status taken"; status.textContent = "Too short"; return; }
    if (!/^[a-z0-9_.]+$/.test(val)) { status.className = "input-status taken"; status.textContent = "Invalid"; return; }
    try {
      const snap = await getDoc(doc(db, "usernames", val));
      status.className = snap.exists() ? "input-status taken" : "input-status available";
      status.textContent = snap.exists() ? "Taken" : "Available";
    } catch { status.textContent = ""; }
  }, 500);
});

document.getElementById("personalForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const fname = document.getElementById("fname").value.trim();
  const lname = document.getElementById("lname").value.trim();
  const username = document.getElementById("usernameField").value.trim().toLowerCase();
  const upiId = document.getElementById("upiField").value.trim();

  clearError("fg-fname", "err-fname");
  clearError("fg-lname", "err-lname");
  clearError("fg-username", "err-username");

  let valid = true;
  if (!fname) { showError("fg-fname", "err-fname", "First name is required."); valid = false; }
  if (!lname) { showError("fg-lname", "err-lname", "Last name is required."); valid = false; }
  if (!username || username.length < 3) { showError("fg-username", "err-username", "Username must be at least 3 characters."); valid = false; }
  if (!valid) return;

  setLoading("saveProfileBtn", "saveSpinner", true);

  try {
    let photoURL = currentUserData.photoURL || "";

    if (avatarFile) {
      photoURL = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(avatarFile);
      });
    }

    const updates = {
      fname,
      lname,
      displayName: `${fname} ${lname}`,
      upiId
    };

    if (username !== currentUserData.username) {
      const snap = await getDoc(doc(db, "usernames", username));
      if (snap.exists()) {
        showError("fg-username", "err-username", "That username is already taken.");
        setLoading("saveProfileBtn", "saveSpinner", false);
        return;
      }
      updates.username = username;
    }

    if (photoURL) updates.photoURL = photoURL;

    await updateDoc(doc(db, "users", currentUser.uid), updates);
    await updateProfile(currentUser, { displayName: updates.displayName, photoURL: photoURL || undefined });

    currentUserData = { ...currentUserData, ...updates };

    document.getElementById("sidebarName").textContent = updates.displayName;
    document.getElementById("profileDisplayName").textContent = updates.displayName;
    document.getElementById("profileUsername").textContent = "@" + (updates.username || currentUserData.username);

    showToast("Profile updated!", "success");
  } catch (err) {
    console.error(err);
    showToast("Could not save changes. Try again.", "error");
  } finally {
    setLoading("saveProfileBtn", "saveSpinner", false);
  }
});

const passwordModal = document.getElementById("passwordModal");
document.getElementById("changePassBtn").addEventListener("click", () => {
  passwordModal.classList.remove("hidden");
});
document.getElementById("passwordModalClose").addEventListener("click", () => {
  passwordModal.classList.add("hidden");
  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  clearError("fg-current-pass", "err-current-pass");
  clearError("fg-new-pass", "err-new-pass");
});
passwordModal.addEventListener("click", (e) => { if (e.target === passwordModal) passwordModal.classList.add("hidden"); });

document.getElementById("updatePasswordBtn").addEventListener("click", async () => {
  const currentPass = document.getElementById("currentPassword").value;
  const newPass = document.getElementById("newPassword").value;

  document.getElementById("err-current-pass").textContent = "";
  document.getElementById("err-new-pass").textContent = "";

  let valid = true;
  if (!currentPass) { document.getElementById("err-current-pass").textContent = "Enter your current password."; valid = false; }
  if (!newPass || newPass.length < 8) { document.getElementById("err-new-pass").textContent = "Must be at least 8 characters."; valid = false; }
  if (!valid) return;

  setLoading("updatePasswordBtn", "passSpinner", true);

  try {
    const credential = EmailAuthProvider.credential(currentUser.email, currentPass);
    await reauthenticateWithCredential(currentUser, credential);
    await updatePassword(currentUser, newPass);
    showToast("Password updated!", "success");
    passwordModal.classList.add("hidden");
    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
  } catch (err) {
    const msg = getFirebaseError(err.code);
    if (err.code === "auth/wrong-password") document.getElementById("err-current-pass").textContent = msg;
    else showToast(msg, "error");
  } finally {
    setLoading("updatePasswordBtn", "passSpinner", false);
  }
});

const deleteModal = document.getElementById("deleteModal");
document.getElementById("deleteAccountBtn").addEventListener("click", () => {
  deleteModal.classList.remove("hidden");
});
document.getElementById("deleteModalClose").addEventListener("click", () => {
  deleteModal.classList.add("hidden");
  document.getElementById("deleteConfirmPassword").value = "";
  document.getElementById("err-delete-pass").textContent = "";
});
deleteModal.addEventListener("click", (e) => { if (e.target === deleteModal) deleteModal.classList.add("hidden"); });

document.getElementById("confirmDeleteBtn").addEventListener("click", async () => {
  const password = document.getElementById("deleteConfirmPassword").value;
  document.getElementById("err-delete-pass").textContent = "";

  if (!password) {
    document.getElementById("err-delete-pass").textContent = "Enter your password to confirm.";
    return;
  }

  setLoading("confirmDeleteBtn", "deleteSpinner", true);

  try {
    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);

    if (currentUserData.username) {
      await deleteDoc(doc(db, "usernames", currentUserData.username));
    }
    await deleteDoc(doc(db, "users", currentUser.uid));
    await deleteUser(currentUser);

    showToast("Account deleted.", "success");
    setTimeout(() => { window.location.href = "index.html"; }, 1200);
  } catch (err) {
    const msg = getFirebaseError(err.code);
    document.getElementById("err-delete-pass").textContent = msg;
    setLoading("confirmDeleteBtn", "deleteSpinner", false);
  }
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  loadProfile(user);
});