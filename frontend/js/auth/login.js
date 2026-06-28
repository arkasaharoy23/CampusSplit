import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../config/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

let confirmationResult = null;
let otpTimerInterval = null;
let recaptchaVerifier = null;

const tabEmail = document.getElementById("tabEmail");
const tabPhone = document.getElementById("tabPhone");
const panelEmail = document.getElementById("panelEmail");
const panelPhone = document.getElementById("panelPhone");
const phoneStep1 = document.getElementById("phoneStep1");
const phoneStep2 = document.getElementById("phoneStep2");
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

function setLoading(btn, spinner, loading) {
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

function showError(fieldId, errorId, message) {
  const fg = document.getElementById(fieldId);
  const err = document.getElementById(errorId);
  if (fg) fg.classList.add("error");
  if (err) err.textContent = message;
}

function clearError(fieldId, errorId) {
  const fg = document.getElementById(fieldId);
  const err = document.getElementById(errorId);
  if (fg) fg.classList.remove("error");
  if (err) err.textContent = "";
}

function clearAllErrors() {
  document.querySelectorAll(".form-group.error").forEach(el => el.classList.remove("error"));
  document.querySelectorAll(".field-error").forEach(el => el.textContent = "");
}

function getFirebaseErrorMessage(code) {
  const messages = {
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password. Try again.",
    "auth/invalid-email": "That doesn't look like a valid email.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/popup-closed-by-user": "Sign-in popup was closed. Try again.",
    "auth/invalid-phone-number": "Enter a valid 10-digit phone number.",
    "auth/code-expired": "OTP has expired. Please resend.",
    "auth/invalid-verification-code": "Incorrect OTP. Check and try again."
  };
  return messages[code] || "Something went wrong. Please try again.";
}

tabEmail.addEventListener("click", () => {
  tabEmail.classList.add("active");
  tabPhone.classList.remove("active");
  panelEmail.classList.add("active");
  panelPhone.classList.remove("active");
  clearAllErrors();
});

tabPhone.addEventListener("click", () => {
  tabPhone.classList.add("active");
  tabEmail.classList.remove("active");
  panelPhone.classList.add("active");
  panelEmail.classList.remove("active");
  clearAllErrors();
  initRecaptcha();
});

function initRecaptcha() {
  if (recaptchaVerifier) return;
  recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
    size: "invisible",
    callback: () => {}
  });
}

const togglePass = document.getElementById("togglePass");
const passwordInput = document.getElementById("password");

togglePass.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  togglePass.querySelector(".eye-open").style.display = isPassword ? "none" : "block";
  togglePass.querySelector(".eye-closed").style.display = isPassword ? "block" : "none";
});

document.getElementById("email").addEventListener("input", () => clearError("fg-email", "err-email"));
document.getElementById("password").addEventListener("input", () => clearError("fg-password", "err-password"));

const loginForm = document.getElementById("loginForm");
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAllErrors();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const remember = document.getElementById("remember").checked;
  const submitBtn = document.getElementById("submitBtn");
  const spinner = document.getElementById("spinner");

  let valid = true;

  if (!email) {
    showError("fg-email", "err-email", "Email is required.");
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError("fg-email", "err-email", "Enter a valid email address.");
    valid = false;
  }

  if (!password) {
    showError("fg-password", "err-password", "Password is required.");
    valid = false;
  }

  if (!valid) return;

  setLoading(submitBtn, spinner, true);

  try {
    const persistence = remember ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);
    await signInWithEmailAndPassword(auth, email, password);
    showToast("Welcome back! Redirecting…", "success");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 1200);
  } catch (err) {
    setLoading(submitBtn, spinner, false);
    const msg = getFirebaseErrorMessage(err.code);
    if (err.code === "auth/invalid-email" || err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
      showError("fg-email", "err-email", msg);
    } else if (err.code === "auth/wrong-password") {
      showError("fg-password", "err-password", msg);
    } else {
      showToast(msg, "error");
    }
  }
});

document.getElementById("googleBtn").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, googleProvider);
    showToast("Signed in with Google!", "success");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 1000);
  } catch (err) {
    if (err.code !== "auth/popup-closed-by-user") {
      showToast(getFirebaseErrorMessage(err.code), "error");
    }
  }
});

