import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
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
let allGroups = [];
let memberProfileCache = {};

const toastContainer = document.getElementById("toastContainer");
const avatarColors = ["#6C63FF", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4"];

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

function formatCurrency(amount) {
  return "₹" + Math.abs(amount).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function getAvatarColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getInitial(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
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

async function loadUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const data = snap.data();
      document.getElementById("sidebarName").textContent = data.displayName || "User";
      document.getElementById("sidebarEmail").textContent = data.email || "";
      if (data.photoURL) {
        document.getElementById("sidebarAvatar").innerHTML = `<img src="${data.photoURL}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function getMemberProfile(uid) {
  if (memberProfileCache[uid]) return memberProfileCache[uid];
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.exists() ? snap.data() : { displayName: "Unknown" };
    memberProfileCache[uid] = data;
    return data;
  } catch {
    return { displayName: "Unknown" };
  }
}

async function loadGroups(uid) {
  const grid = document.getElementById("groupsListGrid");
  const empty = document.getElementById("groupsListEmpty");

  try {
    const q = query(collection(db, "groups"), where("memberIds", "array-contains", uid));
    const snap = await getDocs(q);

    if (snap.empty) {
      grid.classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }

    allGroups = [];
    snap.forEach(docSnap => allGroups.push({ id: docSnap.id, ...docSnap.data() }));

    allGroups.sort((a, b) => {
      const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return bTime - aTime;
    });

    await renderGroups(allGroups, uid);
  } catch (err) {
    console.error(err);
    grid.classList.add("hidden");
    empty.classList.remove("hidden");
    showToast("Failed to load groups.", "error");
  }
}

async function renderGroups(groups, uid) {
  const grid = document.getElementById("groupsListGrid");
  const empty = document.getElementById("groupsListEmpty");
  const searchEmpty = document.getElementById("groupsSearchEmpty");

  searchEmpty.classList.add("hidden");

  if (groups.length === 0) {
    grid.classList.add("hidden");
    if (allGroups.length === 0) {
      empty.classList.remove("hidden");
    } else {
      searchEmpty.classList.remove("hidden");
    }
    return;
  }

  grid.classList.remove("hidden");
  empty.classList.add("hidden");
  grid.innerHTML = "";

  for (const g of groups) {
    const balance = g.memberBalances?.[uid] || 0;
    const balanceClass = balance > 0 ? "positive" : balance < 0 ? "negative" : "neutral";
    const balanceLabel = balance > 0 ? "you're owed" : balance < 0 ? "you owe" : "settled up";

    const memberAvatarsHtml = await Promise.all(
      (g.memberIds || []).slice(0, 4).map(async (memberId) => {
        const profile = await getMemberProfile(memberId);
        const name = profile.displayName || "?";
        return `<div class="gl-mini-avatar" style="background:${getAvatarColor(name)};" title="${name}">${getInitial(name)}</div>`;
      })
    );

    const card = document.createElement("a");
    card.href = `group-details.html?id=${g.id}`;
    card.className = "gl-card";
    card.innerHTML = `
      <div class="gl-card-icon">${g.emoji || "👥"}</div>
      <div class="gl-card-info">
        <p class="gl-card-name">${g.name || "Untitled group"}</p>
        <p class="gl-card-meta">${(g.memberIds || []).length} member${(g.memberIds || []).length !== 1 ? "s" : ""} · ${g.category || "general"}</p>
        <div class="gl-card-members">${memberAvatarsHtml.join("")}</div>
      </div>
      <div class="gl-card-balance">
        <p class="gl-balance-amount ${balanceClass}">${balance === 0 ? "₹0" : formatCurrency(balance)}</p>
        <p class="gl-balance-label">${balanceLabel}</p>
      </div>
    `;
    grid.appendChild(card);
  }
}

function applyFilters() {
  const searchTerm = document.getElementById("groupSearchInput").value.trim().toLowerCase();
  const activeFilter = document.querySelector(".gl-filter.active").dataset.filter;

  let filtered = allGroups;

  if (searchTerm) {
    filtered = filtered.filter(g => (g.name || "").toLowerCase().includes(searchTerm));
  }

  if (activeFilter !== "all") {
    filtered = filtered.filter(g => {
      const balance = g.memberBalances?.[currentUser.uid] || 0;
      if (activeFilter === "owe") return balance < -0.5;
      if (activeFilter === "owed") return balance > 0.5;
      if (activeFilter === "settled") return Math.abs(balance) <= 0.5;
      return true;
    });
  }

  renderGroups(filtered, currentUser.uid);
}

document.getElementById("groupSearchInput").addEventListener("input", applyFilters);

document.querySelectorAll(".gl-filter").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".gl-filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    applyFilters();
  });
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  await loadUserProfile(user.uid);
  await loadGroups(user.uid);
});