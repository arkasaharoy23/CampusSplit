import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
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

const urlParams = new URLSearchParams(window.location.search);
const preselectedGroupId = urlParams.get("group");

let currentUser = null;
let currentUserData = null;
let userGroups = [];
let activeGroup = null;
let groupMemberProfiles = {};
let selectedCategory = "food";
let splitType = "equal";
let exchangeRates = null;
let baseCurrencyForRates = "INR";
let conversionCache = {};

const avatarColors = ["#6C63FF", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4"];
const currencySymbols = { INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", AUD: "$", CAD: "$", SGD: "$", AED: "د.إ" };

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

document.getElementById("cancelExpenseBtn").addEventListener("click", () => {
  window.history.back();
});

async function fetchExchangeRates(base) {
  if (exchangeRates && baseCurrencyForRates === base) return exchangeRates;
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    const data = await res.json();
    if (data.result === "success") {
      exchangeRates = data.rates;
      baseCurrencyForRates = base;
      return exchangeRates;
    }
    throw new Error("Rate fetch failed");
  } catch (err) {
    console.error("Currency API error:", err);
    return null;
  }
}

async function convertCurrency(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;

  const cacheKey = `${fromCurrency}_${toCurrency}`;
  if (conversionCache[cacheKey]) {
    return amount * conversionCache[cacheKey];
  }

  const rates = await fetchExchangeRates(fromCurrency);
  if (!rates || !rates[toCurrency]) return amount;

  const rate = rates[toCurrency];
  conversionCache[cacheKey] = rate;
  return amount * rate;
}

async function loadUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
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
}

async function loadUserGroups(uid) {
  const select = document.getElementById("groupSelect");
  try {
    const q = query(collection(db, "groups"), where("memberIds", "array-contains", uid));
    const snap = await getDocs(q);

    if (snap.empty) {
      select.innerHTML = `<option value="">No groups yet</option>`;
      showToast("Create a group first before adding an expense.", "info");
      return;
    }

    userGroups = [];
    snap.forEach(docSnap => userGroups.push({ id: docSnap.id, ...docSnap.data() }));

    select.innerHTML = `<option value="">Select a group</option>` +
      userGroups.map(g => `<option value="${g.id}">${g.emoji || "👥"} ${g.name}</option>`).join("");

    if (preselectedGroupId && userGroups.some(g => g.id === preselectedGroupId)) {
      select.value = preselectedGroupId;
      await onGroupChange(preselectedGroupId);
    } else if (userGroups.length === 1) {
      select.value = userGroups[0].id;
      await onGroupChange(userGroups[0].id);
    }
  } catch (err) {
    console.error(err);
    select.innerHTML = `<option value="">Failed to load groups</option>`;
    showToast("Could not load your groups.", "error");
  }
}

document.getElementById("groupSelect").addEventListener("change", (e) => {
  document.getElementById("fg-group").classList.remove("error");
  document.getElementById("err-group").textContent = "";
  onGroupChange(e.target.value);
});

async function onGroupChange(groupId) {
  if (!groupId) {
    activeGroup = null;
    document.getElementById("splitMembersList").innerHTML = "";
    document.getElementById("paidBySelect").innerHTML = `<option value="">Select group first</option>`;
    return;
  }

  activeGroup = userGroups.find(g => g.id === groupId);
  if (!activeGroup) return;

  groupMemberProfiles = {};
  await Promise.all(activeGroup.memberIds.map(async (uid) => {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) groupMemberProfiles[uid] = snap.data();
    } catch (err) { console.error(err); }
  }));

  const paidBySelect = document.getElementById("paidBySelect");
  paidBySelect.innerHTML = activeGroup.memberIds.map(uid => {
    const name = groupMemberProfiles[uid]?.displayName || "Unknown";
    const isMe = uid === currentUser.uid;
    return `<option value="${uid}" ${isMe ? "selected" : ""}>${name}${isMe ? " (you)" : ""}</option>`;
  }).join("");

  renderSplitMembers();
}

document.querySelectorAll(".cat-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".cat-pill").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedCategory = btn.dataset.cat;
  });
});

document.querySelectorAll(".split-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".split-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    splitType = btn.dataset.split;
    renderSplitMembers();
  });
});

const currencySelect = document.getElementById("currencySelect");
const currencySymbolEl = document.getElementById("currencySymbol");
currencySelect.addEventListener("change", () => {
  currencySymbolEl.textContent = currencySymbols[currencySelect.value] || currencySelect.value;
  updateConversionPreview();
});

