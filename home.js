import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const welcome = document.getElementById("welcome");
const productContainer = document.getElementById("productContainer");
const featuredContainer = document.getElementById("featuredContainer");
const featuredTitle = document.getElementById("featuredTitle");
const categoryBar = document.getElementById("categoryBar");
const searchInput = document.getElementById("searchInput");
const bannerTrack = document.getElementById("bannerTrack");
const bannerDots = document.getElementById("bannerDots");

let allProducts = [];
let activeCategory = "All";

// User Details
onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {

    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {

      const data = docSnap.data();

      if (welcome) welcome.innerHTML = `👋 Welcome <b>${data.name}</b>`;

    } else {

      if (welcome) welcome.innerHTML = `👋 Welcome <b>${user.email}</b>`;

    }

  } catch (error) {

    console.log(error);

    if (welcome) welcome.innerHTML = `👋 Welcome <b>${user.email}</b>`;

  }

});

// ---------- Banner Slider ----------
const banners = [
  { cls: "b1", title: "Bestify Days 🎉", text: "Fresh drops added every week" },
  { cls: "b2", title: "Up to 40% Off", text: "On our top rated picks" },
  { cls: "b3", title: "Free Delivery", text: "On your first order today" }
];

function renderBanner() {
  if (!bannerTrack || !bannerDots) return;

  bannerTrack.innerHTML = banners.map(b => `
    <div class="banner-slide ${b.cls}">
      <h3>${b.title}</h3>
      <p>${b.text}</p>
    </div>
  `).join("");

  bannerDots.innerHTML = banners.map((_, i) =>
    `<span data-i="${i}" class="${i === 0 ? "active" : ""}"></span>`
  ).join("");
}

let bannerIndex = 0;
function goToBanner(i) {
  if (!bannerTrack || !bannerDots) return;
  bannerIndex = i;
  bannerTrack.style.transform = `translateX(-${i * 100}%)`;
  [...bannerDots.children].forEach((dot, idx) =>
    dot.classList.toggle("active", idx === i)
  );
}

function startBannerAuto() {
  if (!bannerTrack || !bannerDots) return;
  setInterval(() => {
    goToBanner((bannerIndex + 1) % banners.length);
  }, 4000);
}

if (bannerTrack && bannerDots) {
  renderBanner();
  goToBanner(0);
  startBannerAuto();

  bannerDots.addEventListener("click", (e) => {
    if (e.target.dataset.i !== undefined) {
      goToBanner(Number(e.target.dataset.i));
    }
  });
}

// ---------- Skeleton ----------
function renderSkeletons(container, count = 4) {
  container.innerHTML = Array.from({ length: count }).map(() => `
    <div class="skeleton-card">
      <div class="skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton-line w60"></div>
        <div class="skeleton-line w40"></div>
      </div>
    </div>
  `).join("");
}

// ---------- Product card (Bestify card design) ----------
function productCardHTML(p) {
  const hasStock = typeof p.stock === "number";
  const outOfStock = hasStock && p.stock === 0;
  const lowStock = hasStock && p.stock > 0 && p.stock <= 5;

  const mrp = Number(p.mrp) || 0;
  const price = Number(p.price) || 0;
  const hasDiscount = mrp > price;
  const pct = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;

  return `
    <div class="bf-card" data-id="${p.id}">
      ${hasDiscount ? `<span class="bf-sale-badge">${pct}% OFF</span>` : ""}

      <div class="bf-carousel">
        <img src="${p.image}" alt="${p.productName}">
      </div>

      <h2 class="bf-title">${p.productName}</h2>

      <div class="bf-price-section">
        <div class="bf-price-row">
          ${hasDiscount ? `<span class="bf-original-price">₹${mrp}</span>` : ""}
          <span class="bf-current-price">₹${price}</span>
        </div>
        ${hasStock ? `<span class="stock-badge ${outOfStock ? "out" : lowStock ? "low" : "in"}" style="margin-top:6px;display:inline-block;">
          ${outOfStock ? "Out of Stock" : lowStock ? `Only ${p.stock} left` : "In Stock"}
        </span>` : ""}
      </div>

      <div class="bf-button-group">
        <button class="bf-btn-cart" data-id="${p.id}" ${outOfStock ? "disabled" : ""}>🛒 Add</button>
        <button class="bf-btn-buy" data-id="${p.id}" ${outOfStock ? "disabled" : ""}>${outOfStock ? "Out of Stock" : "Buy Now"}</button>
      </div>
    </div>
  `;
}

// ---------- Add to cart (from card) ----------
async function handleAddToCart(id) {

  const user = auth.currentUser;

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {

    const productRef = doc(db, "products", id);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) return;

    const cartRef = doc(db, "users", user.uid, "cart", id);
    const cartSnap = await getDoc(cartRef);
    const qty = cartSnap.exists() ? (cartSnap.data().qty || 1) + 1 : 1;

    await setDoc(cartRef, { ...productSnap.data(), qty });

    alert("Added to Cart ✅");

  } catch (error) {
    console.log(error);
    alert(error.message);
  }

}

