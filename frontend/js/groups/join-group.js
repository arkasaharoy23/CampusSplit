import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "../config/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const params = new URLSearchParams(window.location.search);
const code = params.get("code");
const joinCard = document.getElementById("joinCard");

function renderState(html) {
  joinCard.innerHTML = html;
}

function renderError(message) {
  renderState(`
    <div class="join-icon">⚠️</div>
    <h2>Invite link invalid</h2>
    <p>${message}</p>
    <a href="dashboard.html" class="btn-primary" style="display:inline-flex;">Go to dashboard</a>
  `);
}

async function findGroupByCode(inviteCode) {
  const q = query(collection(db, "groups"), where("inviteCode", "==", inviteCode));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
}

async function handleJoin(user) {
  if (!code) {
    renderError("This invite link is missing a code.");
    return;
  }

  let group;
  try {
    group = await findGroupByCode(code);
  } catch (err) {
    console.error(err);
    renderError("Something went wrong while checking this link.");
    return;
  }

  if (!group) {
    renderError("This invite link has expired or is no longer valid.");
    return;
  }

  if (group.memberIds?.includes(user.uid)) {
    renderState(`
      <div class="join-icon">✅</div>
      <h2>You're already in</h2>
      <p>You're already a member of "${group.name}".</p>
      <a href="group-details.html?id=${group.id}" class="btn-primary" style="display:inline-flex;">Open group</a>
    `);
    return;
  }

  renderState(`
    <div class="join-icon">${group.emoji || "👥"}</div>
    <h2>${group.name}</h2>
    <p>You've been invited to join this group. ${(group.memberIds || []).length} member${(group.memberIds || []).length !== 1 ? "s" : ""} already split expenses here.</p>
    <button class="btn-primary" id="confirmJoinBtn" style="width:100%; justify-content:center; display:flex;">Join group</button>
  `);

  document.getElementById("confirmJoinBtn").addEventListener("click", async () => {
    const btn = document.getElementById("confirmJoinBtn");
    btn.disabled = true;
    btn.textContent = "Joining…";

    try {
      await updateDoc(doc(db, "groups", group.id), {
        memberIds: arrayUnion(user.uid),
        [`memberBalances.${user.uid}`]: 0
      });
      window.location.href = `group-details.html?id=${group.id}`;
    } catch (err) {
      console.error(err);
      renderError("Could not join the group. Try again.");
    }
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }
  handleJoin(user);
});