document.getElementById("expenseAmount").addEventListener("input", () => {
  document.getElementById("fg-amount").classList.remove("error");
  document.getElementById("err-amount").textContent = "";
  updateConversionPreview();
  if (splitType === "equal") renderSplitMembers();
});

let conversionDebounce = null;
async function updateConversionPreview() {
  const amount = parseFloat(document.getElementById("expenseAmount").value);
  const currency = currencySelect.value;
  const note = document.getElementById("conversionNote");
  const text = document.getElementById("conversionText");

  if (!amount || currency === "INR") {
    note.classList.add("hidden");
    return;
  }

  note.classList.remove("hidden");
  text.textContent = "Converting…";

  clearTimeout(conversionDebounce);
  conversionDebounce = setTimeout(async () => {
    const converted = await convertCurrency(amount, currency, "INR");
    if (converted) {
      text.textContent = `≈ ₹${converted.toLocaleString("en-IN", { maximumFractionDigits: 2 })} at today's rate`;
    } else {
      note.classList.add("hidden");
    }
  }, 500);
}

function renderSplitMembers() {
  const container = document.getElementById("splitMembersList");
  const hint = document.getElementById("splitHint");

  if (!activeGroup) {
    container.innerHTML = "";
    return;
  }

  const amount = parseFloat(document.getElementById("expenseAmount").value) || 0;

  const hints = {
    equal: "Split equally among all selected members",
    percentage: "Set a percentage share for each member",
    exact: "Enter the exact amount each member owes",
    shares: "Assign relative shares (e.g. 2 shares = double of 1 share)"
  };
  hint.textContent = hints[splitType];

  const existingChecked = {};
  container.querySelectorAll(".split-checkbox").forEach(cb => {
    existingChecked[cb.dataset.uid] = cb.checked;
  });

  container.innerHTML = "";

  activeGroup.memberIds.forEach(uid => {
    const profile = groupMemberProfiles[uid];
    const name = profile?.displayName || "Unknown";
    const isMe = uid === currentUser.uid;
    const isChecked = uid in existingChecked ? existingChecked[uid] : true;

    const row = document.createElement("div");
    row.className = "split-member-row";

    let valueInputHtml = "";
    if (splitType === "equal") {
      valueInputHtml = `<p class="split-equal-amount" id="equal-${uid}">₹0</p>`;
    } else if (splitType === "percentage") {
      valueInputHtml = `
        <div class="split-value-input-wrap">
          <input type="number" class="split-value-input" data-uid="${uid}" min="0" max="100" placeholder="0" value="${(100 / activeGroup.memberIds.length).toFixed(0)}" />
          <span class="split-value-suffix">%</span>
        </div>
      `;
    } else if (splitType === "exact") {
      valueInputHtml = `
        <div class="split-value-input-wrap">
          <input type="number" class="split-value-input" data-uid="${uid}" min="0" step="0.01" placeholder="0" />
          <span class="split-value-suffix">₹</span>
        </div>
      `;
    } else if (splitType === "shares") {
      valueInputHtml = `
        <div class="split-value-input-wrap">
          <input type="number" class="split-value-input" data-uid="${uid}" min="0" step="1" placeholder="1" value="1" />
          <span class="split-value-suffix">x</span>
        </div>
      `;
    }

    row.innerHTML = `
      <div class="split-member-checkbox-wrap">
        <input type="checkbox" class="split-checkbox" data-uid="${uid}" ${isChecked ? "checked" : ""} />
        <div class="split-member-avatar" style="background:${getAvatarColor(name)};">${getInitial(name)}</div>
        <p class="split-member-name">${name}${isMe ? " (you)" : ""}</p>
      </div>
      ${valueInputHtml}
    `;
    container.appendChild(row);
  });

  container.querySelectorAll(".split-checkbox").forEach(cb => {
    cb.addEventListener("change", () => {
      const input = container.querySelector(`.split-value-input[data-uid="${cb.dataset.uid}"]`);
      if (input) input.disabled = !cb.checked;
      computeSplitTotals();
    });
  });

  container.querySelectorAll(".split-value-input").forEach(input => {
    input.addEventListener("input", computeSplitTotals);
  });

  container.querySelectorAll(".split-checkbox").forEach(cb => {
    const input = container.querySelector(`.split-value-input[data-uid="${cb.dataset.uid}"]`);
    if (input) input.disabled = !cb.checked;
  });

  computeSplitTotals();
}

