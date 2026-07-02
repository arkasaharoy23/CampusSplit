import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "../config/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const urlParams = new URLSearchParams(window.location.search);
const groupId = urlParams.get("id");

let currentUser = null;
let currentUserData = null;
let groupData = null;
let memberProfiles = {};
let allExpenses = [];

const toastContainer = document.getElementById("toastContainer");
const avatarColors = ["#6C63FF", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4"];

function getAvatarColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

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

function getInitial(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

function formatExpenseDate(date) {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
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

const hamburgerBtn = document.getElementById("hamburgerBtn");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
hamburgerBtn.addEventListener("click", () => { sidebar.classList.add("open"); sidebarOverlay.classList.add("open"); });
sidebarOverlay.addEventListener("click", () => { sidebar.classList.remove("open"); sidebarOverlay.classList.remove("open"); });

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try { await signOut(auth); window.location.href = "login.html"; }
  catch { showToast("Could not log out.", "error"); }
});

document.querySelectorAll(".gd-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".gd-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".gd-panel").forEach(p => { p.classList.remove("active"); p.style.display = "none"; });
    const panel = document.getElementById(`panel${tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)}`);
    panel.classList.add("active");
    panel.style.display = "block";
  });
});

document.querySelectorAll(".filter-pill").forEach(pill => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    renderExpenses(pill.dataset.filter);
  });
});

async function loadGroup() {
  if (!groupId) {
    showToast("No group specified.", "error");
    setTimeout(() => { window.location.href = "groups.html"; }, 1500);
    return;
  }

  try {
    const snap = await getDoc(doc(db, "groups", groupId));
    if (!snap.exists()) {
      showToast("Group not found.", "error");
      setTimeout(() => { window.location.href = "groups.html"; }, 1500);
      return;
    }

    groupData = { id: snap.id, ...snap.data() };

    if (!groupData.memberIds.includes(currentUser.uid)) {
      showToast("You don't have access to this group.", "error");
      setTimeout(() => { window.location.href = "dashboard.html"; }, 1500);
      return;
    }

    await loadMemberProfiles();
    renderHero();
    await loadExpenses();
    renderBalances();
    renderMembers();
  } catch (err) {
    console.error(err);
    showToast("Failed to load group.", "error");
  }
}

async function loadMemberProfiles() {
  memberProfiles = {};
  await Promise.all(groupData.memberIds.map(async (uid) => {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) memberProfiles[uid] = snap.data();
    } catch (err) {
      console.error(err);
    }
  }));
}

function renderHero() {
  document.getElementById("gdHeroSkeleton").classList.add("hidden");
  document.getElementById("gdHeroInner").classList.remove("hidden");

  document.getElementById("gdIcon").textContent = groupData.emoji || "👥";
  document.getElementById("gdName").textContent = groupData.name;
  document.getElementById("gdAddExpenseLink").href = `add-expense.html?group=${groupData.id}`;

  const membersRow = document.getElementById("gdMembersRow");
  membersRow.innerHTML = "";
  groupData.memberIds.slice(0, 5).forEach(uid => {
    const profile = memberProfiles[uid];
    const name = profile?.displayName || "?";
    const avatar = document.createElement("div");
    avatar.className = "gd-member-avatar";
    avatar.style.background = getAvatarColor(name);
    avatar.style.color = "#fff";
    avatar.textContent = getInitial(name);
    avatar.title = name;
    membersRow.appendChild(avatar);
  });

  const countLabel = document.createElement("span");
  countLabel.className = "gd-members-count";
  countLabel.textContent = `${groupData.memberIds.length} member${groupData.memberIds.length !== 1 ? "s" : ""}`;
  membersRow.appendChild(countLabel);
}

