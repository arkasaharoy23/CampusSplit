import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "../config/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentUserData = null;
let selectedEmoji = "👥";
let selectedCategory = "general";
let members = [];

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

const hamburgerBtn = document.getElementById("hamburgerBtn");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
hamburgerBtn.addEventListener("click", () => { sidebar.classList.add("open"); sidebarOverlay.classList.add("open"); });
sidebarOverlay.addEventListener("click", () => { sidebar.classList.remove("open"); sidebarOverlay.classList.remove("open"); });

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try { await signOut(auth); window.location.href = "login.html"; }
  catch { showToast("Could not log out.", "error"); }
});

function goToStep(step) {
  document.querySelectorAll(".cg-step").forEach(el => {
    el.classList.remove("active");
    el.style.display = "none";
  });
  const active = document.getElementById(`cgStep${step}`);
  active.classList.add("active");
  active.style.display = "block";

  document.querySelectorAll(".cg-prog-step").forEach((el, i) => {
    el.classList.remove("active", "done");
    if (i + 1 < step) el.classList.add("done");
    if (i + 1 === step) el.classList.add("active");
  });
  document.querySelectorAll(".cg-prog-line").forEach((el, i) => {
    el.classList.toggle("done", i + 1 < step);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".emoji-option").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".emoji-option").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedEmoji = btn.dataset.emoji;
  });
});

document.querySelectorAll(".cat-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".cat-pill").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedCategory = btn.dataset.cat;
  });
});

document.getElementById("groupName").addEventListener("input", () => {
  document.getElementById("fg-group-name").classList.remove("error");
  document.getElementById("err-group-name").textContent = "";
});

document.getElementById("step1Next").addEventListener("click", () => {
  const name = document.getElementById("groupName").value.trim();
  if (!name) {
    document.getElementById("fg-group-name").classList.add("error");
    document.getElementById("err-group-name").textContent = "Give your group a name.";
    return;
  }
  if (name.length < 2) {
    document.getElementById("fg-group-name").classList.add("error");
    document.getElementById("err-group-name").textContent = "Name is too short.";
    return;
  }
  goToStep(2);
});

document.getElementById("step2Back").addEventListener("click", () => goToStep(1));

function renderMembers() {
  const list = document.getElementById("membersList");
  const youChip = list.querySelector(".you-chip");
  list.innerHTML = "";
  list.appendChild(youChip);

  members.forEach((m, i) => {
    const chip = document.createElement("div");
    chip.className = "member-chip";
    chip.innerHTML = `
      <div class="member-avatar">${m.email.charAt(0).toUpperCase()}</div>
      <div class="member-info">
        <p class="member-name">${m.email}</p>
        <p class="member-tag">${m.status === "found" ? "Existing user" : "Will be invited"}</p>
      </div>
      <button type="button" class="member-remove" data-index="${i}">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    `;
    list.appendChild(chip);
  });

  list.querySelectorAll(".member-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      members.splice(parseInt(btn.dataset.index), 1);
      renderMembers();
    });
  });
}

document.getElementById("addMemberBtn").addEventListener("click", async () => {
  const input = document.getElementById("memberEmailInput");
  const email = input.value.trim().toLowerCase();
  const errEl = document.getElementById("err-member-email");
  errEl.textContent = "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = "Enter a valid email address.";
    return;
  }
  if (email === currentUserData.email) {
    errEl.textContent = "That's your own email.";
    return;
  }
  if (members.some(m => m.email === email)) {
    errEl.textContent = "Already added.";
    return;
  }

  try {
    const q = query(collection(db, "users"), where("email", "==", email));
    const snap = await getDocs(q);
    const status = snap.empty ? "invite" : "found";
    const uid = snap.empty ? null : snap.docs[0].id;

    members.push({ email, status, uid });
    renderMembers();
    input.value = "";
  } catch (err) {
    console.error(err);
    members.push({ email, status: "invite", uid: null });
    renderMembers();
    input.value = "";
  }
});

document.getElementById("memberEmailInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("addMemberBtn").click();
  }
});

document.getElementById("step2Next").addEventListener("click", () => {
  document.getElementById("reviewIcon").textContent = selectedEmoji;
  document.getElementById("reviewName").textContent = document.getElementById("groupName").value.trim();
  document.getElementById("reviewCategory").textContent = selectedCategory;

  const reviewList = document.getElementById("reviewMembersList");
  reviewList.innerHTML = `
    <div class="review-member-row">
      <div class="review-member-avatar" style="background:rgba(168,255,120,0.18); color:var(--c-accent);">${(currentUserData.displayName || "Y").charAt(0).toUpperCase()}</div>
      <p class="review-member-name">${currentUserData.displayName || "You"} (you)</p>
    </div>
  `;
  members.forEach(m => {
    reviewList.innerHTML += `
      <div class="review-member-row">
        <div class="review-member-avatar">${m.email.charAt(0).toUpperCase()}</div>
        <p class="review-member-name">${m.email}</p>
      </div>
    `;
  });

  document.getElementById("reviewMemberCount").textContent = `(${members.length + 1})`;
  goToStep(3);
});

document.getElementById("step3Back").addEventListener("click", () => goToStep(2));

document.getElementById("createGroupBtn").addEventListener("click", async () => {
  const name = document.getElementById("groupName").value.trim();
  setLoading("createGroupBtn", "createSpinner", true);

  try {
    const memberIds = [currentUser.uid, ...members.filter(m => m.uid).map(m => m.uid)];
    const memberBalances = {};
    memberIds.forEach(id => { memberBalances[id] = 0; });

    const groupRef = doc(collection(db, "groups"));
    const groupData = {
      name,
      emoji: selectedEmoji,
      category: selectedCategory,
      createdBy: currentUser.uid,
      memberIds,
      pendingInvites: members.filter(m => !m.uid).map(m => m.email),
      memberBalances,
      totalExpenses: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(groupRef, groupData);

    showToast("Group created! 🎉", "success");
    setTimeout(() => { window.location.href = `group-details.html?id=${groupRef.id}`; }, 1200);
  } catch (err) {
    console.error(err);
    showToast("Could not create group. Try again.", "error");
    setLoading("createGroupBtn", "createSpinner", false);
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      currentUserData = snap.data();
      document.getElementById("sidebarName").textContent = currentUserData.displayName || "User";
      document.getElementById("sidebarEmail").textContent = currentUserData.email || "";
      document.getElementById("youName").textContent = (currentUserData.displayName || "You") + " (you)";
      document.getElementById("youAvatar").textContent = (currentUserData.displayName || "Y").charAt(0).toUpperCase();

      if (currentUserData.photoURL) {
        document.getElementById("sidebarAvatar").innerHTML = `<img src="${currentUserData.photoURL}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
      }
    }
  } catch (err) {
    console.error(err);
  }
});