function getCheckedMemberIds() {
  return Array.from(document.querySelectorAll(".split-checkbox:checked")).map(cb => cb.dataset.uid);
}

function computeSplitTotals() {
  const amount = parseFloat(document.getElementById("expenseAmount").value) || 0;
  const checkedIds = getCheckedMemberIds();
  const totalRow = document.getElementById("splitTotalRow");

  if (splitType === "equal") {
    const perPerson = checkedIds.length > 0 ? amount / checkedIds.length : 0;
    checkedIds.forEach(uid => {
      const el = document.getElementById(`equal-${uid}`);
      if (el) el.textContent = "₹" + perPerson.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    });
    activeGroup.memberIds.forEach(uid => {
      if (!checkedIds.includes(uid)) {
        const el = document.getElementById(`equal-${uid}`);
        if (el) el.textContent = "₹0";
      }
    });
    totalRow.innerHTML = `
      <span class="split-total-label">${checkedIds.length} member${checkedIds.length !== 1 ? "s" : ""} selected</span>
      <span class="split-total-value balanced">₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
    `;
    return;
  }

  if (splitType === "percentage") {
    let totalPct = 0;
    checkedIds.forEach(uid => {
      const input = document.querySelector(`.split-value-input[data-uid="${uid}"]`);
      totalPct += parseFloat(input?.value) || 0;
    });
    const isBalanced = Math.abs(totalPct - 100) < 0.5;
    totalRow.innerHTML = `
      <span class="split-total-label">Total percentage</span>
      <span class="split-total-value ${isBalanced ? "balanced" : "unbalanced"}">${totalPct.toFixed(0)}% ${isBalanced ? "✓" : "(should be 100%)"}</span>
    `;
    return;
  }

  if (splitType === "exact") {
    let totalExact = 0;
    checkedIds.forEach(uid => {
      const input = document.querySelector(`.split-value-input[data-uid="${uid}"]`);
      totalExact += parseFloat(input?.value) || 0;
    });
    const isBalanced = Math.abs(totalExact - amount) < 0.5;
    totalRow.innerHTML = `
      <span class="split-total-label">Total entered</span>
      <span class="split-total-value ${isBalanced ? "balanced" : "unbalanced"}">₹${totalExact.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${isBalanced ? "✓" : `(expense is ₹${amount.toLocaleString("en-IN")})`}</span>
    `;
    return;
  }

  if (splitType === "shares") {
    let totalShares = 0;
    checkedIds.forEach(uid => {
      const input = document.querySelector(`.split-value-input[data-uid="${uid}"]`);
      totalShares += parseFloat(input?.value) || 0;
    });
    totalRow.innerHTML = `
      <span class="split-total-label">Total shares</span>
      <span class="split-total-value balanced">${totalShares} share${totalShares !== 1 ? "s" : ""}</span>
    `;
  }
}

function calculateSplits(amountInINR) {
  const checkedIds = getCheckedMemberIds();
  const splits = {};

  activeGroup.memberIds.forEach(uid => { splits[uid] = 0; });

  if (splitType === "equal") {
    const perPerson = amountInINR / checkedIds.length;
    checkedIds.forEach(uid => { splits[uid] = Math.round(perPerson * 100) / 100; });
  } else if (splitType === "percentage") {
    checkedIds.forEach(uid => {
      const input = document.querySelector(`.split-value-input[data-uid="${uid}"]`);
      const pct = parseFloat(input?.value) || 0;
      splits[uid] = Math.round((amountInINR * pct / 100) * 100) / 100;
    });
  } else if (splitType === "exact") {
    checkedIds.forEach(uid => {
      const input = document.querySelector(`.split-value-input[data-uid="${uid}"]`);
      splits[uid] = parseFloat(input?.value) || 0;
    });
  } else if (splitType === "shares") {
    let totalShares = 0;
    const shareMap = {};
    checkedIds.forEach(uid => {
      const input = document.querySelector(`.split-value-input[data-uid="${uid}"]`);
      const shares = parseFloat(input?.value) || 0;
      shareMap[uid] = shares;
      totalShares += shares;
    });
    checkedIds.forEach(uid => {
      splits[uid] = totalShares > 0 ? Math.round((amountInINR * shareMap[uid] / totalShares) * 100) / 100 : 0;
    });
  }

  return splits;
}

