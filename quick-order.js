import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  setDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";


/* =====================================================
   STATE
===================================================== */

let currentUser = null;
let allProducts = null; // fetched lazily once, on Step 4

const selection = {
  brand: "",
  series: "",
  model: "",
  category: "",
  product: null,      // the chosen product doc (id + data)
  variantIndex: 0      // which image in product.images[] they liked
};


/* =====================================================
   CATEGORIES
   (label the customer sees -> keywords matched against
   each product's `category` field, case-insensitive)
===================================================== */

const CATEGORIES = [
  { label: "Covers",             icon: "📱", keywords: ["cover", "case"] },
  { label: "Tempered Glass",     icon: "🛡️", keywords: ["tempered", "screen guard", "screen protector"] },
  { label: "Camera Glass",       icon: "📷", keywords: ["camera glass", "camera lens", "camera protector"] },
  { label: "Unique Products",    icon: "✨", keywords: ["unique"] },
  { label: "Mobile Battery",     icon: "🔋", keywords: ["battery"] },
  { label: "Customized Cover",   icon: "🎨", keywords: ["customized", "custom cover", "customised"] }
];

const BRANDS = [
  { label: "Samsung",  color: "#1428A0" },
  { label: "Apple",    color: "#555555" },
  { label: "Xiaomi/Redmi", color: "#FF6900" },
  { label: "Vivo",     color: "#4B7BEC" },
  { label: "Oppo",     color: "#1BA784" },
  { label: "Realme",   color: "#FFC800" },
  { label: "OnePlus",  color: "#EB0029" },
  { label: "Motorola", color: "#6236FF" },
  { label: "Other",    color: "#8A8A8A" }
];

const SERIES_SUGGESTIONS = {
  "Samsung": ["Galaxy A", "Galaxy M", "Galaxy S", "Galaxy F", "Galaxy Note"],
  "Xiaomi/Redmi": ["Redmi Note", "Redmi", "Poco", "Mi"],
  "Vivo": ["Vivo Y", "Vivo V", "Vivo T"],
  "Oppo": ["Oppo A", "Oppo F", "Oppo Reno"],
  "Realme": ["Realme Narzo", "Realme C", "Realme Number"],
  "Apple": ["iPhone"],
  "OnePlus": ["OnePlus Nord", "OnePlus Number"],
  "Motorola": ["Moto G", "Moto Edge"]
};


/* =====================================================
   HELPERS
===================================================== */

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

