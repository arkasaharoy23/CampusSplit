import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  updateProfile,
  PhoneAuthProvider,
  linkWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "../config/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

let confirmationResult = null;
let otpTimerInterval = null;
let recaptchaVerifier = null;
let currentStep = 1;
let registeredUser = null;
let formData = {};

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

function setLoading(btn, spinnerId, loading) {
  const spinner = document.getElementById(spinnerId);
  const text = btn.querySelector(".btn-text");
  if (loading) {
    text.style.opacity = "0.4";
    spinner.classList.remove("hidden");
    btn.disabled = true;
  } else {
    text.style.opacity = "1";
    spinner.classList.add("hidden");
    btn.disabled = false;
  }
}

function showError(fgId, errId, message) {
  const fg = document.getElementById(fgId);
  const err = document.getElementById(errId);
  if (fg) fg.classList.add("error");
  if (err) err.textContent = message;
}

function clearError(fgId, errId) {
  const fg = document.getElementById(fgId);
  const err = document.getElementById(errId);
  if (fg) fg.classList.remove("error");
  if (err) err.textContent = "";
}

function clearAllErrors() {
  document.querySelectorAll(".form-group.error").forEach(el => el.classList.remove("error"));
  document.querySelectorAll(".field-error").forEach(el => el.textContent = "");
}

function getFirebaseErrorMessage(code) {
  const messages = {
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/invalid-email": "That doesn't look like a valid email.",
    "auth/weak-password": "Password must be at least 8 characters.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again.",
    "auth/popup-closed-by-user": "Sign-in popup was closed. Try again.",
    "auth/invalid-phone-number": "Enter a valid 10-digit phone number.",
    "auth/code-expired": "OTP has expired. Please resend.",
    "auth/invalid-verification-code": "Incorrect OTP. Check and try again.",
    "auth/provider-already-linked": "This phone number is already linked."
  };
  return messages[code] || "Something went wrong. Please try again.";
}

function goToStep(step) {
  document.querySelectorAll(".reg-step").forEach(el => el.classList.remove("active"));
  document.getElementById(`regStep${step}`).classList.add("active");

  document.querySelectorAll(".prog-step").forEach((el, i) => {
    el.classList.remove("active", "done");
    if (i + 1 < step) el.classList.add("done");
    if (i + 1 === step) el.classList.add("active");
  });

  document.querySelectorAll(".prog-line").forEach((el, i) => {
    el.classList.toggle("done", i + 1 < step);
  });

  currentStep = step;
}