async function loadExpenses() {
  const timeline = document.getElementById("expenseTimeline");
  const empty = document.getElementById("expensesEmpty");

  try {
    const q = query(
      collection(db, "expenses"),
      where("groupId", "==", groupId)
    );
    const snap = await getDocs(q);

    allExpenses = [];
    snap.forEach(docSnap => allExpenses.push({ id: docSnap.id, ...docSnap.data() }));

    allExpenses.sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bTime - aTime;
    });

    if (allExpenses.length === 0) {
      timeline.classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }

    renderExpenses("all");
  } catch (err) {
    console.error(err);
    timeline.classList.add("hidden");
    empty.classList.remove("hidden");
  }
}

function renderExpenses(filter) {
  const timeline = document.getElementById("expenseTimeline");
  const empty = document.getElementById("expensesEmpty");

  let filtered = allExpenses;
  if (filter === "mine") filtered = allExpenses.filter(e => e.paidBy === currentUser.uid);
  if (filter === "others") filtered = allExpenses.filter(e => e.paidBy !== currentUser.uid);

  if (filtered.length === 0) {
    timeline.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  timeline.classList.remove("hidden");
  empty.classList.add("hidden");
  timeline.innerHTML = "";

  let lastDateLabel = null;

  filtered.forEach(expense => {
    const date = expense.createdAt?.toDate ? expense.createdAt.toDate() : new Date();
    const dateLabel = formatExpenseDate(date);

    if (dateLabel !== lastDateLabel) {
      const label = document.createElement("div");
      label.className = "timeline-date-label";
      label.textContent = dateLabel;
      timeline.appendChild(label);
      lastDateLabel = dateLabel;
    }

    const meta = getCategoryMeta(expense.category);
    const isPaidByMe = expense.paidBy === currentUser.uid;
    const paidByName = memberProfiles[expense.paidBy]?.displayName || expense.paidByName || "Someone";

    const myShare = expense.splits?.[currentUser.uid] || 0;
    let splitText = "";
    let splitClass = "neutral";

    if (isPaidByMe) {
      const othersOwe = (expense.amount || 0) - myShare;
      if (othersOwe > 0) {
        splitText = `you lent ${formatCurrency(othersOwe)}`;
        splitClass = "positive";
      } else {
        splitText = "not split";
      }
    } else if (myShare > 0) {
      splitText = `you owe ${formatCurrency(myShare)}`;
      splitClass = "negative";
    } else {
      splitText = "not involved";
    }

    const card = document.createElement("div");
    card.className = "expense-card";
    card.innerHTML = `
      <div class="exp-card-icon" style="background:${meta.bg};">${meta.icon}</div>
      <div class="exp-card-info">
        <p class="exp-card-title">${expense.description || "Expense"}</p>
        <p class="exp-card-meta">${isPaidByMe ? "You" : paidByName} paid · ${expense.splitType === "equal" ? "Split equally" : expense.splitType === "percentage" ? "Split by %" : "Custom split"}</p>
      </div>
      <div class="exp-card-right">
        <p class="exp-card-amount">${formatCurrency(expense.amount || 0)}</p>
        <p class="exp-card-split ${splitClass}">${splitText}</p>
      </div>
    `;
    card.addEventListener("click", () => {
      window.location.href = `edit-expense.html?id=${expense.id}`;
    });
    timeline.appendChild(card);
  });
}

function renderBalances() {
  const summary = document.getElementById("balancesSummary");
  const balances = groupData.memberBalances || {};
  const maxAbs = Math.max(...Object.values(balances).map(v => Math.abs(v)), 1);

  summary.innerHTML = "";

  groupData.memberIds.forEach(uid => {
    const profile = memberProfiles[uid];
    const name = profile?.displayName || "Unknown";
    const balance = balances[uid] || 0;
    const isMe = uid === currentUser.uid;
    const balClass = balance > 0 ? "positive" : balance < 0 ? "negative" : "neutral";
    const barColor = balance > 0 ? "var(--c-accent)" : balance < 0 ? "var(--c-red)" : "var(--c-text-dim)";
    const barWidth = Math.min((Math.abs(balance) / maxAbs) * 100, 100);

    const row = document.createElement("div");
    row.className = "balance-member-row";
    row.innerHTML = `
      <div class="bmr-avatar" style="background:${getAvatarColor(name)};color:#fff;">${getInitial(name)}</div>
      <div class="bmr-info">
        <p class="bmr-name">${name}${isMe ? " (you)" : ""}</p>
      </div>
      <div class="bmr-bar-track">
        <div class="bmr-bar-fill" style="width:${barWidth}%; background:${barColor};"></div>
      </div>
      <p class="bmr-amount ${balClass}">${balance === 0 ? "₹0" : (balance > 0 ? "+" : "−") + formatCurrency(balance)}</p>
    `;
    summary.appendChild(row);
  });

  renderSuggestedSettlements(balances);
}

function simplifyDebts(balances) {
  const creditors = [];
  const debtors = [];

  Object.entries(balances).forEach(([uid, amount]) => {
    if (amount > 0.5) creditors.push({ uid, amount });
    else if (amount < -0.5) debtors.push({ uid, amount: -amount });
  });

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > 0.5) {
      transactions.push({ from: debtor.uid, to: creditor.uid, amount: Math.round(amount) });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount < 0.5) i++;
    if (creditor.amount < 0.5) j++;
  }

  return transactions;
}