function goToStep(stepId) {
  document.querySelectorAll(".qo-panel").forEach(p => p.classList.remove("active"));
  document.getElementById(stepId).classList.add("active");

  const stepNumber = { qoStep1: 1, qoStep2: 2, qoStep3: 3, qoStep4: 4, qoStep5: 5, qoStep6: 6 }[stepId];

  document.querySelectorAll(".qo-step").forEach(el => {
    const n = Number(el.dataset.step);
    el.classList.toggle("active", n === stepNumber);
    el.classList.toggle("done", stepNumber && n < stepNumber);
  });

  const backBtn = document.getElementById("qoBackStep");
  backBtn.style.display = (stepId === "qoStep1" || stepId === "qoStepDone") ? "none" : "block";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

const STEP_ORDER = ["qoStep1", "qoStep2", "qoStep3", "qoStep4", "qoStep5", "qoStep6"];
let historyStack = ["qoStep1"];

function advanceTo(stepId) {
  historyStack.push(stepId);
  goToStep(stepId);
}

document.getElementById("qoBackStep").addEventListener("click", () => {
  if (historyStack.length > 1) {
    historyStack.pop();
    goToStep(historyStack[historyStack.length - 1]);
  }
});


/* =====================================================
   STEP 1 — BRAND
===================================================== */

function renderBrandGrid() {
  const grid = document.getElementById("qoBrandGrid");
  grid.innerHTML = BRANDS.map(b => `
    <div class="qo-brand-tile" data-brand="${escapeHtml(b.label)}">
      <div class="qo-brand-avatar" style="background:${b.color};">${escapeHtml(b.label.charAt(0))}</div>
      <div class="qo-brand-label">${escapeHtml(b.label)}</div>
    </div>
  `).join("");
}

document.getElementById("qoBrandGrid").addEventListener("click", (e) => {
  const tile = e.target.closest(".qo-brand-tile");
  if (!tile) return;

  selection.brand = tile.dataset.brand;

  document.querySelectorAll(".qo-brand-tile").forEach(t => t.classList.remove("selected"));
  tile.classList.add("selected");

  renderSeriesSuggestions();
  document.getElementById("qoSeriesSub").textContent = `Popular ${selection.brand} series (or type your own):`;

  setTimeout(() => advanceTo("qoStep2"), 150);
});


/* =====================================================
   STEP 2 — SERIES
===================================================== */

function renderSeriesSuggestions() {
  const grid = document.getElementById("qoSeriesGrid");
  const suggestions = SERIES_SUGGESTIONS[selection.brand] || [];

  grid.innerHTML = suggestions.map(s => `
    <div class="qo-chip" data-series="${escapeHtml(s)}">${escapeHtml(s)}</div>
  `).join("");
}

document.getElementById("qoSeriesGrid").addEventListener("click", (e) => {
  const chip = e.target.closest(".qo-chip");
  if (!chip) return;

  document.querySelectorAll("#qoSeriesGrid .qo-chip").forEach(c => c.classList.remove("selected"));
  chip.classList.add("selected");

  document.getElementById("qoSeriesInput").value = chip.dataset.series;
});

document.getElementById("qoSeriesNext").addEventListener("click", () => {
  const value = document.getElementById("qoSeriesInput").value.trim();

  if (!value) {
    alert("Please enter or select a series");
    return;
  }

  selection.series = value;
  advanceTo("qoStep3");
});


/* =====================================================
   STEP 3 — MODEL
===================================================== */

document.getElementById("qoModelNext").addEventListener("click", () => {
  const value = document.getElementById("qoModelInput").value.trim();

  if (!value) {
    alert("Please enter your exact model");
    return;
  }

  selection.model = value;

  document.getElementById("qoPhoneSummary").textContent =
    `For your ${selection.brand} ${selection.series} ${selection.model}`;

  advanceTo("qoStep4");
  renderCategoryGrid();
});


/* =====================================================
   STEP 4 — CATEGORY (uses a real product image per
   category, fetched once and cached)
===================================================== */

async function ensureProductsLoaded() {
  if (allProducts !== null) return allProducts;
  try {
    const snap = await getDocs(collection(db, "products"));
    allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Products load error:", error);
    allProducts = [];
  }
  return allProducts;
}

function productsForCategory(catDef) {
  return (allProducts || []).filter(p => {
    const cat = (p.category || "").toLowerCase();
    return catDef.keywords.some(k => cat.includes(k));
  });
}

async function renderCategoryGrid() {
  const grid = document.getElementById("qoCategoryGrid");
  grid.innerHTML = `<div class="qo-loading">Loading categories…</div>`;

  await ensureProductsLoaded();

  grid.innerHTML = CATEGORIES.map(cat => {
    const matches = productsForCategory(cat);
    const sampleImage = matches.find(p => p.image)?.image;

    return `
      <div class="qo-category-tile" data-category="${escapeHtml(cat.label)}">
        ${sampleImage
          ? `<img class="qo-category-img" src="${escapeHtml(sampleImage)}" alt="${escapeHtml(cat.label)}">`
          : `<div class="qo-category-icon">${cat.icon}</div>`
        }
        <div class="qo-category-label">${escapeHtml(cat.label)}</div>
      </div>
    `;
  }).join("");
}

document.getElementById("qoCategoryGrid").addEventListener("click", (e) => {
  const tile = e.target.closest(".qo-category-tile");
  if (!tile) return;

  selection.category = tile.dataset.category;

  document.querySelectorAll(".qo-category-tile").forEach(t => t.classList.remove("selected"));
  tile.classList.add("selected");

  setTimeout(() => {
    advanceTo("qoStep5");
    renderTypeGrid();
  }, 150);
});


/* =====================================================
   STEP 5 — TYPE (actual products in that category)
===================================================== */

function renderTypeGrid() {

  const catDef = CATEGORIES.find(c => c.label === selection.category);
  const matches = catDef ? productsForCategory(catDef) : [];

  document.getElementById("qoTypeTitle").textContent = `Choose your ${selection.category.toLowerCase()}`;
  document.getElementById("qoTypeSub").textContent =
    matches.length ? "Tap the one you like" : "No products found in this category yet.";

  const grid = document.getElementById("qoTypeGrid");

  if (!matches.length) {
    grid.innerHTML = `<div class="qo-loading">Nothing here yet — try another category or check back soon.</div>`;
    return;
  }

  grid.innerHTML = matches.map(p => `
    <div class="qo-type-tile" data-id="${p.id}">
      <img class="qo-type-img" src="${escapeHtml(p.image || "")}" alt="${escapeHtml(p.productName || "")}">
      <div class="qo-type-info">
        <div class="qo-type-name">${escapeHtml(p.productName || "Product")}</div>
        <div class="qo-type-price">₹${p.price ?? 0}</div>
      </div>
    </div>
  `).join("");
}

document.getElementById("qoTypeGrid").addEventListener("click", (e) => {
  const tile = e.target.closest(".qo-type-tile");
  if (!tile) return;

  const product = (allProducts || []).find(p => p.id === tile.dataset.id);
  if (!product) return;

  selection.product = product;
  selection.variantIndex = 0;

  document.querySelectorAll(".qo-type-tile").forEach(t => t.classList.remove("selected"));
  tile.classList.add("selected");

  setTimeout(() => {
    advanceTo("qoStep6");
    renderVariantGrid();
  }, 150);
});


/* =====================================================
   STEP 6 — VARIANT (product's own photo gallery, used
   as a "which look do you prefer" picker)
===================================================== */

function renderVariantGrid() {

  const p = selection.product;
  const images = Array.isArray(p.images) && p.images.length ? p.images : [p.image].filter(Boolean);

  document.getElementById("qoVariantSub").textContent =
    images.length > 1
      ? `${p.productName} — tap the photo/look you prefer`
      : `${p.productName}`;

  const grid = document.getElementById("qoVariantGrid");

  grid.innerHTML = images.map((img, i) => `
    <div class="qo-variant-tile ${i === 0 ? "selected" : ""}" data-index="${i}">
      <img class="qo-variant-img" src="${escapeHtml(img)}" alt="Option ${i + 1}">
    </div>
  `).join("");

  renderSummary();
}

document.getElementById("qoVariantGrid").addEventListener("click", (e) => {
  const tile = e.target.closest(".qo-variant-tile");
  if (!tile) return;

  selection.variantIndex = Number(tile.dataset.index);

  document.querySelectorAll(".qo-variant-tile").forEach(t => t.classList.remove("selected"));
  tile.classList.add("selected");

  renderSummary();
});

function renderSummary() {
  const p = selection.product;

  document.getElementById("qoSummaryCard").innerHTML = `
    <div><b>Phone:</b> ${escapeHtml(selection.brand)} ${escapeHtml(selection.series)} ${escapeHtml(selection.model)}</div>
    <div><b>Category:</b> ${escapeHtml(selection.category)}</div>
    <div><b>Product:</b> ${escapeHtml(p.productName || "")}</div>
    <div><b>Price:</b> ₹${p.price ?? 0}</div>
  `;
}


/* =====================================================
   FINAL — ADD TO CART
===================================================== */

document.getElementById("qoDoneBtn").addEventListener("click", async () => {

  if (!currentUser) {
    alert("Please login first");
    window.location.href = "login.html";
    return;
  }

  const p = selection.product;
  if (!p) return;

  const images = Array.isArray(p.images) && p.images.length ? p.images : [p.image].filter(Boolean);
  const chosenImage = images[selection.variantIndex] || p.image;

  const btn = document.getElementById("qoDoneBtn");
  btn.disabled = true;
  btn.textContent = "Adding...";

  try {

    const cartRef = doc(db, "users", currentUser.uid, "cart", p.id);

    await setDoc(cartRef, {
      ...p,
      image: chosenImage,
      qty: 1,
      // Note for the seller — which phone this accessory is for.
      // (This app doesn't have per-model stock/SKUs, so it's
      // carried as a plain note rather than a strict variant.)
      phoneNote: `${selection.brand} ${selection.series} ${selection.model}`.trim()
    });

    advanceTo("qoStepDone");

  } catch (error) {
    console.error(error);
    alert(error.message || "Could not add to cart. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "✅ Add to Cart & Order";
  }

});


/* =====================================================
   INIT
===================================================== */

renderBrandGrid();

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (!user) {
    window.location.href = "login.html";
  }
});
