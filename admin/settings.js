import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { showToast } from "../design-system.js";
import { logAdminAction } from "./audit.js";


const SETTINGS_DOC = doc(db, "settings", "store");

const settingsLoading = document.getElementById("settingsLoading");
const settingsForm = document.getElementById("settingsForm");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsMeta = document.getElementById("settingsMeta");

const storeName = document.getElementById("storeName");
const supportEmail = document.getElementById("supportEmail");
const supportPhone = document.getElementById("supportPhone");
const storeAddress = document.getElementById("storeAddress");

const shippingFee = document.getElementById("shippingFee");
const freeShippingThreshold = document.getElementById("freeShippingThreshold");
const taxRate = document.getElementById("taxRate");

const codEnabled = document.getElementById("codEnabled");
const onlinePaymentsEnabled = document.getElementById("onlinePaymentsEnabled");
const maintenanceMode = document.getElementById("maintenanceMode");

const DEFAULTS = {
  storeName: "Bestify Mobile",
  supportEmail: "",
  supportPhone: "",
  storeAddress: "",
  shippingFee: 0,
  freeShippingThreshold: 0,
  taxRate: 0,
  codEnabled: true,
  onlinePaymentsEnabled: false,
  maintenanceMode: false
};

let currentSettings = { ...DEFAULTS };


/* =========================
   HELPERS
========================= */

function formatDateTime(value) {
  try {
    const d = value?.toDate ? value.toDate() : new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
      " · " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function applyToForm(settings) {

  storeName.value = settings.storeName ?? DEFAULTS.storeName;
  supportEmail.value = settings.supportEmail ?? "";
  supportPhone.value = settings.supportPhone ?? "";
  storeAddress.value = settings.storeAddress ?? "";

  shippingFee.value = settings.shippingFee ?? 0;
  freeShippingThreshold.value = settings.freeShippingThreshold ?? 0;
  taxRate.value = settings.taxRate ?? 0;

  codEnabled.checked = settings.codEnabled !== false;
  onlinePaymentsEnabled.checked = settings.onlinePaymentsEnabled === true;
  maintenanceMode.checked = settings.maintenanceMode === true;

}

function readFromForm() {
  return {
    storeName: storeName.value.trim() || DEFAULTS.storeName,
    supportEmail: supportEmail.value.trim(),
    supportPhone: supportPhone.value.trim(),
    storeAddress: storeAddress.value.trim(),
    shippingFee: Number(shippingFee.value) || 0,
    freeShippingThreshold: Number(freeShippingThreshold.value) || 0,
    taxRate: Math.min(100, Math.max(0, Number(taxRate.value) || 0)),
    codEnabled: codEnabled.checked,
    onlinePaymentsEnabled: onlinePaymentsEnabled.checked,
    maintenanceMode: maintenanceMode.checked
  };
}


/* =========================
   LOAD
========================= */

async function loadSettings() {

  try {

    const snap = await getDoc(SETTINGS_DOC);

    if (snap.exists()) {
      currentSettings = { ...DEFAULTS, ...snap.data() };

      if (snap.data().updatedAt) {
        settingsMeta.textContent =
          "Last updated " + formatDateTime(snap.data().updatedAt) +
          (snap.data().updatedBy ? " by " + snap.data().updatedBy : "");
      }
    } else {
      currentSettings = { ...DEFAULTS };
    }

    applyToForm(currentSettings);

    settingsLoading.classList.add("bf-hidden");
    settingsForm.classList.remove("bf-hidden");

  } catch (error) {

    console.error("Settings load error:", error);

    settingsLoading.innerHTML = `
      Unable to load settings.
      <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm" id="settingsRetryBtn" style="margin-left:8px;">Retry</button>
    `;

    const retryBtn = document.getElementById("settingsRetryBtn");
    if (retryBtn) retryBtn.addEventListener("click", loadSettings);

    showToast(error.message || "Failed to load settings.", "danger");

  }

}


/* =========================
   SAVE
========================= */

settingsForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  const next = readFromForm();

  saveSettingsBtn.disabled = true;
  const originalLabel = saveSettingsBtn.textContent;
  saveSettingsBtn.textContent = "Saving...";

  try {

    const user = auth.currentUser;

    await setDoc(SETTINGS_DOC, {
      ...next,
      updatedAt: serverTimestamp(),
      updatedBy: user ? (user.email || user.uid) : "Unknown"
    }, { merge: true });

    // Only log fields that actually changed, so entries stay meaningful.
    const changed = {};
    Object.keys(next).forEach(key => {
      if (currentSettings[key] !== next[key]) {
        changed[key] = { from: currentSettings[key], to: next[key] };
      }
    });

    if (Object.keys(changed).length > 0) {
      await logAdminAction("Updated store settings", "Settings", changed);
    }

    currentSettings = next;

    showToast("Settings saved", "success");
    settingsMeta.textContent = "Last updated just now";

  } catch (error) {

    console.error("Settings save error:", error);
    showToast(error.message || "Failed to save settings.", "danger");

  } finally {

    saveSettingsBtn.disabled = false;
    saveSettingsBtn.textContent = originalLabel;

  }

});


/* =========================
   APP INIT (ADMIN CHECK)
========================= */

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {

    const userDoc = await getDoc(doc(db, "users", user.uid));

    if (!userDoc.exists() || userDoc.data().isAdmin !== true) {
      alert("Access Denied ❌");
      window.location.href = "home.html";
      return;
    }

  } catch (error) {
    console.error("Admin check error:", error);
    window.location.href = "home.html";
    return;
  }

  loadSettings();

});
