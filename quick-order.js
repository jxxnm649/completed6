import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
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
  model: ""
};

const STEP_IDS = ["qoStep1", "qoStep2", "qoStep3", "qoStep4", "qoStep5"];
let currentStepIndex = 0;


/* =====================================================
   BRANDS / SERIES / CATEGORIES
===================================================== */

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
  "Samsung":        [["Galaxy S Series", "Premium flagship experience"], ["Galaxy A Series", "Awesome is for everyone"], ["Galaxy M Series", "Monster performance"], ["Galaxy F Series", "Fun. Fast. Secure."], ["Galaxy Z Series", "The future of innovation"], ["Galaxy Note Series", "Power meets productivity"]],
  "Apple":          [["iPhone", "The gold standard"]],
  "Xiaomi/Redmi":   [["Redmi Note", "Great value, great specs"], ["Redmi", "Everyday reliability"], ["Poco", "Built for speed"], ["Mi", "Xiaomi's flagship line"]],
  "Vivo":           [["Vivo Y Series", "Style meets performance"], ["Vivo V Series", "Camera-first design"], ["Vivo T Series", "Power for the young"]],
  "Oppo":           [["Oppo A Series", "Affordable everyday"], ["Oppo F Series", "Selfie expert"], ["Oppo Reno Series", "Design-led flagship"]],
  "Realme":         [["Realme Narzo", "Built for gaming"], ["Realme C Series", "Budget essentials"], ["Realme Number Series", "Realme's flagship line"]],
  "OnePlus":        [["OnePlus Nord", "Flagship features, fair price"], ["OnePlus Number Series", "Never Settle flagship"]],
  "Motorola":       [["Moto G Series", "Reliable all-rounder"], ["Moto Edge Series", "Premium design"]],
  "Other":          []
};

const CATEGORIES = [
  { label: "Covers",           icon: "📱", keywords: ["cover", "case"] },
  { label: "Tempered Glass",   icon: "🛡️", keywords: ["tempered", "screen guard", "screen protector"] },
  { label: "Camera Glass",     icon: "📷", keywords: ["camera glass", "camera lens", "camera protector"] },
  { label: "Unique Products",  icon: "✨", keywords: ["unique"] },
  { label: "Mobile Battery",   icon: "🔋", keywords: ["battery"] },
  { label: "Customized Cover", icon: "🎨", keywords: ["customized", "custom cover", "customised"] }
];


/* =====================================================
   HELPERS
===================================================== */

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

function phoneLabel() {
  return [selection.brand, selection.series, selection.model].filter(Boolean).join(" ");
}

function updateTracker() {
  document.querySelectorAll(".qo-tracker-step").forEach(el => {
    const n = Number(el.dataset.step) - 1;
    el.classList.toggle("active", n === currentStepIndex);
    el.classList.toggle("done", n < currentStepIndex);
  });
  document.querySelectorAll(".qo-tracker-line").forEach((el, i) => {
    el.classList.toggle("done", i < currentStepIndex);
  });
}

function updateBreadcrumb() {
  const bc = document.getElementById("qoBreadcrumb");
  const text = document.getElementById("qoBreadcrumbText");

  if (currentStepIndex === 0) {
    bc.style.display = "none";
    return;
  }

  bc.style.display = "flex";
  text.textContent = phoneLabel() || "Your phone";
}

function updateNavBar() {
  const navBar = document.getElementById("qoNavBar");
  const backBtn = document.getElementById("qoBackBtn");
  const nextBtn = document.getElementById("qoNextBtn");

  // Step 1 (brand) advances automatically on tap, and Step 5
  // (products) advances via each product's own "Place Order Now" —
  // neither needs the shared Back/Next bar.
  if (currentStepIndex === 0 || currentStepIndex === 4) {
    navBar.style.display = "none";
    return;
  }

  navBar.style.display = "flex";
  backBtn.style.display = "block";
  nextBtn.textContent = "Next →";
}