const phoneForm = document.getElementById("phoneForm");
phoneForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAllErrors();

  const rawPhone = document.getElementById("phoneNumber").value.trim();
  const sendBtn = document.getElementById("sendOtpBtn");
  const otpSpinner = document.getElementById("otpSpinner");

  if (!rawPhone || rawPhone.length !== 10 || !/^\d{10}$/.test(rawPhone)) {
    showError("fg-phone", "err-phone", "Enter a valid 10-digit phone number.");
    return;
  }

  const fullPhone = "+91" + rawPhone;
  setLoading(sendBtn, otpSpinner, true);

  try {
    if (!recaptchaVerifier) initRecaptcha();
    confirmationResult = await signInWithPhoneNumber(auth, fullPhone, recaptchaVerifier);
    document.getElementById("displayPhone").textContent = "+91 " + rawPhone.replace(/(\d{5})(\d{5})/, "$1 $2");
    phoneStep1.classList.add("hidden");
    phoneStep2.classList.remove("hidden");
    initOtpBoxes("otpBoxes");
    startOtpTimer("otpTimer", "otpTimerMsg", "resendOtp");
    showToast("OTP sent successfully!", "success");
  } catch (err) {
    setLoading(sendBtn, otpSpinner, false);
    showError("fg-phone", "err-phone", getFirebaseErrorMessage(err.code));
    recaptchaVerifier = null;
  }
});

document.getElementById("backToPhone").addEventListener("click", () => {
  phoneStep2.classList.add("hidden");
  phoneStep1.classList.remove("hidden");
  clearInterval(otpTimerInterval);
  document.getElementById("sendOtpBtn").disabled = false;
  document.getElementById("otpSpinner").classList.add("hidden");
  document.getElementById("sendOtpBtn").querySelector(".btn-text").style.opacity = "1";
});

document.getElementById("verifyOtpBtn").addEventListener("click", async () => {
  const code = getOtpValue("otpBoxes");
  const verifyBtn = document.getElementById("verifyOtpBtn");
  const verifySpinner = document.getElementById("verifySpinner");
  const errOtp = document.getElementById("err-otp");

  if (code.length !== 6) {
    errOtp.textContent = "Enter all 6 digits of the OTP.";
    setOtpError("otpBoxes");
    return;
  }

  errOtp.textContent = "";
  setLoading(verifyBtn, verifySpinner, true);

  try {
    await confirmationResult.confirm(code);
    showToast("Phone verified! Redirecting…", "success");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 1200);
  } catch (err) {
    setLoading(verifyBtn, verifySpinner, false);
    errOtp.textContent = getFirebaseErrorMessage(err.code);
    setOtpError("otpBoxes");
  }
});

document.getElementById("resendOtp").addEventListener("click", async () => {
  const rawPhone = document.getElementById("phoneNumber").value.trim();
  recaptchaVerifier = null;
  initRecaptcha();
  try {
    confirmationResult = await signInWithPhoneNumber(auth, "+91" + rawPhone, recaptchaVerifier);
    resetOtpBoxes("otpBoxes");
    startOtpTimer("otpTimer", "otpTimerMsg", "resendOtp");
    showToast("OTP resent!", "info");
  } catch (err) {
    showToast(getFirebaseErrorMessage(err.code), "error");
  }
});

const forgotLink = document.getElementById("forgotLink");
const forgotModal = document.getElementById("forgotModal");
const modalClose = document.getElementById("modalClose");
const resetBtn = document.getElementById("resetBtn");

forgotLink.addEventListener("click", (e) => {
  e.preventDefault();
  forgotModal.classList.remove("hidden");
});

modalClose.addEventListener("click", () => {
  forgotModal.classList.add("hidden");
  document.getElementById("err-reset").textContent = "";
  document.getElementById("resetEmail").value = "";
});

forgotModal.addEventListener("click", (e) => {
  if (e.target === forgotModal) {
    forgotModal.classList.add("hidden");
  }
});

resetBtn.addEventListener("click", async () => {
  const email = document.getElementById("resetEmail").value.trim();
  const errReset = document.getElementById("err-reset");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errReset.textContent = "Enter a valid email address.";
    return;
  }

  errReset.textContent = "";
  resetBtn.disabled = true;
  resetBtn.querySelector(".btn-text").textContent = "Sending…";

  try {
    await sendPasswordResetEmail(auth, email);
    showToast("Reset link sent! Check your inbox.", "success");
    forgotModal.classList.add("hidden");
  } catch (err) {
    errReset.textContent = getFirebaseErrorMessage(err.code);
  } finally {
    resetBtn.disabled = false;
    resetBtn.querySelector(".btn-text").textContent = "Send reset link";
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
    .map(b => b.value)
    .join("");
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