function getPasswordStrength(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

const regPasswordInput = document.getElementById("regPassword");
regPasswordInput.addEventListener("input", () => {
  const val = regPasswordInput.value;
  const score = getPasswordStrength(val);
  const fill = document.getElementById("strengthFill");
  const label = document.getElementById("strengthLabel");
  const pcts = ["0%", "25%", "50%", "75%", "100%"];
  const colors = ["transparent", "#EF4444", "#F59E0B", "#10B981", "#6C63FF"];
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  fill.style.width = pcts[Math.min(score, 4)];
  fill.style.background = colors[Math.min(score, 4)];
  label.textContent = val ? labels[Math.min(score, 4)] : "";
  label.style.color = colors[Math.min(score, 4)];
  clearError("fg-reg-pass", "err-reg-pass");
});

const toggleRegPass = document.getElementById("toggleRegPass");
const regPassInput = document.getElementById("regPassword");
toggleRegPass.addEventListener("click", () => {
  const isPass = regPassInput.type === "password";
  regPassInput.type = isPass ? "text" : "password";
  toggleRegPass.querySelector(".eye-open").style.display = isPass ? "none" : "block";
  toggleRegPass.querySelector(".eye-closed").style.display = isPass ? "block" : "none";
});

let usernameCheckTimeout = null;
const usernameInput = document.getElementById("username");
const usernameStatus = document.getElementById("usernameStatus");

usernameInput.addEventListener("input", () => {
  const val = usernameInput.value.trim().toLowerCase();
  clearError("fg-username", "err-username");
  usernameStatus.className = "input-status";
  usernameStatus.textContent = "";
  clearTimeout(usernameCheckTimeout);

  if (!val) return;

  usernameStatus.className = "input-status checking";
  usernameStatus.textContent = "Checking…";

  usernameCheckTimeout = setTimeout(async () => {
    if (val.length < 3) {
      usernameStatus.className = "input-status taken";
      usernameStatus.textContent = "Too short";
      return;
    }
    if (!/^[a-z0-9_.]+$/.test(val)) {
      usernameStatus.className = "input-status taken";
      usernameStatus.textContent = "Invalid chars";
      return;
    }
    try {
      const snap = await getDoc(doc(db, "usernames", val));
      if (snap.exists()) {
        usernameStatus.className = "input-status taken";
        usernameStatus.textContent = "Taken";
      } else {
        usernameStatus.className = "input-status available";
        usernameStatus.textContent = "Available ✓";
      }
    } catch {
      usernameStatus.textContent = "";
    }
  }, 500);
});

const avatarInput = document.getElementById("avatarInput");
const avatarPreview = document.getElementById("avatarPreview");

avatarInput.addEventListener("change", () => {
  const file = avatarInput.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast("Photo must be under 5MB.", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    avatarPreview.innerHTML = `<img src="${e.target.result}" alt="Avatar" />`;
  };
  reader.readAsDataURL(file);
});

function initRecaptchaReg() {
  if (recaptchaVerifier) return;
  recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container-reg", {
    size: "invisible",
    callback: () => {}
  });
}

const registerForm = document.getElementById("registerForm");
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAllErrors();

  const fname = document.getElementById("fname").value.trim();
  const lname = document.getElementById("lname").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const phone = document.getElementById("regPhone").value.trim();
  const password = document.getElementById("regPassword").value;
  const confirm = document.getElementById("confirmPassword").value;
  const agreed = document.getElementById("agreeTerms").checked;
  const submitBtn = document.getElementById("regSubmitBtn");

  let valid = true;

  if (!fname) { showError("fg-fname", "err-fname", "First name is required."); valid = false; }
  if (!lname) { showError("fg-lname", "err-lname", "Last name is required."); valid = false; }

  if (!email) {
    showError("fg-reg-email", "err-reg-email", "Email is required."); valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError("fg-reg-email", "err-reg-email", "Enter a valid email address."); valid = false;
  }

  if (!phone || phone.length !== 10 || !/^\d{10}$/.test(phone)) {
    showError("fg-reg-phone", "err-reg-phone", "Enter a valid 10-digit phone number."); valid = false;
  }

  if (!password) {
    showError("fg-reg-pass", "err-reg-pass", "Password is required."); valid = false;
  } else if (password.length < 8) {
    showError("fg-reg-pass", "err-reg-pass", "Password must be at least 8 characters."); valid = false;
  }

  if (!confirm) {
    showError("fg-reg-confirm", "err-confirm", "Please confirm your password."); valid = false;
  } else if (password !== confirm) {
    showError("fg-reg-confirm", "err-confirm", "Passwords do not match."); valid = false;
  }

  if (!agreed) {
    document.getElementById("err-terms").textContent = "You must agree to the terms to continue."; valid = false;
  }

  if (!valid) return;

  setLoading(submitBtn, "regSpinner", true);
  formData = { fname, lname, email, phone, password };

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    registeredUser = userCredential.user;

    await updateProfile(registeredUser, { displayName: `${fname} ${lname}` });

    initRecaptchaReg();
    const fullPhone = "+91" + phone;
    confirmationResult = await signInWithPhoneNumber(auth, fullPhone, recaptchaVerifier);

    document.getElementById("regDisplayPhone").textContent = "+91 " + phone.replace(/(\d{5})(\d{5})/, "$1 $2");
    initOtpBoxes("regOtpBoxes");
    startOtpTimer("regOtpTimer", "regOtpTimerMsg", "regResendOtp");
    showToast("Account created! Verify your phone.", "success");
    goToStep(2);
  } catch (err) {
    setLoading(submitBtn, "regSpinner", false);
    const msg = getFirebaseErrorMessage(err.code);
    if (err.code === "auth/email-already-in-use") {
      showError("fg-reg-email", "err-reg-email", msg);
    } else if (err.code === "auth/invalid-phone-number") {
      showError("fg-reg-phone", "err-reg-phone", msg);
    } else {
      showToast(msg, "error");
    }
    recaptchaVerifier = null;
  }
});

