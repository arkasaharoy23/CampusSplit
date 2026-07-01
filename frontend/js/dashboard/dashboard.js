import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "../config/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

function formatCurrency(amount) {
  const abs = Math.abs(amount);
  return "₹" + abs.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function setGreeting() {
  const hour = new Date().getHours();
  let text = "Good evening";
  if (hour < 12) text = "Good morning";
  else if (hour < 17) text = "Good afternoon";

  const nameEl = document.getElementById("sidebarName");
  const firstName = (nameEl.textContent || "").split(" ")[0];
  document.getElementById("greetingText").textContent = `${text}${firstName && firstName !== "Loading…" ? ", " + firstName : ""} 👋`;

  const dateOptions = { weekday: "long", month: "long", day: "numeric" };
  document.getElementById("greetingDate").textContent = new Date().toLocaleDateString("en-IN", dateOptions);
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
  } catch (err) {
    showToast("Could not log out. Try again.", "error");
  }
});

const avatarColors = ["#EDE9FE", "#D1FAE5", "#FEF3C7", "#FEE2E2", "#DBEAFE", "#FCE7F3"];
function getAvatarColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getInitial(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const categoryIcons = {
  food: { icon: "🍽️", bg: "#FEF3C7" },
  travel: { icon: "✈️", bg: "#DBEAFE" },
  rent: { icon: "🏠", bg: "#D1FAE5" },
  fuel: { icon: "⛽", bg: "#FEE2E2" },
  shopping: { icon: "🛍️", bg: "#FCE7F3" },
  entertainment: { icon: "🎬", bg: "#EDE9FE" },
  other: { icon: "💰", bg: "#E5E7EB" }
};

function getCategoryMeta(category) {
  return categoryIcons[category] || categoryIcons.other;
}

async function loadUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const data = snap.data();
      document.getElementById("sidebarName").textContent = data.displayName || "User";
      document.getElementById("sidebarEmail").textContent = data.email || "";

      if (data.photoURL) {
        document.getElementById("sidebarAvatar").innerHTML = `<img src="${data.photoURL}" alt="${data.displayName}" />`;
        document.getElementById("topbarAvatar").innerHTML = `<img src="${data.photoURL}" alt="${data.displayName}" />`;
      }

      setGreeting();
      return data;
    }
  } catch (err) {
    console.error("Failed to load user profile:", err);
  }
  return null;
}

async function loadGroups(uid) {
  const groupsList = document.getElementById("groupsList");
  const groupsEmpty = document.getElementById("groupsEmpty");

  try {
    const q = query(
      collection(db, "groups"),
      where("memberIds", "array-contains", uid)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      groupsList.classList.add("hidden");
      groupsEmpty.classList.remove("hidden");
      return [];
    }

    let docs = [];
    snap.forEach((docSnap) => docs.push({ id: docSnap.id, data: docSnap.data() }));

    docs.sort((a, b) => {
      const aTime = a.data.updatedAt?.toMillis ? a.data.updatedAt.toMillis() : 0;
      const bTime = b.data.updatedAt?.toMillis ? b.data.updatedAt.toMillis() : 0;
      return bTime - aTime;
    });

    docs = docs.slice(0, 6);

    groupsList.classList.remove("hidden");
    groupsEmpty.classList.add("hidden");
    groupsList.innerHTML = "";
    const groups = [];

    docs.forEach(({ id, data: g }) => {
      groups.push({ id, ...g });

      const balance = g.memberBalances?.[uid] || 0;
      const balanceClass = balance > 0 ? "positive" : balance < 0 ? "negative" : "neutral";
      const balanceLabel = balance > 0 ? "you're owed" : balance < 0 ? "you owe" : "settled";

      const card = document.createElement("a");
      card.href = `group-details.html?id=${id}`;
      card.className = "group-card";
      card.innerHTML = `
        <div class="gc-icon" style="background:${getAvatarColor(g.name || "Group")};">${g.emoji || "👥"}</div>
        <div class="gc-info">
          <p class="gc-name">${g.name || "Untitled group"}</p>
          <p class="gc-meta">${(g.memberIds || []).length} members</p>
        </div>
        <div class="gc-balance">
          <p class="gc-amount ${balanceClass}">${balance === 0 ? "₹0" : formatCurrency(balance)}</p>
          <p class="gc-label">${balanceLabel}</p>
        </div>
      `;
      groupsList.appendChild(card);
    });

    return groups;
  } catch (err) {
    console.error("Failed to load groups:", err);
    groupsList.classList.add("hidden");
    groupsEmpty.classList.remove("hidden");
    return [];
  }
}

