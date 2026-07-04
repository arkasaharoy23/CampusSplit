import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs,
  collection, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "../config/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let categoryChartInstance = null;
let trendChartInstance = null;

const categoryMeta = {
  food: { icon: "🍽️", bg: "#F59E0B" },
  travel: { icon: "✈️", bg: "#3B82F6" },
  rent: { icon: "🏠", bg: "#10B981" },
  fuel: { icon: "⛽", bg: "#EF4444" },
  shopping: { icon: "🛍️", bg: "#EC4899" },
  entertainment: { icon: "🎬", bg: "#8B5CF6" },
  other: { icon: "💰", bg: "#6B7280" }
};

function formatCurrency(a) { return "₹" + Math.abs(a).toLocaleString("en-IN", { maximumFractionDigits: 0 }); }

function showToast(message, type = "info") {
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  const tc = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
  tc.appendChild(toast);
  setTimeout(() => { toast.style.animation = "toastOut 0.3s ease forwards"; setTimeout(() => toast.remove(), 300); }, 3500);
}

document.getElementById("hamburgerBtn").addEventListener("click", () => { document.getElementById("sidebar").classList.add("open"); document.getElementById("sidebarOverlay").classList.add("open"); });
document.getElementById("sidebarOverlay").addEventListener("click", () => { document.getElementById("sidebar").classList.remove("open"); document.getElementById("sidebarOverlay").classList.remove("open"); });
document.getElementById("logoutBtn").addEventListener("click", async () => { try { await signOut(auth); window.location.href = "login.html"; } catch { showToast("Could not log out.", "error"); } });

async function loadAnalytics(uid) {
  const [expSnap, groupSnap] = await Promise.all([
    getDocs(query(collection(db, "expenses"), where("memberIds", "array-contains", uid))),
    getDocs(query(collection(db, "groups"), where("memberIds", "array-contains", uid)))
  ]);

  const expenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const groups = groupSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  let totalSpent = 0, totalPaid = 0;
  const categoryBreakdown = {};
  const monthlyTrend = {};

  expenses.forEach(e => {
    const myShare = e.splits?.[uid] || 0;
    totalSpent += myShare;
    if (e.paidBy === uid) totalPaid += (e.amount || 0);

    const cat = e.category || "other";
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + myShare;

    const date = e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthlyTrend[key] = (monthlyTrend[key] || 0) + myShare;
  });

  document.getElementById("anTotalSpent").textContent = formatCurrency(totalSpent);
  document.getElementById("anTotalPaid").textContent = formatCurrency(totalPaid);
  document.getElementById("anExpCount").textContent = expenses.length;
  document.getElementById("anGroupCount").textContent = groups.length;

  renderCategoryChart(categoryBreakdown);
  renderTrendChart(monthlyTrend);
  renderCategoryList(categoryBreakdown);
  renderGroupBalances(groups, uid);
}

function renderCategoryChart(data) {
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => Math.round(v));
  const colors = labels.map(k => categoryMeta[k]?.bg || "#6B7280");

  if (categoryChartInstance) categoryChartInstance.destroy();

  const ctx = document.getElementById("categoryChart").getContext("2d");
  categoryChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: "#111120" }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ₹${ctx.raw.toLocaleString("en-IN")}`
          }
        }
      },
      cutout: "65%"
    }
  });

  const legend = document.getElementById("categoryLegend");
  legend.innerHTML = "";
  labels.forEach((k, i) => {
    const item = document.createElement("div");
    item.className = "an-legend-item";
    item.innerHTML = `<div class="an-legend-dot" style="background:${colors[i]};"></div><span>${k} — ₹${values[i].toLocaleString("en-IN")}</span>`;
    legend.appendChild(item);
  });
}

function renderTrendChart(data) {
  const sorted = Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).slice(-6);
  const labels = sorted.map(([k]) => {
    const [y, m] = k.split("-");
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  });
  const values = sorted.map(([, v]) => Math.round(v));

  if (trendChartInstance) trendChartInstance.destroy();

  const ctx = document.getElementById("trendChart").getContext("2d");
  trendChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Your share (₹)",
        data: values,
        backgroundColor: "rgba(108,99,255,0.7)",
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#888BA0", font: { size: 11 } } },
        y: {
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { color: "#888BA0", font: { size: 11 }, callback: v => "₹" + v.toLocaleString("en-IN") }
        }
      }
    }
  });
}

function renderCategoryList(data) {
  const list = document.getElementById("categoryList");
  list.innerHTML = "";
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;
  sorted.forEach(([cat, amount]) => {
    const meta = categoryMeta[cat] || categoryMeta.other;
    const pct = Math.round((amount / max) * 100);
    const row = document.createElement("div");
    row.className = "an-cat-row";
    row.innerHTML = `
      <div class="an-cat-icon" style="background:${meta.bg}22;">${meta.icon}</div>
      <div class="an-cat-info">
        <p class="an-cat-name">${cat}</p>
        <div class="an-cat-bar-track"><div class="an-cat-bar-fill" style="width:${pct}%;background:${meta.bg};"></div></div>
      </div>
      <p class="an-cat-amount">${formatCurrency(amount)}</p>
    `;
    list.appendChild(row);
  });
  if (sorted.length === 0) list.innerHTML = `<p style="font-size:0.84rem;color:var(--c-text-dim);">No expenses yet.</p>`;
}

function renderGroupBalances(groups, uid) {
  const list = document.getElementById("groupBalanceList");
  list.innerHTML = "";
  if (groups.length === 0) { list.innerHTML = `<p style="font-size:0.84rem;color:var(--c-text-dim);">No groups yet.</p>`; return; }
  groups.forEach(g => {
    const balance = g.memberBalances?.[uid] || 0;
    const cls = balance > 0 ? "positive" : balance < 0 ? "negative" : "neutral";
    const row = document.createElement("div");
    row.className = "an-group-row";
    row.innerHTML = `
      <span style="font-size:1.2rem;">${g.emoji || "👥"}</span>
      <p class="an-group-name">${g.name}</p>
      <p class="an-group-balance ${cls}">${balance === 0 ? "Settled" : (balance > 0 ? "+" : "−") + formatCurrency(balance)}</p>
    `;
    list.appendChild(row);
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const d = snap.data();
      document.getElementById("sidebarName").textContent = d.displayName || "User";
      document.getElementById("sidebarEmail").textContent = d.email || "";
      if (d.photoURL) document.getElementById("sidebarAvatar").innerHTML = `<img src="${d.photoURL}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    }
  } catch (err) { console.error(err); }
  await loadAnalytics(user.uid);
});