document.getElementById("backToStep1").addEventListener("click", () => {
  clearInterval(otpTimerInterval);
  goToStep(1);
  document.getElementById("regSubmitBtn").disabled = false;
  document.getElementById("regSpinner").classList.add("hidden");
  document.getElementById("regSubmitBtn").querySelector(".btn-text").style.opacity = "1";
});

document.getElementById("verifyRegOtpBtn").addEventListener("click", async () => {
  const code = getOtpValue("regOtpBoxes");
  const errOtp = document.getElementById("err-reg-otp");
  const verifyBtn = document.getElementById("verifyRegOtpBtn");

  if (code.length !== 6) {
    errOtp.textContent = "Enter all 6 digits.";
    setOtpError("regOtpBoxes");
    return;
  }

  errOtp.textContent = "";
  setLoading(verifyBtn, "verifyRegSpinner", true);

  try {
    const credential = PhoneAuthProvider.credential(confirmationResult.verificationId, code);
    await linkWithCredential(registeredUser, credential);
    clearInterval(otpTimerInterval);
    goToStep(3);
    showToast("Phone verified!", "success");
  } catch (err) {
    if (err.code === "auth/provider-already-linked") {
      clearInterval(otpTimerInterval);
      goToStep(3);
    } else {
      setLoading(verifyBtn, "verifyRegSpinner", false);
      errOtp.textContent = getFirebaseErrorMessage(err.code);
      setOtpError("regOtpBoxes");
    }
  }
});

document.getElementById("regResendOtp").addEventListener("click", async () => {
  const phone = formData.phone;
  recaptchaVerifier = null;
  initRecaptchaReg();
  try {
    confirmationResult = await signInWithPhoneNumber(auth, "+91" + phone, recaptchaVerifier);
    resetOtpBoxes("regOtpBoxes");
    startOtpTimer("regOtpTimer", "regOtpTimerMsg", "regResendOtp");
    showToast("OTP resent!", "info");
  } catch (err) {
    showToast(getFirebaseErrorMessage(err.code), "error");
  }
});

const profileForm = document.getElementById("profileForm");
profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAllErrors();

  const username = document.getElementById("username").value.trim().toLowerCase();
  const upiId = document.getElementById("upiId").value.trim();
  const finishBtn = document.getElementById("finishBtn");

  if (!username) {
    showError("fg-username", "err-username", "Choose a username.");
    return;
  }
  if (username.length < 3) {
    showError("fg-username", "err-username", "Username must be at least 3 characters.");
    return;
  }
  if (!/^[a-z0-9_.]+$/.test(username)) {
    showError("fg-username", "err-username", "Only letters, numbers, dots, and underscores.");
    return;
  }

  setLoading(finishBtn, "finishSpinner", true);

  try {
    const usernameSnap = await getDoc(doc(db, "usernames", username));
    if (usernameSnap.exists()) {
      showError("fg-username", "err-username", "That username is already taken.");
      setLoading(finishBtn, "finishSpinner", false);
      return;
    }

    let photoURL = registeredUser.photoURL || "";
    const avatarFile = document.getElementById("avatarInput").files[0];
    if (avatarFile) {
      const toBase64 = (file) => new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      photoURL = await toBase64(avatarFile);
    }

    const userData = {
      uid: registeredUser.uid,
      fname: formData.fname,
      lname: formData.lname,
      displayName: `${formData.fname} ${formData.lname}`,
      email: formData.email,
      phone: "+91" + formData.phone,
      username,
      upiId: upiId || "",
      photoURL,
      createdAt: serverTimestamp(),
      groups: [],
      totalOwed: 0,
      totalOwes: 0
    };

    await setDoc(doc(db, "users", registeredUser.uid), userData);
    await setDoc(doc(db, "usernames", username), { uid: registeredUser.uid });

    await updateProfile(registeredUser, {
      displayName: userData.displayName,
      photoURL: photoURL || undefined
    });

    showToast("Welcome to CampusSplit! 🎉", "success");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 1400);
  } catch (err) {
    setLoading(finishBtn, "finishSpinner", false);
    showToast("Could not save profile. Try again.", "error");
    console.error(err);
  }
});

