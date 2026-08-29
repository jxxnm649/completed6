import { auth, db } from "./firebase.js";

import { raiseAdminAlert } from "./admin-alerts.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  addDoc,
  increment,
  collection,
  getDocs,
  query,
  where,
  limit,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const productDiv = document.getElementById("product");

const params = new URLSearchParams(window.location.search);
const productId = params.get("id");

let currentUser = null;
let currentQty = 1;
let productData = null;
let userHasLiked = false;
let recentlyViewedTracked = false;

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateCartBadge();
  checkLikedStatus();
  trackRecentlyViewed();
});

document.getElementById("cartIconWrap")?.addEventListener("click", () => {
  window.location.href = "cart.html";
});

loadProduct();

/* ---------------- Cart badge ---------------- */

async function updateCartBadge() {
  const badge = document.getElementById("pdCartBadge");
  if (!badge || !currentUser) return;
  try {
    const snap = await getDocs(collection(db, "users", currentUser.uid, "cart"));
    const count = snap.docs.reduce((sum, d) => sum + (d.data().qty || 1), 0);
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
  } catch (e) { /* ignore */ }
}

function deliveryEstimateText() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  const options = { weekday: "short", day: "numeric", month: "short" };
  return d.toLocaleDateString("en-IN", options);
}

/* ---------------- Recently viewed (for the Account hub strip) ---------------- */

async function trackRecentlyViewed() {

  if (!currentUser || !productData || recentlyViewedTracked) return;
  recentlyViewedTracked = true;

  try {

    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);

    let recent = (userSnap.exists() && Array.isArray(userSnap.data().recentlyViewed))
      ? userSnap.data().recentlyViewed
      : [];

    recent = recent.filter(r => r.productId !== productId);
    recent.unshift({
      productId,
      productName: productData.productName || "",
      image: productData.image || "",
      price: productData.price || 0,
      viewedAt: new Date().toISOString()
    });
    recent = recent.slice(0, 10);

    await updateDoc(userRef, { recentlyViewed: recent });

  } catch (error) {
    console.error("Recently viewed tracking error:", error);
  }

}

function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

/* ---------------- Icons ---------------- */