async function loadRecentActivity(uid) {
  const activityList = document.getElementById("activityList");
  const activityEmpty = document.getElementById("activityEmpty");

  try {
    const q = query(
      collection(db, "expenses"),
      where("memberIds", "array-contains", uid)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      activityList.classList.add("hidden");
      activityEmpty.classList.remove("hidden");
      return;
    }

    let docs = [];
    snap.forEach((docSnap) => docs.push(docSnap.data()));

    docs.sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bTime - aTime;
    });

    docs = docs.slice(0, 8);

    activityList.classList.remove("hidden");
    activityEmpty.classList.add("hidden");
    activityList.innerHTML = "";

    docs.forEach((e) => {
      const meta = getCategoryMeta(e.category);
      const isPaidByMe = e.paidBy === uid;
      const createdDate = e.createdAt?.toDate ? e.createdAt.toDate() : new Date();

      const row = document.createElement("div");
      row.className = "activity-row";
      row.innerHTML = `
        <div class="ar-icon" style="background:${meta.bg};">${meta.icon}</div>
        <div class="ar-info">
          <p class="ar-title">${e.description || "Expense"}</p>
          <p class="ar-meta">${isPaidByMe ? "You paid" : (e.paidByName || "Someone") + " paid"} · ${timeAgo(createdDate)}</p>
        </div>
        <div class="ar-amount" style="color:${isPaidByMe ? "var(--c-accent)" : "var(--c-text-muted)"};">
          ${formatCurrency(e.amount || 0)}
        </div>
      `;
      activityList.appendChild(row);
    });
  } catch (err) {
    console.error("Failed to load activity:", err);
    activityList.classList.add("hidden");
    activityEmpty.classList.remove("hidden");
  }
}

function renderSettlements(groups, uid) {
  const settleList = document.getElementById("settleList");
  const settleEmpty = document.getElementById("settleEmpty");

  const pending = groups
    .map(g => ({ group: g, balance: g.memberBalances?.[uid] || 0 }))
    .filter(item => item.balance !== 0)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
    .slice(0, 5);

  if (pending.length === 0) {
    settleList.classList.add("hidden");
    settleEmpty.classList.remove("hidden");
    return;
  }

  settleList.innerHTML = "";

  pending.forEach(({ group, balance }) => {
    const owes = balance < 0;
    const row = document.createElement("div");
    row.className = "settle-row";
    row.innerHTML = `
      <div class="sr-avatars">
        <div class="sr-avatar" style="background:${getAvatarColor(group.name)};">${getInitial(group.name)}</div>
      </div>
      <div class="sr-info">
        <p class="sr-text">${owes ? "You owe" : "You're owed"} <strong style="color:${owes ? "var(--c-red)" : "var(--c-accent)"}">${formatCurrency(balance)}</strong> in <strong>${group.name}</strong></p>
      </div>
      <button class="sr-btn" data-group="${group.id}">Settle</button>
    `;
    settleList.appendChild(row);
  });

  settleList.querySelectorAll(".sr-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      window.location.href = `settlements.html?group=${btn.dataset.group}`;
    });
  });
}

function renderBalanceSummary(groups, uid) {
  let totalOwed = 0;
  let totalOwes = 0;

  groups.forEach(g => {
    const balance = g.memberBalances?.[uid] || 0;
    if (balance > 0) totalOwed += balance;
    else totalOwes += Math.abs(balance);
  });

  const net = totalOwed - totalOwes;

  document.getElementById("totalOwed").textContent = formatCurrency(totalOwed);
  document.getElementById("totalOwes").textContent = formatCurrency(totalOwes);

  const netEl = document.getElementById("netBalance");
  const netSubEl = document.getElementById("netBalanceSub");

  if (net > 0) {
    netEl.textContent = formatCurrency(net);
    netEl.className = "bc-amount positive";
    netSubEl.textContent = "overall, you're owed";
  } else if (net < 0) {
    netEl.textContent = formatCurrency(net);
    netEl.className = "bc-amount negative";
    netSubEl.textContent = "overall, you owe";
  } else {
    netEl.textContent = "₹0";
    netEl.className = "bc-amount";
    netSubEl.textContent = "you're all settled up";
  }
}

async function checkNotifications(uid) {
  try {
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", uid),
      where("read", "==", false),
      limit(20)
    );
    const snap = await getDocs(q);
    const count = snap.size;

    if (count > 0) {
      const navBadge = document.getElementById("notifBadge");
      const topbarBadge = document.getElementById("topbarBadge");
      navBadge.textContent = count > 9 ? "9+" : count;
      navBadge.style.display = "flex";
      topbarBadge.style.display = "block";
    }
  } catch (err) {
    console.error("Failed to check notifications:", err);
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  await loadUserProfile(user.uid);
  const groups = await loadGroups(user.uid);
  await loadRecentActivity(user.uid);
  renderSettlements(groups, user.uid);
  renderBalanceSummary(groups, user.uid);
  checkNotifications(user.uid);
});