import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, updateDoc, deleteDoc,
  collection, query, where, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "../config/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
const toastContainer = document.getElementById("toastContainer");

function showToast(msg, type = "info") {
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => { toast.style.animation = "toastOut 0.3s ease forwards"; setTimeout(() => toast.remove(), 300); }, 3500);
}

function timeAgo(date) {
  const s = Math.floor((new Date() - date) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const notifConfig = {
  expense_added: { icon: "💸", bg: "#FEF3C720", label: "Expense added" },
  settlement_done: { icon: "✅", bg: "#D1FAE520", label: "Settlement" },
  member_added: { icon: "👋", bg: "#EDE9FE20", label: "New member" },
  group_created: { icon: "🏘️", bg: "#DBEAFE20", label: "Group created" },
  default: { icon: "🔔", bg: "#F3F4F620", label: "Notification" }
};

document.getElementById("hamburgerBtn").addEventListener("click", () => { document.getElementById("sidebar").classList.add("open"); document.getElementById("sidebarOverlay").classList.add("open"); });
document.getElementById("sidebarOverlay").addEventListener("click", () => { document.getElementById("sidebar").classList.remove("open"); document.getElementById("sidebarOverlay").classList.remove("open"); });
document.getElementById("logoutBtn").addEventListener("click", async () => { try { await signOut(auth); window.location.href = "login.html"; } catch { showToast("Could not log out.", "error"); } });

document.getElementById("markAllReadBtn").addEventListener("click", async () => {
  if (!currentUser) return;
  try {
    const snap = await getDocs(query(collection(db, "notifications"), where("userId", "==", currentUser.uid), where("read", "==", false)));
    if (snap.empty) { showToast("All notifications already read.", "info"); return; }
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
    showToast("All marked as read.", "success");
    await loadNotifications(currentUser.uid);
  } catch (err) { console.error(err); showToast("Could not update notifications.", "error"); }
});

async function loadNotifications(uid) {
  const list = document.getElementById("notifList");
  const empty = document.getElementById("notifEmpty");

  try {
    const snap = await getDocs(query(collection(db, "notifications"), where("userId", "==", uid)));
    const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    notifs.sort((a, b) => {
      const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bt - at;
    });

    if (notifs.length === 0) { list.innerHTML = ""; empty.classList.remove("hidden"); return; }
    empty.classList.add("hidden"); list.innerHTML = "";

    for (const n of notifs) {
      const cfg = notifConfig[n.type] || notifConfig.default;
      const date = n.createdAt?.toDate ? n.createdAt.toDate() : new Date();
      const row = document.createElement("div");
      row.className = `notif-row ${!n.read ? "unread" : ""}`;

      const hasGroupLink = n.data?.groupId;
      const actionBtn = hasGroupLink
        ? `<button class="notif-action-btn" onclick="window.location.href='group-details.html?id=${n.data.groupId}'">View group</button>`
        : "";

      row.innerHTML = `
        <div class="notif-icon" style="background:${cfg.bg};">${cfg.icon}</div>
        <div class="notif-body">
          <p class="notif-message">${n.data?.message || cfg.label}</p>
          <p class="notif-time">${timeAgo(date)}</p>
        </div>
        <div class="notif-actions">
          ${actionBtn}
          ${!n.read ? `<div class="notif-unread-dot"></div>` : ""}
          <button class="notif-delete-btn" data-id="${n.id}" title="Delete">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
        </div>
      `;

      if (!n.read) {
        row.addEventListener("click", async (e) => {
          if (e.target.closest(".notif-delete-btn") || e.target.closest(".notif-action-btn")) return;
          try {
            await updateDoc(doc(db, "notifications", n.id), { read: true });
            row.classList.remove("unread");
            row.querySelector(".notif-unread-dot")?.remove();
          } catch {}
        });
      }

      list.appendChild(row);
    }

    list.querySelectorAll(".notif-delete-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        try {
          await deleteDoc(doc(db, "notifications", id));
          btn.closest(".notif-row").remove();
          if (list.children.length === 0) empty.classList.remove("hidden");
          showToast("Notification deleted.", "success");
        } catch { showToast("Could not delete.", "error"); }
      });
    });
  } catch (err) { console.error(err); list.innerHTML = ""; empty.classList.remove("hidden"); }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  currentUser = user;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const d = snap.data();
      document.getElementById("sidebarName").textContent = d.displayName || "User";
      document.getElementById("sidebarEmail").textContent = d.email || "";
      if (d.photoURL) document.getElementById("sidebarAvatar").innerHTML = `<img src="${d.photoURL}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    }
  } catch (err) { console.error(err); }
  await loadNotifications(user.uid);
});