function renderSuggestedSettlements(balances) {
  const container = document.getElementById("suggestedSettlements");
  const transactions = simplifyDebts(balances);

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <p class="empty-title">Everyone's settled up</p>
        <p class="empty-sub">No payments needed in this group right now.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  transactions.forEach(txn => {
    const fromName = memberProfiles[txn.from]?.displayName || "Someone";
    const toName = memberProfiles[txn.to]?.displayName || "Someone";
    const isFromMe = txn.from === currentUser.uid;
    const isToMe = txn.to === currentUser.uid;

    const row = document.createElement("div");
    row.className = "settlement-suggestion-row";
    row.innerHTML = `
      <div class="ssr-flow">
        <div class="ssr-avatar" style="background:${getAvatarColor(fromName)};color:#fff;">${getInitial(fromName)}</div>
        <p class="ssr-text"><strong>${isFromMe ? "You" : fromName}</strong> pays <strong>${isToMe ? "you" : toName}</strong></p>
        <div class="ssr-avatar" style="background:${getAvatarColor(toName)};color:#fff;">${getInitial(toName)}</div>
      </div>
      <p class="ssr-amount">${formatCurrency(txn.amount)}</p>
      ${(isFromMe || isToMe) ? `<button class="ssr-settle-btn" data-from="${txn.from}" data-to="${txn.to}" data-amount="${txn.amount}">Settle</button>` : ""}
    `;
    container.appendChild(row);
  });

  container.querySelectorAll(".ssr-settle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      window.location.href = `settlements.html?group=${groupId}&from=${btn.dataset.from}&to=${btn.dataset.to}&amount=${btn.dataset.amount}`;
    });
  });
}

function renderMembers() {
  const grid = document.getElementById("membersGrid");
  grid.innerHTML = "";

  groupData.memberIds.forEach(uid => {
    const profile = memberProfiles[uid];
    const name = profile?.displayName || "Unknown";
    const isMe = uid === currentUser.uid;
    const isCreator = uid === groupData.createdBy;

    const card = document.createElement("div");
    card.className = "member-card";
    card.innerHTML = `
      <div class="member-card-avatar" style="background:${getAvatarColor(name)};color:#fff;">
        ${profile?.photoURL ? `<img src="${profile.photoURL}" alt="${name}" />` : getInitial(name)}
      </div>
      <div class="member-card-info">
        <p class="member-card-name">${name}${isMe ? " (you)" : ""}</p>
        <p class="member-card-role">${isCreator ? "Group creator" : "Member"}</p>
      </div>
    `;
    grid.appendChild(card);
  });

  if (groupData.pendingInvites?.length) {
    groupData.pendingInvites.forEach(email => {
      const card = document.createElement("div");
      card.className = "member-card";
      card.style.opacity = "0.6";
      card.innerHTML = `
        <div class="member-card-avatar" style="background:var(--c-surface2);color:var(--c-text-muted);">${email.charAt(0).toUpperCase()}</div>
        <div class="member-card-info">
          <p class="member-card-name">${email}</p>
          <p class="member-card-role">Pending invite</p>
        </div>
      `;
      grid.appendChild(card);
    });
  }
}