function attachCardEvents(container) {
  container.addEventListener("click", (e) => {

    const cartBtn = e.target.closest(".bf-btn-cart");
    if (cartBtn) {
      e.stopPropagation();
      handleAddToCart(cartBtn.dataset.id);
      return;
    }

    const buyBtn = e.target.closest(".bf-btn-buy");
    if (buyBtn) {
      e.stopPropagation();
      window.location.href = `checkout.html?productId=${buyBtn.dataset.id}`;
      return;
    }

    const card = e.target.closest(".bf-card");
    if (card) {
      window.location.href = `product.html?id=${card.dataset.id}`;
    }

  });
}

attachCardEvents(productContainer);
attachCardEvents(featuredContainer);

// ---------- Category chips ----------
const categoryIcons = {
  all: "fa-solid fa-border-all",
  speaker: "fa-solid fa-volume-high",
  cover: "fa-solid fa-mobile-screen-button",
  covers: "fa-solid fa-mobile-screen-button",
  case: "fa-solid fa-mobile-screen-button",
  cases: "fa-solid fa-mobile-screen-button",
  charger: "fa-solid fa-bolt",
  chargers: "fa-solid fa-bolt",
  cable: "fa-solid fa-plug",
  cables: "fa-solid fa-plug",
  earphone: "fa-solid fa-headphones",
  earphones: "fa-solid fa-headphones",
  headphone: "fa-solid fa-headphones",
  headphones: "fa-solid fa-headphones",
  battery: "fa-solid fa-battery-full",
  batteries: "fa-solid fa-battery-full",
  watch: "fa-solid fa-clock",
  watches: "fa-solid fa-clock",
  mobile: "fa-solid fa-mobile",
  mobiles: "fa-solid fa-mobile",
  accessory: "fa-solid fa-tags",
  accessories: "fa-solid fa-tags"
};

function iconForCategory(c) {
  return categoryIcons[String(c).toLowerCase()] || "fa-solid fa-tag";
}

function normalizeText(str) {
  return String(str || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function renderCategories(products) {
  // De-dupe categories ignoring case/whitespace (e.g. "Cover" and "cover " are the same chip)
  const seen = new Map();
  products.forEach(p => {
    const raw = (p.category || "").toString().replace(/\s+/g, " ").trim();
    if (!raw) return;
    const key = normalizeText(raw);
    if (!seen.has(key)) seen.set(key, raw);
  });

  const categories = ["All", ...seen.values()];

  categoryBar.innerHTML = categories.map(c => `
    <div class="category-chip ${normalizeText(c) === normalizeText(activeCategory) ? "active" : ""}" data-cat="${c}">
      <i class="${iconForCategory(c)}"></i><span>${c}</span>
    </div>
  `).join("");
}

categoryBar.addEventListener("click", (e) => {
  const chip = e.target.closest(".category-chip");
  if (!chip) return;
  activeCategory = chip.dataset.cat;
  renderCategories(allProducts);
  applyFilters();
});

// ---------- Search ----------
searchInput.addEventListener("input", applyFilters);

function applyFilters() {
  const term = searchInput.value.trim().toLowerCase();

  const filtered = allProducts.filter(p => {
    const matchesCategory = normalizeText(activeCategory) === "all"
      || normalizeText(p.category) === normalizeText(activeCategory);
    const matchesSearch = !term
      || (p.productName || "").toLowerCase().includes(term)
      || (p.description || "").toLowerCase().includes(term)
      || (p.category || "").toLowerCase().includes(term);
    return matchesCategory && matchesSearch;
  });

  // Hide Best Sellers while actively searching or filtering by category,
  // so an unrelated row of items doesn't make it look like the filter
  // isn't working.
  if (featuredTitle && featuredContainer) {
    const show = !term && activeCategory === "All" && featured_cache.length > 0;
    featuredTitle.style.display = show ? "block" : "none";
    featuredContainer.style.display = show ? "grid" : "none";
  }

  if (filtered.length === 0) {
    productContainer.innerHTML = `<p class="no-results">No products found 😔</p>`;
    return;
  }

  productContainer.innerHTML = filtered.map(productCardHTML).join("");
}

let featured_cache = [];

// ---------- Load Products ----------
async function loadProducts() {

  renderSkeletons(productContainer, 4);

  try {

    const snapshot = await getDocs(collection(db, "products"));

    console.log("Products Found :", snapshot.size);

    if (snapshot.empty) {
      productContainer.innerHTML = `<p class="no-results">No Products Found</p>`;
      return;
    }

    allProducts = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(p => p.status !== "Inactive") // Hide vendor/admin-paused products from the storefront
      .filter(p => p.approvalStatus !== "Pending" && p.approvalStatus !== "Rejected"); // Hide vendor submissions awaiting admin review

    renderCategories(allProducts);

    // Featured / Best Sellers: top 4 products
    featured_cache = allProducts.slice(0, 4);
    if (featured_cache.length > 0) {
      featuredTitle.style.display = "block";
      featuredContainer.innerHTML = featured_cache.map(productCardHTML).join("");
    }

    applyFilters();

  } catch (error) {

    console.log(error);

    productContainer.innerHTML = `<p class="no-results">Error loading products</p>`;

  }

}

loadProducts();