document.getElementById("googleRegBtn").addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) {
      registeredUser = user;
      const nameParts = (user.displayName || "").split(" ");
      formData.fname = nameParts[0] || "";
      formData.lname = nameParts.slice(1).join(" ") || "";
      formData.email = user.email || "";
      goToStep(3);
      showToast("Google account connected! Complete your profile.", "info");
    } else {
      showToast("Welcome back!", "success");
      setTimeout(() => { window.location.href = "dashboard.html"; }, 1000);
    }
  } catch (err) {
    if (err.code !== "auth/popup-closed-by-user") {
      showToast(getFirebaseErrorMessage(err.code), "error");
    }
  }
});

function initOtpBoxes(containerId) {
  const boxes = document.querySelectorAll(`#${containerId} .otp-box`);
  boxes.forEach((box, i) => {
    box.value = "";
    box.classList.remove("filled", "error-box");
    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !box.value && i > 0) {
        boxes[i - 1].focus();
        boxes[i - 1].value = "";
        boxes[i - 1].classList.remove("filled");
      }
    });
    box.addEventListener("input", () => {
      box.value = box.value.replace(/\D/g, "").slice(0, 1);
      if (box.value) {
        box.classList.add("filled");
        if (i < boxes.length - 1) boxes[i + 1].focus();
      } else {
        box.classList.remove("filled");
      }
    });
    box.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
      pasted.split("").forEach((ch, j) => {
        if (boxes[j]) {
          boxes[j].value = ch;
          boxes[j].classList.add("filled");
        }
      });
      const next = Math.min(pasted.length, boxes.length - 1);
      boxes[next].focus();
    });
  });
  boxes[0].focus();
}

function getOtpValue(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .otp-box`))
    .map(b => b.value).join("");
}

function setOtpError(containerId) {
  document.querySelectorAll(`#${containerId} .otp-box`).forEach(b => b.classList.add("error-box"));
}

function resetOtpBoxes(containerId) {
  document.querySelectorAll(`#${containerId} .otp-box`).forEach(b => {
    b.value = "";
    b.classList.remove("filled", "error-box");
  });
  document.querySelectorAll(`#${containerId} .otp-box`)[0]?.focus();
}

function startOtpTimer(timerId, msgId, resendBtnId) {
  clearInterval(otpTimerInterval);
  let seconds = 30;
  const timerEl = document.getElementById(timerId);
  const msgEl = document.getElementById(msgId);
  const resendBtn = document.getElementById(resendBtnId);

  if (timerEl) timerEl.textContent = seconds + "s";
  if (msgEl) msgEl.classList.remove("hidden");
  if (resendBtn) resendBtn.classList.add("hidden");

  otpTimerInterval = setInterval(() => {
    seconds--;
    if (timerEl) timerEl.textContent = seconds + "s";
    if (seconds <= 0) {
      clearInterval(otpTimerInterval);
      if (msgEl) msgEl.classList.add("hidden");
      if (resendBtn) resendBtn.classList.remove("hidden");
    }
  }, 1000);
}