const ICONS = {
  like: `<svg class="like-symbol" viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14Z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`,
  comments: `<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  share: `<svg viewBox="0 0 24 24"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>`,
  truck: `<svg viewBox="0 0 24 24"><rect x="1" y="6" width="15" height="12" rx="1"/><path d="M16 10h4l3 3v5h-7z"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></svg>`,
  returns: `<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>`,
  shield: `<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>`,
  cart: `<svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/></svg>`
};

/* ---------------- Load product ---------------- */

async function loadProduct() {

  try {

    const productRef = doc(db, "products", productId);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      productDiv.innerHTML = "<h2 style='padding:20px;'>Product Not Found</h2>";
      return;
    }

    productData = productSnap.data();
    const product = productData;

    trackRecentlyViewed();

    const hasStock = typeof product.stock === "number";
    const outOfStock = hasStock && product.stock === 0;

    const mrp = Number(product.mrp) || 0;
    const price = Number(product.price) || 0;
    const hasDiscount = mrp > price;
    const pct = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;

    const images = (product.images && product.images.length) ? product.images : [product.image];
    const likeCount = Number(product.likes) || 0;

    productDiv.innerHTML = `

  <div class="image-wrapper">
    <div class="image-container" id="imageContainer">
      <img id="pdMainImage" src="${images[0]}" alt="${product.productName}" style="cursor:zoom-in;">
    </div>
  </div>

  <div class="pd-lightbox" id="pdLightbox">
    <button type="button" class="pd-lightbox-close" id="pdLightboxClose" aria-label="Close">✕</button>
    <img id="pdLightboxImg" src="" alt="${product.productName}">
  </div>

  ${images.length > 1 ? `
  <div class="similar-section">
    <p class="similar-title">${images.length} Similar Products</p>
    <div class="thumbnail-group" id="thumbGroup">
      ${images.map((img, i) => `
        <div class="thumb-box${i === 0 ? " active" : ""}" data-src="${img}">
          <img src="${img}" alt="${product.productName} ${i + 1}">
        </div>
      `).join("")}
    </div>
  </div>` : ""}

  <div class="details-section">
    <p class="product-title">${product.productName}</p>

    <div class="horizontal-action-bar">
      <div class="action-btn-big" id="likeBtn">
        ${ICONS.like}
        <span id="likeLabel">${likeCount} Likes</span>
      </div>
      <div class="action-btn-big" id="commentsBtn">
        ${ICONS.comments}
        <span>Comments</span>
      </div>
      <div class="action-btn-big" id="shareBtn">
        ${ICONS.share}
        <span>Share</span>
      </div>
    </div>

    <div class="price-row">
      <span class="current-price">₹${price}</span>
      ${hasDiscount ? `<span class="original-price">₹${mrp}</span><span class="discount">${pct}% off</span>` : ""}
    </div>
    ${hasDiscount ? `<div class="offer-tag">✓ UPI Offer applied for you!!</div>` : ""}
  </div>

  <div class="service-section">
    <div class="service-card full-width">
      ${ICONS.truck}
      <div class="service-info-horizontal">
        <span class="service-title">Expected Delivery</span>
        <span class="service-sub">${outOfStock ? "Currently unavailable" : `By ${deliveryEstimateText()}`}</span>
      </div>
    </div>
    <div class="service-grid-2">
      <div class="service-card">
        ${ICONS.returns}
        <div class="service-info">
          <span class="service-title">${product.returnPolicy || "7 Days Return"}</span>
          <span class="service-sub">${product.returnPolicy === "No Return" ? "Sale is Final" : "Easy Replacement"}</span>
        </div>
      </div>
      <div class="service-card">
        ${ICONS.shield}
        <div class="service-info">
          <span class="service-title">${product.warranty || "6 Month Warranty"}</span>
          <span class="service-sub">${product.warranty === "No Warranty" ? "As-is Product" : "Brand Cover"}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="content-box">
    <p class="section-heading">Description</p>
    <p class="description-text">${product.description || ""}</p>
  </div>

  ${buildAdditionalDetailsHTML(product)}

  <div class="content-box" id="commentsSection">
    <p class="section-heading" id="commentsHeading">Comments</p>
    <div id="commentsList"><p class="description-text">Loading comments…</p></div>
    <div id="commentFormWrap"></div>
  </div>

  <div id="relatedSection"></div>
  <div id="likedSection"></div>
`;

    /* Thumbnails */
    if (images.length > 1) {
      document.getElementById("thumbGroup").addEventListener("click", (e) => {
        const box = e.target.closest(".thumb-box");
        if (!box) return;
        document.getElementById("pdMainImage").src = box.dataset.src;
        document.querySelectorAll(".thumb-box").forEach(t => t.classList.remove("active"));
        box.classList.add("active");
      });
    }

    /* Swipe left/right on the main image to move through the gallery */
    if (images.length > 1) {

      const imageContainer = document.getElementById("imageContainer");
      let touchStartX = 0;

      imageContainer.addEventListener("touchstart", (e) => {
        touchStartX = e.changedTouches[0].clientX;
      }, { passive: true });

      imageContainer.addEventListener("touchend", (e) => {

        const touchEndX = e.changedTouches[0].clientX;
        const diff = touchEndX - touchStartX;

        if (Math.abs(diff) < 40) return; // ignore small taps/scrolls

        const thumbs = Array.from(document.querySelectorAll(".thumb-box"));
        const currentSrc = document.getElementById("pdMainImage").src;
        let currentIndex = images.findIndex(img => currentSrc.endsWith(img) || img.endsWith(currentSrc));
        if (currentIndex === -1) currentIndex = 0;

        const nextIndex = diff < 0
          ? Math.min(currentIndex + 1, images.length - 1)
          : Math.max(currentIndex - 1, 0);

        if (nextIndex === currentIndex) return;

        document.getElementById("pdMainImage").src = images[nextIndex];
        thumbs.forEach(t => t.classList.remove("active"));
        if (thumbs[nextIndex]) thumbs[nextIndex].classList.add("active");

      }, { passive: true });

    }

    /* Fullscreen image view on tap */
    const pdLightbox = document.getElementById("pdLightbox");
    const pdLightboxImg = document.getElementById("pdLightboxImg");

    document.getElementById("pdMainImage").addEventListener("click", () => {
      pdLightboxImg.src = document.getElementById("pdMainImage").src;
      pdLightbox.classList.add("open");
    });

    document.getElementById("pdLightboxClose").addEventListener("click", () => {
      pdLightbox.classList.remove("open");
    });

    pdLightbox.addEventListener("click", (e) => {
      if (e.target === pdLightbox) pdLightbox.classList.remove("open");
    });

    /* Like button (unified with Wishlist) */
    document.getElementById("likeBtn").addEventListener("click", toggleLike);
    checkLikedStatus();

    /* Comments button -> scroll to comments section */
    document.getElementById("commentsBtn").addEventListener("click", () => {
      document.getElementById("commentsSection").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    /* Share button */
    document.getElementById("shareBtn").addEventListener("click", () => shareProduct(product));

    /* Bottom bar (Add/Qty/Buy) */
    renderBottomBar(outOfStock, hasStock ? product.stock : 9);

    loadComments();
    loadRelatedProducts(product.category);
    loadLikedProducts();

  } catch (error) {

    alert(error.message);
    console.log(error);

  }

}

/* ---------------- Additional Details table ---------------- */

function buildAdditionalDetailsHTML(product) {
  const rows = [];

  if (product.additionalDetails && typeof product.additionalDetails === "object") {
    Object.entries(product.additionalDetails).forEach(([label, value]) => {
      rows.push({ label, value });
    });
  } else {
    if (product.material) rows.push({ label: "Material", value: product.material });
    if (product.returnPolicy) rows.push({ label: "Return Policy", value: product.returnPolicy });
    if (product.warranty) rows.push({ label: "Warranty", value: product.warranty });
  }

  if (rows.length === 0) return "";

  return `
  <div class="content-box">
    <p class="section-heading">Additional Details</p>
    <table class="details-table">
      ${rows.map(r => `
        <tr>
          <td class="label">${r.label}</td>
          <td class="value">${r.value}</td>
        </tr>
      `).join("")}
    </table>
  </div>`;
}

/* ---------------- Likes (unified with Wishlist) ---------------- */
/* Uses the SAME collection as the site-wide Wishlist: users/{uid}/wishlist/{productId} */

async function checkLikedStatus() {
  const likeBtn = document.getElementById("likeBtn");
  if (!likeBtn) return;

  if (!currentUser) {
    userHasLiked = false;
    likeBtn.classList.remove("active-like");
    return;
  }

  try {
    const wishlistRef = doc(db, "users", currentUser.uid, "wishlist", productId);
    const wishlistSnap = await getDoc(wishlistRef);
    userHasLiked = wishlistSnap.exists();
    likeBtn.classList.toggle("active-like", userHasLiked);
  } catch (e) { /* ignore */ }
}

async function toggleLike() {
  if (!currentUser) {
    alert("Please Login First");
    window.location.href = "login.html";
    return;
  }

  const likeBtn = document.getElementById("likeBtn");
  const likeLabel = document.getElementById("likeLabel");
  const wishlistRef = doc(db, "users", currentUser.uid, "wishlist", productId);
  const productRef = doc(db, "products", productId);

  try {
    if (userHasLiked) {
      await deleteDoc(wishlistRef);
      await updateDoc(productRef, { likes: increment(-1) });
      userHasLiked = false;
      likeBtn.classList.remove("active-like");
    } else {
      const productSnap = await getDoc(productRef);
      await setDoc(wishlistRef, productSnap.data());
      await updateDoc(productRef, { likes: increment(1) });
      userHasLiked = true;
      likeBtn.classList.add("active-like");

      raiseAdminAlert("like", `${currentUser.displayName || currentUser.email || "A user"} liked ${productData?.productName || "a product"}`, {
        userId: currentUser.uid,
        productId
      });
    }

    const freshSnap = await getDoc(productRef);
    const newCount = Number(freshSnap.data().likes) || 0;
    likeLabel.textContent = `${newCount} Likes`;

    loadLikedProducts();

  } catch (error) {
    console.log(error);
  }
}

/* ---------------- Share ---------------- */

async function shareProduct(product) {
  const shareUrl = window.location.href;
  const shareData = {
    title: product.productName,
    text: `Check out ${product.productName} on Bestify`,
    url: shareUrl
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(shareUrl);
      alert("Link copied to clipboard 🔗");
    }
  } catch (e) { /* user cancelled share, ignore */ }
}

/* ---------------- Comments (only for users who received a Delivered order of this product) ---------------- */

async function userCanComment() {
  if (!currentUser) return false;

  try {
    const q = query(
      collection(db, "orders"),
      where("userId", "==", currentUser.uid),
      where("status", "==", "Delivered")
    );
    const snap = await getDocs(q);

    return snap.docs.some((docSnap) => {
      const products = docSnap.data().products || [];
      return products.some((p) => p.id === productId);
    });

  } catch (error) {
    console.log(error);
    return false;
  }
}

async function loadComments() {
  const listEl = document.getElementById("commentsList");
  const formWrap = document.getElementById("commentFormWrap");
  const heading = document.getElementById("commentsHeading");
  if (!listEl) return;

  try {
    const q = query(
      collection(db, "products", productId, "comments"),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);

    heading.textContent = `Comments (${snap.size})`;

    if (snap.empty) {
      listEl.innerHTML = `<p class="description-text">No comments yet. Be the first to share your experience!</p>`;
    } else {
      listEl.innerHTML = snap.docs.map((d) => {
        const c = d.data();
        return `
          <div style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
            <p style="font-size:14px;font-weight:700;color:#222;">${c.userName || "Customer"}</p>
            <p style="font-size:12px;color:#999;margin-bottom:4px;">${formatDate(c.createdAt)}</p>
            <p class="description-text">${c.text}</p>
          </div>
        `;
      }).join("");
    }

  } catch (error) {
    console.log(error);
    listEl.innerHTML = "";
  }

  renderCommentForm(formWrap);
}

async function renderCommentForm(formWrap) {
  if (!formWrap) return;

  if (!currentUser) {
    formWrap.innerHTML = `<p class="description-text" style="margin-top:10px;">Login and receive this product to leave a comment.</p>`;
    return;
  }

  const canComment = await userCanComment();

  if (!canComment) {
    formWrap.innerHTML = `<p class="description-text" style="margin-top:10px;">Only customers whose order for this product has been Delivered can post a comment.</p>`;
    return;
  }

  formWrap.innerHTML = `
    <div style="margin-top:14px;">
      <textarea id="commentText" placeholder="Share your experience with this product..." style="width:100%;min-height:70px;padding:10px;border:1.5px solid #ddd;border-radius:10px;font-size:14px;font-family:inherit;resize:vertical;"></textarea>
      <button id="submitCommentBtn" style="margin-top:8px;background:#9c27b0;color:#fff;border:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">Post Comment</button>
    </div>
  `;

  document.getElementById("submitCommentBtn").addEventListener("click", async () => {
    const textEl = document.getElementById("commentText");
    const text = textEl.value.trim();
    if (!text) return;

    try {
      let userName = currentUser.displayName || "Customer";
      const userSnap = await getDoc(doc(db, "users", currentUser.uid));
      if (userSnap.exists() && userSnap.data().name) userName = userSnap.data().name;

      await addDoc(collection(db, "products", productId, "comments"), {
        userId: currentUser.uid,
        userName,
        text,
        createdAt: new Date()
      });

      textEl.value = "";
      loadComments();

    } catch (error) {
      alert(error.message);
      console.log(error);
    }
  });
}

/* ---------------- Bottom bar: Add / Qty / Buy ---------------- */

function renderBottomBar(outOfStock, maxQty) {
  const container = document.querySelector(".container");

  const bar = document.createElement("div");
  bar.className = "button-group";
  bar.innerHTML = `
    <div class="cart-action-wrapper">
      <button class="btn-add-main" id="addBtnMain" ${outOfStock ? "disabled" : ""}>
        ${ICONS.cart} ${outOfStock ? "Out of Stock" : "ADD"}
      </button>
      <div class="qty-box" id="qtyBox">
        <button class="qty-btn-action" id="qtyMinus">−</button>
        <span class="qty-number" id="qtyNumber">1</span>
        <button class="qty-btn-action" id="qtyPlus">+</button>
      </div>
    </div>
    <button class="btn-buy" id="buyNowBtn" ${outOfStock ? "disabled" : ""}>
      ${ICONS.bolt} Buy Now
    </button>
  `;
  container.appendChild(bar);

  const addBtnMain = document.getElementById("addBtnMain");
  const qtyBox = document.getElementById("qtyBox");
  const qtyNumber = document.getElementById("qtyNumber");

  addBtnMain.addEventListener("click", async () => {
    if (outOfStock) return;
    currentQty = 1;
    const ok = await addToCart(currentQty);
    if (ok) {
      addBtnMain.style.display = "none";
      qtyBox.style.display = "flex";
      qtyNumber.textContent = currentQty;
    }
  });

  document.getElementById("qtyMinus").addEventListener("click", async () => {
    if (currentQty <= 1) {
      await removeFromCart();
      currentQty = 1;
      qtyBox.style.display = "none";
      addBtnMain.style.display = "flex";
      return;
    }
    currentQty -= 1;
    qtyNumber.textContent = currentQty;
    await updateCartQty(currentQty);
  });

  document.getElementById("qtyPlus").addEventListener("click", async () => {
    if (currentQty >= maxQty) return;
    currentQty += 1;
    qtyNumber.textContent = currentQty;
    await updateCartQty(currentQty);
  });

  document.getElementById("buyNowBtn").addEventListener("click", buyNow);

  prefillCartState(addBtnMain, qtyBox, qtyNumber);
}

async function prefillCartState(addBtnMain, qtyBox, qtyNumber) {
  if (!currentUser) return;
  try {
    const cartRef = doc(db, "users", currentUser.uid, "cart", productId);
    const cartSnap = await getDoc(cartRef);
    if (cartSnap.exists()) {
      currentQty = cartSnap.data().qty || 1;
      qtyNumber.textContent = currentQty;
      addBtnMain.style.display = "none";
      qtyBox.style.display = "flex";
    }
  } catch (e) { /* ignore */ }
}

/* ---------------- Related products ---------------- */

function catalogCardHTML(p) {
  const rMrp = Number(p.mrp) || 0;
  const rPrice = Number(p.price) || 0;
  const rHasDiscount = rMrp > rPrice;
  const rPct = rHasDiscount ? Math.round(((rMrp - rPrice) / rMrp) * 100) : 0;
  const badgeText = p.tag ? p.tag : (rHasDiscount ? `${rPct}% Off` : "");

  return `
    <a class="catalog-card" href="product.html?id=${p.id}" style="text-decoration:none;">
      <div class="catalog-img-wrapper">
        <img src="${p.image}" alt="${p.productName}">
      </div>
      <div class="catalog-info">
        <p class="catalog-item-title">${p.productName}</p>
        <div class="catalog-price-row">
          <span class="catalog-price">₹${rPrice}</span>
          ${rHasDiscount ? `<span class="catalog-original">₹${rMrp}</span>` : ""}
        </div>
        ${badgeText ? `<span class="catalog-badge">${badgeText}</span>` : ""}
      </div>
    </a>
  `;
}

async function loadRelatedProducts(category) {
  const section = document.getElementById("relatedSection");
  if (!section) return;

  try {
    const q = query(
      collection(db, "products"),
      where("category", "==", category),
      limit(8)
    );
    const snap = await getDocs(q);

    const related = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.id !== productId)
      .slice(0, 4);

    if (related.length === 0) {
      section.innerHTML = "";
      return;
    }

    section.innerHTML = `
      <div class="content-box">
        <p class="section-heading">Related Products</p>
        <div class="catalog-grid">
          ${related.map(catalogCardHTML).join("")}
        </div>
      </div>
    `;
  } catch (error) {
    console.log(error);
    section.innerHTML = "";
  }
}

/* ---------------- Your Liked Products ---------------- */

async function loadLikedProducts() {
  const section = document.getElementById("likedSection");
  if (!section) return;

  if (!currentUser) {
    section.innerHTML = "";
    return;
  }

  try {
    const snap = await getDocs(collection(db, "users", currentUser.uid, "wishlist"));

    const liked = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.id !== productId)
      .slice(0, 4);

    if (liked.length === 0) {
      section.innerHTML = "";
      return;
    }

    section.innerHTML = `
      <div class="content-box">
        <p class="section-heading">Your Liked Products</p>
        <div class="catalog-grid">
          ${liked.map(catalogCardHTML).join("")}
        </div>
      </div>
    `;
  } catch (error) {
    console.log(error);
    section.innerHTML = "";
  }
}

/* ---------------- Cart actions ---------------- */

async function addToCart(qty) {
  if (!currentUser) {
    alert("Please Login First");
    window.location.href = "login.html";
    return false;
  }

  try {
    const productRef = doc(db, "products", productId);
    const productSnap = await getDoc(productRef);
    if (!productSnap.exists()) {
      alert("Product Not Found");
      return false;
    }

    const cartRef = doc(db, "users", currentUser.uid, "cart", productId);
    await setDoc(cartRef, {
      ...productSnap.data(),
      qty
    });

    updateCartBadge();
    return true;

  } catch (error) {
    alert(error.message);
    console.log(error);
    return false;
  }
}

async function updateCartQty(qty) {
  if (!currentUser) return;
  try {
    const cartRef = doc(db, "users", currentUser.uid, "cart", productId);
    await setDoc(cartRef, { qty }, { merge: true });
    updateCartBadge();
  } catch (error) {
    console.log(error);
  }
}

async function removeFromCart() {
  if (!currentUser) return;
  try {
    const cartRef = doc(db, "users", currentUser.uid, "cart", productId);
    await deleteDoc(cartRef);
    updateCartBadge();
  } catch (error) {
    console.log(error);
  }
}

function buyNow() {
  window.location.href = `checkout.html?productId=${productId}&qty=${currentQty}`;
}