function showStep(index) {
  currentStepIndex = index;

  document.querySelectorAll(".qo-panel").forEach(p => p.classList.remove("active"));
  document.getElementById(STEP_IDS[index]).classList.add("active");

  updateTracker();
  updateBreadcrumb();
  updateNavBar();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goNext() {

  if (currentStepIndex === 1 && !selection.series) {
    const typed = document.getElementById("qoSeriesInput").value.trim();
    if (!typed) { alert("Please choose or type your series"); return; }
    selection.series = typed;
  }

  if (currentStepIndex === 2 && !selection.model) {
    alert("Please choose your model");
    return;
  }

  if (currentStepIndex === 3) {
    return; // category tap itself advances to Step 5
  }

  showStep(Math.min(currentStepIndex + 1, STEP_IDS.length - 1));

  if (currentStepIndex === 3) renderCategoryList();
}

document.getElementById("qoNextBtn").addEventListener("click", goNext);
document.getElementById("qoBackBtn").addEventListener("click", () => {
  showStep(Math.max(currentStepIndex - 1, 0));
});
document.getElementById("qoChangeBtn").addEventListener("click", () => {
  showStep(0);
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
  selection.series = "";
  selection.model = "";

  document.querySelectorAll(".qo-brand-tile").forEach(t => t.classList.remove("selected"));
  tile.classList.add("selected");

  renderSeriesList();

  setTimeout(() => showStep(1), 150);
});


/* =====================================================
   STEP 2 — SERIES
===================================================== */

function renderSeriesList() {
  const list = document.getElementById("qoSeriesList");
  const suggestions = SERIES_SUGGESTIONS[selection.brand] || [];

  list.innerHTML = suggestions.map(([name, sub]) => `
    <div class="qo-list-row" data-series="${escapeHtml(name)}">
      <span class="qo-list-row-text">
        <span class="qo-list-row-title">${escapeHtml(name)}</span>
        <span class="qo-list-row-sub">${escapeHtml(sub)}</span>
      </span>
      <span class="qo-list-row-check">✓</span>
    </div>
  `).join("");

  document.getElementById("qoSeriesInput").value = "";
}

document.getElementById("qoSeriesList").addEventListener("click", (e) => {
  const row = e.target.closest(".qo-list-row");
  if (!row) return;

  selection.series = row.dataset.series;
  selection.model = "";

  document.querySelectorAll("#qoSeriesList .qo-list-row").forEach(r => r.classList.remove("selected"));
  row.classList.add("selected");

  document.getElementById("qoSeriesInput").value = "";

  renderModelList();

  setTimeout(() => showStep(2), 150);
});


/* =====================================================
   STEP 3 — MODEL
   (no fixed model database — free-text entry, matching
   how the rest of this shop's catalogue works)
===================================================== */

function renderModelList() {
  const list = document.getElementById("qoModelList");
  list.innerHTML = `
    <div class="qo-list-row" id="qoModelCustomRow">
      <span class="qo-list-row-icon">✏️</span>
      <span class="qo-list-row-text">
        <span class="qo-list-row-title">Type your exact model</span>
        <span class="qo-list-row-sub">e.g. "A54 5G", "Note 13 Pro", "15 Pro Max"</span>
      </span>
    </div>
  `;
  document.getElementById("qoModelSearch").value = "";
}

document.getElementById("qoModelSearch").addEventListener("input", function () {
  const value = this.value.trim();
  const row = document.getElementById("qoModelCustomRow");
  if (!row) return;

  if (value) {
    selection.model = value;
    row.classList.add("selected");
    row.querySelector(".qo-list-row-title").textContent = value;
  } else {
    selection.model = "";
    row.classList.remove("selected");
    row.querySelector(".qo-list-row-title").textContent = "Type your exact model";
  }
});

document.getElementById("qoModelList").addEventListener("click", () => {
  document.getElementById("qoModelSearch").focus();
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

async function renderCategoryList() {
  const list = document.getElementById("qoCategoryList");
  list.innerHTML = `<div class="qo-loading">Loading categories…</div>`;

  await ensureProductsLoaded();

  list.innerHTML = CATEGORIES.map(cat => {
    const matches = productsForCategory(cat);
    const sampleImage = matches.find(p => p.image)?.image;

    return `
      <div class="qo-list-row" data-category="${escapeHtml(cat.label)}">
        ${sampleImage
          ? `<img class="qo-list-row-img" src="${escapeHtml(sampleImage)}" alt="">`
          : `<span class="qo-list-row-icon">${cat.icon}</span>`
        }
        <span class="qo-list-row-text">
          <span class="qo-list-row-title">${escapeHtml(cat.label)}</span>
          <span class="qo-list-row-sub">${matches.length} product${matches.length === 1 ? "" : "s"} found</span>
        </span>
        <span class="qo-list-row-chevron">›</span>
      </div>
    `;
  }).join("");
}

document.getElementById("qoCategoryList").addEventListener("click", (e) => {
  const row = e.target.closest(".qo-list-row");
  if (!row) return;

  const category = row.dataset.category;

  document.querySelectorAll("#qoCategoryList .qo-list-row").forEach(r => r.classList.remove("selected"));
  row.classList.add("selected");

  renderProductList(category);
  showStep(4);
});


/* =====================================================
   STEP 5 — TYPE (real products in that category)
===================================================== */

function renderProductList(categoryLabel) {

  const catDef = CATEGORIES.find(c => c.label === categoryLabel);
  const matches = catDef ? productsForCategory(catDef) : [];

  document.getElementById("qoTypeTitle").textContent = `Best ${categoryLabel.toLowerCase()} for your ${phoneLabel()}`;
  document.getElementById("qoTypeSub").textContent =
    matches.length ? `${matches.length} product${matches.length === 1 ? "" : "s"} found` : "No products found in this category yet.";

  const list = document.getElementById("qoProductList");

  if (!matches.length) {
    list.innerHTML = `<div class="qo-loading">Nothing here yet — try another category or check back soon.</div>`;
    return;
  }

  list.innerHTML = matches.map(p => {
    const hasDiscount = p.mrp && Number(p.mrp) > Number(p.price);
    const offPct = hasDiscount ? Math.round((1 - Number(p.price) / Number(p.mrp)) * 100) : 0;
    const rating = p.rating || 4.5;
    const ratingCount = p.ratingCount || "";

    return `
      <div class="qo-product-card">
        <img class="qo-product-img" src="${escapeHtml(p.image || "")}" alt="${escapeHtml(p.productName || "")}">
        <div class="qo-product-info">
          <div class="qo-product-name">${escapeHtml(p.productName || "Product")}</div>
          <div class="qo-product-for">For ${escapeHtml(phoneLabel())}</div>
          <div class="qo-product-rating"><span class="star">★</span> ${rating}${ratingCount ? ` (${ratingCount})` : ""}</div>
          <div class="qo-product-price-row">
            <span class="qo-product-price">₹${p.price ?? 0}</span>
            ${hasDiscount ? `<span class="qo-product-mrp">₹${p.mrp}</span><span class="qo-product-off">${offPct}% OFF</span>` : ""}
          </div>
          <button type="button" class="qo-order-btn" data-id="${p.id}">Place Order Now</button>
        </div>
      </div>
    `;
  }).join("");
}

document.getElementById("qoProductList").addEventListener("click", (e) => {
  const btn = e.target.closest(".qo-order-btn");
  if (!btn) return;

  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  // Reuses the shop's existing, working "Buy Now" flow —
  // same one used from the regular product page.
  window.location.href = `checkout.html?productId=${btn.dataset.id}&qty=1`;
});


/* =====================================================
   INIT
===================================================== */

renderBrandGrid();
showStep(0);

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (!user) {
    window.location.href = "login.html";
  }
});
