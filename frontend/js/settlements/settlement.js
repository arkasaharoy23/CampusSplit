import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, addDoc,
  updateDoc, collection, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "../config/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const urlParams = new URLSearchParams(window.location.search);
const preGroup = urlParams.get("group");
const preFrom = urlParams.get("from");
const preTo = urlParams.get("to");
const preAmount = urlParams.get("amount");

let currentUser = null;
let memberCache = {};
let pendingSettlements = [];
let activeSettleData = null;

const toastContainer = document.getElementById("toastContainer");
const avatarColors = ["#6C63FF","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4"];

function getAvatarColor(s) { let h=0; for(let i=0;i<s.length;i++) h=s.charCodeAt(i)+((h<<5)-h); return avatarColors[Math.abs(h)%avatarColors.length]; }
function getInitial(n) { return (n||"?").trim().charAt(0).toUpperCase(); }
function formatCurrency(a) { return "₹"+Math.abs(a).toLocaleString("en-IN",{maximumFractionDigits:0}); }
function timeAgo(date) {
  const s = Math.floor((new Date()-date)/1000);
  if(s<60) return "just now";
  const m=Math.floor(s/60); if(m<60) return `${m}m ago`;
  const h=Math.floor(m/60); if(h<24) return `${h}h ago`;
  const d=Math.floor(h/24); if(d<7) return `${d}d ago`;
  return date.toLocaleDateString("en-IN",{day:"numeric",month:"short"});
}