const inviteModal = document.getElementById("inviteModal");
function openInviteModal() {
  if (!groupData) {
    showToast("Group is still loading. Please wait.", "info");
    return;
  }
  inviteModal.classList.remove("hidden");

  document.querySelectorAll(".invite-tab").forEach((t, i) => t.classList.toggle("active", i === 0));
  document.querySelectorAll(".invite-panel").forEach((p, i) => {
    p.classList.toggle("active", i === 0);
    p.style.display = i === 0 ? "block" : "none";
  });

  setupInviteLinkAndQr();
}
document.getElementById("inviteMemberBtn").addEventListener("click", openInviteModal);
document.getElementById("inviteCardBtn").addEventListener("click", openInviteModal);
document.getElementById("inviteModalClose").addEventListener("click", () => {
  inviteModal.classList.add("hidden");
  document.getElementById("inviteEmailInput").value = "";
  document.getElementById("err-invite-email").textContent = "";
});
inviteModal.addEventListener("click", (e) => { if (e.target === inviteModal) inviteModal.classList.add("hidden"); });

function generateInviteCode() {
  return Array.from({ length: 10 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
}

function getInviteLink() {
  const code = groupData.inviteCode;
  return `${window.location.origin}${window.location.pathname.replace("group-details.html", "join-group.html")}?code=${code}`;
}

async function setupInviteLinkAndQr() {
  if (!groupData) return;
  if (!groupData.inviteCode) {
    const code = generateInviteCode();
    try {
      await updateDoc(doc(db, "groups", groupId), { inviteCode: code });
      groupData.inviteCode = code;
    } catch (err) {
      console.error(err);
    }
  }
  document.getElementById("inviteLinkField").value = getInviteLink();
  document.getElementById("qrGroupName").textContent = groupData.name || "this group";
}

document.getElementById("copyLinkBtn").addEventListener("click", async () => {
  const field = document.getElementById("inviteLinkField");
  const btn = document.getElementById("copyLinkBtn");
  const label = document.getElementById("copyLabel");

  try {
    await navigator.clipboard.writeText(field.value);
  } catch {
    field.select();
    document.execCommand("copy");
  }

  btn.classList.add("copied");
  label.textContent = "Copied!";
  setTimeout(() => {
    btn.classList.remove("copied");
    label.textContent = "Copy";
  }, 1800);
});

document.getElementById("regenerateLinkBtn").addEventListener("click", async () => {
  const btn = document.getElementById("regenerateLinkBtn");
  btn.disabled = true;
  try {
    const newCode = generateInviteCode();
    await updateDoc(doc(db, "groups", groupId), { inviteCode: newCode });
    groupData.inviteCode = newCode;
    document.getElementById("inviteLinkField").value = getInviteLink();
    renderQrCode();
    showToast("New invite link generated.", "success");
  } catch (err) {
    console.error(err);
    showToast("Could not regenerate link.", "error");
  } finally {
    btn.disabled = false;
  }
});

function renderQrCode() {
  const canvas = document.getElementById("qrCanvas");
  if (typeof QRious === "undefined") {
    canvas.parentElement.innerHTML = "<p style='color:#555;font-size:0.8rem;padding:40px;'>QR library failed to load.</p>";
    return;
  }
  new QRious({
    element: canvas,
    value: getInviteLink(),
    size: 220,
    background: "#ffffff",
    foreground: "#09090F",
    level: "H"
  });
}

document.getElementById("downloadQrBtn").addEventListener("click", () => {
  const canvas = document.getElementById("qrCanvas");
  const link = document.createElement("a");
  link.download = `${(groupData.name || "campussplit-group").replace(/\s+/g, "-").toLowerCase()}-invite-qr.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
});

document.getElementById("sendInviteBtn").addEventListener("click", async () => {
  const email = document.getElementById("inviteEmailInput").value.trim().toLowerCase();
  const errEl = document.getElementById("err-invite-email");
  errEl.textContent = "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = "Enter a valid email address.";
    return;
  }
  if (groupData.pendingInvites?.includes(email)) {
    errEl.textContent = "Already invited.";
    return;
  }

  const btn = document.getElementById("sendInviteBtn");
  const text = btn.querySelector(".btn-text");
  const spinner = document.getElementById("inviteSpinner");
  text.style.opacity = "0.4";
  spinner.classList.remove("hidden");
  btn.disabled = true;

  try {
    const userQ = query(collection(db, "users"), where("email", "==", email));
    const userSnap = await getDocs(userQ);

    if (!userSnap.empty) {
      const uid = userSnap.docs[0].id;
      await updateDoc(doc(db, "groups", groupId), {
        memberIds: arrayUnion(uid),
        [`memberBalances.${uid}`]: 0
      });
      groupData.memberIds.push(uid);
      memberProfiles[uid] = userSnap.docs[0].data();
      showToast("Member added!", "success");
    } else {
      await updateDoc(doc(db, "groups", groupId), {
        pendingInvites: arrayUnion(email)
      });
      groupData.pendingInvites = [...(groupData.pendingInvites || []), email];
      showToast("Invite sent!", "success");
    }

    renderHero();
    renderMembers();
    renderBalances();
    inviteModal.classList.add("hidden");
    document.getElementById("inviteEmailInput").value = "";
  } catch (err) {
    console.error(err);
    showToast("Could not send invite. Try again.", "error");
  } finally {
    text.style.opacity = "1";
    spinner.classList.add("hidden");
    btn.disabled = false;
  }
});

const groupMenuModal = document.getElementById("groupMenuModal");
document.getElementById("groupMenuBtn").addEventListener("click", () => groupMenuModal.classList.remove("hidden"));
document.getElementById("groupMenuClose").addEventListener("click", () => groupMenuModal.classList.add("hidden"));
groupMenuModal.addEventListener("click", (e) => { if (e.target === groupMenuModal) groupMenuModal.classList.add("hidden"); });

document.getElementById("editGroupBtn").addEventListener("click", () => {
  groupMenuModal.classList.add("hidden");
  openEditGroupModal();
});

document.getElementById("editGroupHeroBtn").addEventListener("click", () => {
  openEditGroupModal();
});

document.getElementById("leaveGroupBtn").addEventListener("click", async () => {
  if (!confirm("Leave this group? You'll lose access to its expenses and balances.")) return;

  const myBalance = groupData.memberBalances?.[currentUser.uid] || 0;
  if (Math.abs(myBalance) > 0.5) {
    showToast("Settle your balance before leaving this group.", "error");
    groupMenuModal.classList.add("hidden");
    return;
  }

  try {
    await updateDoc(doc(db, "groups", groupId), {
      memberIds: arrayRemove(currentUser.uid)
    });
    showToast("You left the group.", "success");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 1000);
  } catch (err) {
    console.error(err);
    showToast("Could not leave group.", "error");
  }
});

document.getElementById("deleteGroupBtn").addEventListener("click", async () => {
  if (groupData.createdBy !== currentUser.uid) {
    showToast("Only the group creator can delete this group.", "error");
    return;
  }
  if (!confirm("Delete this group permanently? All expenses and history will be lost. This cannot be undone.")) return;

  try {
    await deleteDoc(doc(db, "groups", groupId));
    showToast("Group deleted.", "success");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 1000);
  } catch (err) {
    console.error(err);
    showToast("Could not delete group.", "error");
  }
});

let editSelectedEmoji = "👥";
let editSelectedCategory = "general";

function openEditGroupModal() {
  if (!groupData) {
    showToast("Group is still loading. Please wait.", "info");
    return;
  }
  const modal = document.getElementById("editGroupModal");
  modal.classList.remove("hidden");

  document.getElementById("editGroupName").value = groupData.name || "";
  document.getElementById("editGroupDesc").value = groupData.description || "";
  editSelectedEmoji = groupData.emoji || "👥";
  editSelectedCategory = groupData.category || "general";

  document.querySelectorAll("#egEmojiGrid .emoji-option").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.emoji === editSelectedEmoji);
  });

  document.querySelectorAll(".eg-cat-pill").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.cat === editSelectedCategory);
  });

  document.getElementById("err-edit-name").textContent = "";
}

document.getElementById("editGroupModalClose").addEventListener("click", () => {
  document.getElementById("editGroupModal").classList.add("hidden");
});

document.getElementById("cancelEditGroupBtn").addEventListener("click", () => {
  document.getElementById("editGroupModal").classList.add("hidden");
});

document.getElementById("editGroupModal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("editGroupModal")) {
    document.getElementById("editGroupModal").classList.add("hidden");
  }
});

document.querySelectorAll("#egEmojiGrid .emoji-option").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#egEmojiGrid .emoji-option").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    editSelectedEmoji = btn.dataset.emoji;
  });
});

document.querySelectorAll(".eg-cat-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".eg-cat-pill").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    editSelectedCategory = btn.dataset.cat;
  });
});

document.getElementById("saveEditGroupBtn").addEventListener("click", async () => {
  const name = document.getElementById("editGroupName").value.trim();
  const description = document.getElementById("editGroupDesc").value.trim();
  const errEl = document.getElementById("err-edit-name");
  errEl.textContent = "";

  if (!name) { errEl.textContent = "Group name is required."; return; }
  if (name.length < 2) { errEl.textContent = "Name is too short."; return; }

  const btn = document.getElementById("saveEditGroupBtn");
  const text = btn.querySelector(".btn-text");
  const spinner = document.getElementById("editGroupSpinner");
  text.style.opacity = "0.4";
  spinner.classList.remove("hidden");
  btn.disabled = true;

  try {
    await updateDoc(doc(db, "groups", groupId), {
      name,
      emoji: editSelectedEmoji,
      category: editSelectedCategory,
      description
    });

    groupData.name = name;
    groupData.emoji = editSelectedEmoji;
    groupData.category = editSelectedCategory;
    groupData.description = description;

    document.getElementById("gdName").textContent = name;
    document.getElementById("gdIcon").textContent = editSelectedEmoji;

    showToast("Group updated!", "success");
    document.getElementById("editGroupModal").classList.add("hidden");
  } catch (err) {
    console.error(err);
    showToast("Could not update group. Try again.", "error");
  } finally {
    text.style.opacity = "1";
    spinner.classList.add("hidden");
    btn.disabled = false;
  }
});

document.querySelectorAll(".invite-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".invite-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".invite-panel").forEach(p => {
      p.classList.remove("active");
      p.style.display = "none";
    });
    const key = tab.dataset.inviteTab;
    const panelId = `inviteTab${key.charAt(0).toUpperCase() + key.slice(1)}`;
    const target = document.getElementById(panelId);
    if (target) {
      target.classList.add("active");
      target.style.display = "block";
    }
    if (key === "qr") renderQrCode();
    if (key === "link") setupInviteLinkAndQr();
  });
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
      if (currentUserData.photoURL) {
        document.getElementById("sidebarAvatar").innerHTML = `<img src="${currentUserData.photoURL}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
      }
    }
  } catch (err) {
    console.error(err);
  }

  loadGroup();
});