document.getElementById("saveExpenseBtn").addEventListener("click", async () => {
  const groupId = document.getElementById("groupSelect").value;
  const description = document.getElementById("expenseDescription").value.trim();
  const rawAmount = parseFloat(document.getElementById("expenseAmount").value);
  const currency = currencySelect.value;
  const paidBy = document.getElementById("paidBySelect").value;

  document.querySelectorAll(".form-group.error").forEach(el => el.classList.remove("error"));
  document.querySelectorAll(".field-error").forEach(el => el.textContent = "");

  let valid = true;
  if (!groupId) {
    document.getElementById("fg-group").classList.add("error");
    document.getElementById("err-group").textContent = "Select a group.";
    valid = false;
  }
  if (!description) {
    document.getElementById("fg-description").classList.add("error");
    document.getElementById("err-description").textContent = "Add a short description.";
    valid = false;
  }
  if (!rawAmount || rawAmount <= 0) {
    document.getElementById("fg-amount").classList.add("error");
    document.getElementById("err-amount").textContent = "Enter a valid amount.";
    valid = false;
  }

  const checkedIds = getCheckedMemberIds();
  if (checkedIds.length === 0) {
    showToast("Select at least one member to split with.", "error");
    valid = false;
  }

  if (splitType === "percentage") {
    let totalPct = 0;
    checkedIds.forEach(uid => {
      const input = document.querySelector(`.split-value-input[data-uid="${uid}"]`);
      totalPct += parseFloat(input?.value) || 0;
    });
    if (Math.abs(totalPct - 100) > 0.5) {
      showToast("Percentages must add up to 100%.", "error");
      valid = false;
    }
  }

  if (splitType === "exact") {
    let totalExact = 0;
    checkedIds.forEach(uid => {
      const input = document.querySelector(`.split-value-input[data-uid="${uid}"]`);
      totalExact += parseFloat(input?.value) || 0;
    });
    if (Math.abs(totalExact - rawAmount) > 0.5) {
      showToast("Exact amounts must add up to the total expense.", "error");
      valid = false;
    }
  }

  if (!valid) return;

  const btn = document.getElementById("saveExpenseBtn");
  const text = btn.querySelector(".btn-text");
  const spinner = document.getElementById("saveExpenseSpinner");
  text.style.opacity = "0.4";
  spinner.classList.remove("hidden");
  btn.disabled = true;

  try {
    let amountInINR = rawAmount;
    if (currency !== "INR") {
      const converted = await convertCurrency(rawAmount, currency, "INR");
      amountInINR = Math.round(converted * 100) / 100;
    }

    const splits = calculateSplits(amountInINR);
    const paidByName = groupMemberProfiles[paidBy]?.displayName || "Unknown";

    const expenseRef = doc(collection(db, "expenses"));
    const expenseData = {
      groupId,
      groupName: activeGroup.name,
      description,
      amount: amountInINR,
      originalAmount: rawAmount,
      originalCurrency: currency,
      exchangeRateUsed: currency !== "INR" ? (amountInINR / rawAmount) : 1,
      category: selectedCategory,
      paidBy,
      paidByName,
      splitType,
      splits,
      memberIds: activeGroup.memberIds,
      createdBy: currentUser.uid,
      createdAt: serverTimestamp()
    };

    await setDoc(expenseRef, expenseData);

    const newBalances = { ...(activeGroup.memberBalances || {}) };
    activeGroup.memberIds.forEach(uid => {
      if (!(uid in newBalances)) newBalances[uid] = 0;
    });

    Object.entries(splits).forEach(([uid, share]) => {
      if (uid === paidBy) {
        newBalances[uid] = (newBalances[uid] || 0) + (amountInINR - share);
      } else {
        newBalances[uid] = (newBalances[uid] || 0) - share;
      }
    });

    await updateDoc(doc(db, "groups", groupId), {
      memberBalances: newBalances,
      totalExpenses: (activeGroup.totalExpenses || 0) + amountInINR,
      updatedAt: serverTimestamp()
    });

    showToast("Expense added! 🎉", "success");
    setTimeout(() => { window.location.href = `group-details.html?id=${groupId}`; }, 1200);
  } catch (err) {
    console.error(err);
    showToast("Could not save expense. Try again.", "error");
    text.style.opacity = "1";
    spinner.classList.add("hidden");
    btn.disabled = false;
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  await loadUserProfile(user.uid);
  await loadUserGroups(user.uid);
});