function showToast(message, type="info") {
  const icons={success:"✅",error:"❌",info:"ℹ️"};
  const toast=document.createElement("div"); toast.className=`toast ${type}`;
  toast.innerHTML=`<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(()=>{toast.style.animation="toastOut 0.3s ease forwards";setTimeout(()=>toast.remove(),300);},3500);
}

document.getElementById("hamburgerBtn").addEventListener("click",()=>{document.getElementById("sidebar").classList.add("open");document.getElementById("sidebarOverlay").classList.add("open");});
document.getElementById("sidebarOverlay").addEventListener("click",()=>{document.getElementById("sidebar").classList.remove("open");document.getElementById("sidebarOverlay").classList.remove("open");});
document.getElementById("logoutBtn").addEventListener("click",async()=>{try{await signOut(auth);window.location.href="login.html";}catch{showToast("Could not log out.","error");}});

document.querySelectorAll(".st-tab").forEach(tab=>{
  tab.addEventListener("click",()=>{
    document.querySelectorAll(".st-tab").forEach(t=>t.classList.remove("active")); tab.classList.add("active");
    document.querySelectorAll(".st-panel").forEach(p=>{p.classList.remove("active");p.style.display="none";});
    const panel=document.getElementById(`stPanel${tab.dataset.tab.charAt(0).toUpperCase()+tab.dataset.tab.slice(1)}`);
    panel.classList.add("active"); panel.style.display="block";
  });
});

async function getMemberName(uid) {
  if(memberCache[uid]) return memberCache[uid];
  try { const s=await getDoc(doc(db,"users",uid)); if(s.exists()){memberCache[uid]=s.data().displayName||"Unknown";return memberCache[uid];} } catch{}
  return "Unknown";
}

async function loadAll(uid) {
  const groupsSnap = await getDocs(query(collection(db,"groups"),where("memberIds","array-contains",uid)));
  let totalOwed=0, totalOwes=0;
  pendingSettlements=[];

  groupsSnap.forEach(docSnap=>{
    const g={id:docSnap.id,...docSnap.data()};
    const balances=g.memberBalances||{};
    const creditors=[],debtors=[];
    Object.entries(balances).forEach(([id,amount])=>{
      if(amount>0.5) creditors.push({uid:id,amount});
      else if(amount<-0.5) debtors.push({uid:id,amount:-amount});
    });
    creditors.sort((a,b)=>b.amount-a.amount); debtors.sort((a,b)=>b.amount-a.amount);
    let i=0,j=0;
    while(i<debtors.length&&j<creditors.length){
      const debtor=debtors[i],creditor=creditors[j];
      const amount=Math.min(debtor.amount,creditor.amount);
      if(amount>0.5 && (debtor.uid===uid||creditor.uid===uid)){
        pendingSettlements.push({groupId:g.id,groupName:g.name,from:debtor.uid,to:creditor.uid,amount:Math.round(amount)});
        if(debtor.uid===uid) totalOwes+=amount;
        if(creditor.uid===uid) totalOwed+=amount;
      }
      debtor.amount-=amount; creditor.amount-=amount;
      if(debtor.amount<0.5)i++; if(creditor.amount<0.5)j++;
    }
  });

  document.getElementById("totalOwed").textContent=formatCurrency(totalOwed);
  document.getElementById("totalOwes").textContent=formatCurrency(totalOwes);
  await renderPending(uid);
  await loadHistory(uid);

  if(preGroup&&preFrom&&preTo&&preAmount){
    const match=pendingSettlements.find(s=>s.groupId===preGroup&&s.from===preFrom&&s.to===preTo);
    if(match) openSettleModal(match);
  }
}

async function renderPending(uid) {
  const list=document.getElementById("pendingList"); const empty=document.getElementById("pendingEmpty");
  if(pendingSettlements.length===0){list.innerHTML="";empty.classList.remove("hidden");return;}
  empty.classList.add("hidden"); list.innerHTML="";
  for(const s of pendingSettlements){
    const fromName=await getMemberName(s.from); const toName=await getMemberName(s.to);
    const isFromMe=s.from===uid; const isToMe=s.to===uid;
    const row=document.createElement("div");
    row.className=`st-row ${isFromMe?"st-row--owe":isToMe?"st-row--owed":""}`;
    row.innerHTML=`
      <div class="st-avatars">
        <div class="st-avatar" style="background:${getAvatarColor(fromName)};">${getInitial(fromName)}</div>
        <div class="st-avatar" style="background:${getAvatarColor(toName)};">${getInitial(toName)}</div>
      </div>
      <div class="st-info">
        <p class="st-info-main"><strong>${isFromMe?"You":fromName}</strong> → <strong>${isToMe?"you":toName}</strong></p>
        <p class="st-info-sub">${s.groupName}</p>
      </div>
      <p class="st-amount ${isToMe?"positive":"negative"}">${formatCurrency(s.amount)}</p>
      ${(isFromMe||isToMe)?`<button class="btn-settle" data-idx="${pendingSettlements.indexOf(s)}">Settle</button>`:""}
    `;
    list.appendChild(row);
  }
  list.querySelectorAll(".btn-settle").forEach(btn=>{
    btn.addEventListener("click",()=>openSettleModal(pendingSettlements[parseInt(btn.dataset.idx)]));
  });
}

async function loadHistory(uid) {
  const list=document.getElementById("historyList"); const empty=document.getElementById("historyEmpty");
  try {
    const [sentSnap,recSnap]=await Promise.all([
      getDocs(query(collection(db,"settlements"),where("from","==",uid))),
      getDocs(query(collection(db,"settlements"),where("to","==",uid)))
    ]);
    const all=[];
    sentSnap.forEach(d=>all.push({id:d.id,...d.data(),direction:"sent"}));
    recSnap.forEach(d=>all.push({id:d.id,...d.data(),direction:"received"}));
    all.sort((a,b)=>{const at=a.settledAt?.toMillis?a.settledAt.toMillis():0,bt=b.settledAt?.toMillis?b.settledAt.toMillis():0;return bt-at;});
    if(all.length===0){list.innerHTML="";empty.classList.remove("hidden");return;}
    empty.classList.add("hidden"); list.innerHTML="";
    for(const s of all){
      const fromName=await getMemberName(s.from); const toName=await getMemberName(s.to);
      const isSent=s.direction==="sent";
      const date=s.settledAt?.toDate?s.settledAt.toDate():new Date();
      const row=document.createElement("div"); row.className="history-row";
      row.innerHTML=`
        <div class="history-icon">✅</div>
        <div class="history-info">
          <p class="history-title">${isSent?"You paid":""+toName} ${isSent?toName:"paid you"}</p>
          <p class="history-meta">${s.groupName||"Group"} · ${timeAgo(date)}${s.note?` · ${s.note}`:""}</p>
        </div>
        <p class="history-amount">${formatCurrency(s.amount)}</p>
      `;
      list.appendChild(row);
    }
  } catch(err){console.error(err);list.innerHTML="";empty.classList.remove("hidden");}
}

const settleModal=document.getElementById("settleModal");
function openSettleModal(settlement) {
  activeSettleData=settlement;
  document.getElementById("settleAmountInput").value=settlement.amount;
  document.getElementById("settleNoteInput").value="";
  document.getElementById("err-settle-amount").textContent="";
  getMemberName(settlement.from).then(fromName=>{
    getMemberName(settlement.to).then(toName=>{
      document.getElementById("settleModalDesc").textContent=`${settlement.from===currentUser.uid?"You":fromName} → ${settlement.to===currentUser.uid?"you":toName} · ${settlement.groupName}`;
    });
  });
  settleModal.classList.remove("hidden");
}

document.getElementById("settleModalClose").addEventListener("click",()=>settleModal.classList.add("hidden"));
settleModal.addEventListener("click",(e)=>{if(e.target===settleModal)settleModal.classList.add("hidden");});

document.getElementById("settleConfirmBtn").addEventListener("click",async()=>{
  const amount=parseFloat(document.getElementById("settleAmountInput").value);
  const note=document.getElementById("settleNoteInput").value.trim();
  const errEl=document.getElementById("err-settle-amount");
  errEl.textContent="";
  if(!amount||amount<=0){errEl.textContent="Enter a valid amount.";return;}
  const btn=document.getElementById("settleConfirmBtn"); const text=btn.querySelector(".btn-text"); const spinner=document.getElementById("settleSpinner");
  text.style.opacity="0.4"; spinner.classList.remove("hidden"); btn.disabled=true;
  try {
    const {groupId,from,to}=activeSettleData;
    const groupRef=doc(db,"groups",groupId);
    const groupSnap=await getDoc(groupRef);
    const balances={...(groupSnap.data().memberBalances||{})};
    balances[from]=Math.round(((balances[from]||0)+amount)*100)/100;
    balances[to]=Math.round(((balances[to]||0)-amount)*100)/100;
    await Promise.all([
      updateDoc(groupRef,{memberBalances:balances,updatedAt:serverTimestamp()}),
      addDoc(collection(db,"settlements"),{groupId,groupName:activeSettleData.groupName,from,to,amount,note,settledAt:serverTimestamp(),status:"completed"})
    ]);
    showToast("Settlement recorded! 🎉","success");
    settleModal.classList.add("hidden");
    await loadAll(currentUser.uid);
  } catch(err){console.error(err);showToast("Could not record settlement.","error");}
  finally{text.style.opacity="1";spinner.classList.add("hidden");btn.disabled=false;}
});

onAuthStateChanged(auth,async(user)=>{
  if(!user){window.location.href="login.html";return;}
  currentUser=user;
  try{
    const snap=await getDoc(doc(db,"users",user.uid));
    if(snap.exists()){
      const d=snap.data();
      document.getElementById("sidebarName").textContent=d.displayName||"User";
      document.getElementById("sidebarEmail").textContent=d.email||"";
      if(d.photoURL) document.getElementById("sidebarAvatar").innerHTML=`<img src="${d.photoURL}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    }
  }catch(err){console.error(err);}
  await loadAll(user.uid);
});