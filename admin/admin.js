/* ============================================================
   Bestify Admin Panel
   Firebase Auth Guard + Dashboard Metrics
   ============================================================ */

import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  openModal,
  closeModal,
  showToast
} from "../design-system.js";

import { logAdminAction } from "./audit.js";


/* ============================================================
   GLOBAL SEARCH STATE
   (users/orders are cached from loadDashboardMetrics;
   products are fetched lazily on first search)
   ============================================================ */

let searchUsersCache = [];
let searchOrdersCache = [];
let searchProductsCache = null; // null = not fetched yet

const STATUS_OPTIONS = [
  "Pending", "Confirmed", "Packed", "Shipped",
  "Out for Delivery", "Delivered", "Cancelled"
];

let currentOrderDetailsId = null;


/* ============================================================
   ELEMENT REFS
   ============================================================ */

const initialLoadingState =
  document.getElementById("initialLoadingState");

const authRequiredState =
  document.getElementById("authRequiredState");

const accessDeniedState =
  document.getElementById("accessDeniedState");

const errorState =
  document.getElementById("errorState");

const errorStateText =
  document.getElementById("errorStateText");

const errorRetryBtn =
  document.getElementById("errorRetryBtn");

const adminShell =
  document.getElementById("adminShell");

const adminNav =
  document.getElementById("adminNav");

const userName =
  document.getElementById("userName");

const userEmail =
  document.getElementById("userEmail");

const userAvatar =
  document.getElementById("userAvatar");

const hamburgerBtn =
  document.getElementById("hamburgerBtn");

const drawerOverlay =
  document.getElementById("drawerOverlay");

const profileBtn =
  document.getElementById("profileBtn");

const profileMenu =
  document.getElementById("profileMenu");

const logoutBtn =
  document.getElementById("logoutBtn");


/* ============================================================
   DASHBOARD REFS
   ============================================================ */

const usersCount =
  document.getElementById("usersCount");

const vendorsCount =
  document.getElementById("vendorsCount");

const ordersCount =
  document.getElementById("ordersCount");

const revenueTotal =
  document.getElementById("revenueTotal");


/* ============================================================
   NAVIGATION
   ============================================================ */

const NAV_ITEMS = [

  {
    id: "dashboard",
    label: "Dashboard",
    icon: "📊",
    permission: null,
    active: true
  },

  {
    id: "users",
    label: "Users",
    icon: "👥",
    permission: "users",
    ready: true
  },

  {
    id: "vendors",
    label: "Vendors",
    icon: "🏬",
    permission: "vendors",
    ready: true
  },

  {
    id: "products",
    label: "Products",
    icon: "📦",
    permission: "products",
    ready: true
  },

  {
    id: "orders",
    label: "Orders",
    icon: "🧾",
    permission: "orders",
    ready: true
  },

  {
    id: "payments",
    label: "Payments",
    icon: "💳",
    permission: "payments",
    ready: true
  },

  {
    id: "refunds",
    label: "Refunds",
    icon: "↩️",
    permission: "refunds",
    ready: true
  },

  {
    id: "wallets",
    label: "Wallets",
    icon: "👛",
    permission: "wallets",
    ready: true
  },

  {
    id: "withdrawals",
    label: "Withdrawals",
    icon: "🏧",
    permission: "wallets",
    ready: true
  },

  {
    id: "feedback",
    label: "Feedback",
    icon: "📝",
    permission: null,
    ready: true
  },

  {
    id: "alerts",
    label: "Activity",
    icon: "🔴",
    permission: null,
    ready: true
  },

  {
    id: "commissions",
    label: "Commissions",
    icon: "🧮",
    permission: "commissions",
    ready: true
  },

  {
    id: "cashback",
    label: "Cashback",
    icon: "💸",
    permission: "cashback",
    ready: true
  },

  {
    id: "referrals",
    label: "Referrals",
    icon: "🔗",
    permission: "referrals",
    ready: true
  },

  {
    id: "repairs",
    label: "Repairs",
    icon: "🔧",
    permission: "repairs",
    ready: true
  },

  {
    id: "chats",
    label: "Chats",
    icon: "💬",
    permission: "chats",
    ready: true
  },

  {
    id: "notifications",
    label: "Notifications",
    icon: "🔔",
    permission: "notifications",
    ready: true
  },

  {
    id: "reports",
    label: "Reports",
    icon: "📈",
    permission: "reports",
    ready: true
  },

  {
    id: "audit-log",
    label: "Audit Log",
    icon: "🗂️",
    permission: "auditLog",
    ready: true
  },

  {
    id: "settings",
    label: "Settings",
    icon: "⚙️",
    permission: "settings",
    ready: true
  }

];


/* ============================================================
   STATE HELPERS
   ============================================================ */

function hideAllStates() {

  [
    initialLoadingState,
    authRequiredState,
    accessDeniedState,
    errorState,
    adminShell
  ].forEach(el => {

    if (el) {
      el.classList.add("bf-hidden");
    }

  });

}


function showAuthRequired() {

  hideAllStates();

  authRequiredState.classList.remove(
    "bf-hidden"
  );

}


function showAccessDenied() {

  hideAllStates();

  accessDeniedState.classList.remove(
    "bf-hidden"
  );

}


function showError(message) {

  hideAllStates();

  errorStateText.textContent =
    message || "Please try again.";

  errorState.classList.remove(
    "bf-hidden"
  );

}


function showShell() {

  hideAllStates();

  adminShell.classList.remove(
    "bf-hidden"
  );

}


/* ============================================================
   RENDER NAVIGATION
   ============================================================ */

function renderNav(claims) {

  const hasGranularPermissions =
    claims &&
    claims.permissions &&
    typeof claims.permissions === "object";

  const isAllowed = (item) =>
    item.permission === null
      ? true
      : hasGranularPermissions
        ? claims.permissions[item.permission] === true
        : true;

  const vendorsItem = NAV_ITEMS.find(i => i.id === "vendors");
  const commissionsItem = NAV_ITEMS.find(i => i.id === "commissions");

  adminNav.innerHTML =
    NAV_ITEMS.map(item => {

      // "vendors" and "commissions" are rendered together as one
      // collapsible "Vendor" group instead of two flat items.
      if (item.id === "commissions") return "";

      if (item.id === "vendors") {

        if (!isAllowed(vendorsItem) && !isAllowed(commissionsItem)) return "";

        const currentPage = "index.html";
        const groupOpen = false; // dashboard is never vendors.html/commissions.html itself

        return `
          <div class="bf-admin-nav-group${groupOpen ? " open" : ""}">
            <button
              type="button"
              class="bf-admin-nav-item bf-admin-nav-group-toggle"
              data-nav-toggle="vendor-group">
              <span class="bf-admin-nav-icon">🏬</span>
              <span>Vendor</span>
              <span class="bf-admin-nav-caret">▾</span>
            </button>
            <div class="bf-admin-nav-submenu">
              ${isAllowed(vendorsItem) ? `
                <button type="button" class="bf-admin-nav-subitem" data-nav="vendors">
                  📋 <span>Applications &amp; Directory</span>
                </button>
              ` : ""}
              <button type="button" class="bf-admin-nav-subitem" data-nav="pending-products">
                🕓 <span>Pending Products</span>
              </button>
              ${isAllowed(commissionsItem) ? `
                <button type="button" class="bf-admin-nav-subitem" data-nav="commissions">
                  🧮 <span>Commissions</span>
                </button>
              ` : ""}
            </div>
          </div>
        `;

      }

      const allowed = isAllowed(item);

      if (!allowed) {
        return "";
      }


      const activeClass =
        item.active
          ? "bf-admin-nav-active"
          : "";

      const isReady =
        item.active || item.ready === true;


      return `

        <button
          type="button"
          class="bf-admin-nav-item ${activeClass}"
          data-nav="${item.id}">

          <span class="bf-admin-nav-icon">
            ${item.icon}
          </span>

          <span>
            ${item.label}
          </span>

          ${
            isReady
              ? ""
              : `<span class="bf-admin-nav-soon">
                   Soon
                 </span>`
          }

        </button>

      `;

    }).join("");

}


/* ============================================================
   DASHBOARD DATA
   ============================================================ */

async function loadDashboardMetrics() {

  try {

    /* ---------- USERS ---------- */

    const usersSnapshot =
      await getDocs(
        collection(db, "users")
      );


    usersCount.textContent =
      usersSnapshot.size;

    searchUsersCache = usersSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));


    /* ---------- ORDERS ---------- */

    const ordersSnapshot =
      await getDocs(
        collection(db, "orders")
      );


    ordersCount.textContent =
      ordersSnapshot.size;

    searchOrdersCache = ordersSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));


    /* ---------- VENDORS ---------- */

    const vendorsSnapshot =
      await getDocs(
        collection(db, "vendors")
      );


    vendorsCount.textContent =
      vendorsSnapshot.size;


    /* ---------- REVENUE ---------- */

    let revenue = 0;


    ordersSnapshot.forEach(orderDoc => {

      const orderData =
        orderDoc.data();


      const status =
        String(
          orderData.status || ""
        ).toLowerCase();


      if (status !== "delivered") {
        return;
      }


      const products =
        Array.isArray(orderData.products)
          ? orderData.products
          : [];


      products.forEach(product => {

        const price =
          Number(
            String(
              product.price || "0"
            )
            .replace(/[₹,\s]/g, "")
          );


        if (!Number.isNaN(price)) {

          revenue += price;

        }

      });

    });


    revenueTotal.textContent =
      "₹" +
      revenue.toLocaleString("en-IN");


    /* ---------- PENDING ORDERS ---------- */

    const pendingOrders = ordersSnapshot.docs.filter(d => {
      const s = String(d.data().status || "").toLowerCase();
      return s === "" || s === "pending" || s === "confirmed";
    }).length;

    const pendingOrdersEl = document.getElementById("pendingOrdersCount");
    if (pendingOrdersEl) pendingOrdersEl.textContent = pendingOrders;


    /* ---------- PENDING VENDOR PRODUCTS ---------- */

    try {
      const pendingProductsSnapshot = await getDocs(
        query(collection(db, "products"), where("approvalStatus", "==", "Pending"))
      );
      const pendingProductsEl = document.getElementById("pendingProductsCount");
      if (pendingProductsEl) pendingProductsEl.textContent = pendingProductsSnapshot.size;
    } catch (err) {
      console.error("Pending products metric error:", err);
    }


    /* ---------- RECENT ORDERS ---------- */

    const recentOrdersEl = document.getElementById("recentOrdersList");
    if (recentOrdersEl) {

      const sorted = ordersSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
          const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
          return tb - ta;
        })
        .slice(0, 5);

      recentOrdersEl.innerHTML = sorted.length
        ? sorted.map(o => {

            const products = Array.isArray(o.products) ? o.products : [];
            const firstProduct = products[0] || {};
            const extraCount = products.length > 1 ? products.length - 1 : 0;

            return `
              <div class="bf-admin-recent-order-row" data-order-id="${o.id}">

                <img
                  class="bf-admin-recent-order-thumb"
                  src="${escapeSearchHtml(firstProduct.image || "")}"
                  alt="${escapeSearchHtml(firstProduct.productName || "Product")}"
                  onerror="this.style.visibility='hidden'">

                <div class="bf-admin-recent-order-info">
                  <div class="bf-admin-recent-order-title">
                    #${escapeSearchHtml(o.orderNumber || o.id.slice(0, 8).toUpperCase())} — ${escapeSearchHtml(o.customerName || "Customer")}
                  </div>
                  <div class="bf-admin-recent-order-sub">
                    ${escapeSearchHtml(firstProduct.productName || "")}${extraCount ? ` +${extraCount} more` : ""}
                  </div>
                  <div class="bf-admin-recent-order-sub">
                    ₹${o.total || 0}
                  </div>
                </div>

                <span class="bf-status-pill bf-status-pending bf-admin-recent-order-status">${escapeSearchHtml(o.status || "Pending")}</span>

              </div>
            `;

          }).join("")
        : `<div style="padding:10px 0;opacity:.6;font-size:13px;">No orders yet.</div>`;

    }


    console.log(
      "Dashboard loaded:",
      {
        users: usersSnapshot.size,
        vendors: vendorsSnapshot.size,
        orders: ordersSnapshot.size,
        revenue: revenue
      }
    );


  } catch (error) {

    console.error(
      "Dashboard metrics error:",
      error
    );


    if (usersCount) {
      usersCount.textContent = "—";
    }

    if (vendorsCount) {
      vendorsCount.textContent = "—";
    }

    if (ordersCount) {
      ordersCount.textContent = "—";
    }

    if (revenueTotal) {
      revenueTotal.textContent = "—";
    }


    showToast(
      "Unable to load dashboard data",
      "danger"
    );

  }

}


/* ============================================================
   DRAWER
   ============================================================ */

function openDrawer() {

  adminShell.classList.add(
    "bf-admin-drawer-open"
  );

  hamburgerBtn.setAttribute(
    "aria-expanded",
    "true"
  );

}


function closeDrawer() {

  adminShell.classList.remove(
    "bf-admin-drawer-open"
  );

  hamburgerBtn.setAttribute(
    "aria-expanded",
    "false"
  );

}


hamburgerBtn.addEventListener(
  "click",
  () => {

    const isOpen =
      adminShell.classList.contains(
        "bf-admin-drawer-open"
      );


    if (isOpen) {

      closeDrawer();

    } else {

      openDrawer();

    }

  }
);


drawerOverlay.addEventListener(
  "click",
  closeDrawer
);


window.addEventListener(
  "resize",
  () => {

    if (window.innerWidth >= 1024) {
      closeDrawer();
    }

  }
);


/* ============================================================
   PROFILE MENU
   ============================================================ */

profileBtn.addEventListener(
  "click",
  e => {

    e.stopPropagation();


    const isOpen =
      !profileMenu.classList.contains(
        "bf-hidden"
      );


    profileMenu.classList.toggle(
      "bf-hidden",
      isOpen
    );


    profileBtn.setAttribute(
      "aria-expanded",
      String(!isOpen)
    );

  }
);


document.addEventListener(
  "click",
  e => {

    if (
      !profileMenu.contains(e.target) &&
      e.target !== profileBtn
    ) {

      profileMenu.classList.add(
        "bf-hidden"
      );

      profileBtn.setAttribute(
        "aria-expanded",
        "false"
      );

    }

  }
);


/* ============================================================
   LOGOUT
   ============================================================ */

logoutBtn.addEventListener(
  "click",
  async () => {

    logoutBtn.disabled = true;


    try {

      await signOut(auth);


      showToast(
        "Logged out successfully",
        "success"
      );


      window.location.href =
        "../login.html";


    } catch (error) {

      logoutBtn.disabled = false;


      showToast(
        error.message ||
        "Logout failed",
        "danger"
      );

    }

  }
);


/* ============================================================
   NAVIGATION CLICK
   ============================================================ */

adminNav.addEventListener(
  "click",
  e => {

    const toggleBtn =
      e.target.closest(
        "[data-nav-toggle]"
      );

    if (toggleBtn) {
      toggleBtn.closest(".bf-admin-nav-group").classList.toggle("open");
      return;
    }

    const btn =
      e.target.closest(
        ".bf-admin-nav-item, .bf-admin-nav-subitem"
      );


    if (!btn) {
      return;
    }


    const navId =
      btn.dataset.nav;


    /* ---------- USERS ---------- */

    if (navId === "users") {

      window.location.href =
        "users.html";

      return;

    }


    /* ---------- PRODUCTS ---------- */

    if (navId === "products") {

      window.location.href =
        "products.html";

      return;

    }


    /* ---------- ORDERS ---------- */

    if (navId === "orders") {

      window.location.href =
        "orders.html";

      return;

    }


    /* ---------- VENDORS ---------- */

    if (navId === "vendors") {

      window.location.href =
        "vendors.html";

      return;

    }


    /* ---------- PAYMENTS & REFUNDS ---------- */

    if (navId === "payments") {

      window.location.href =
        "payments.html";

      return;

    }

    if (navId === "refunds") {

      window.location.href =
        "payments.html#refunds";

      return;

    }


    /* ---------- WALLETS ---------- */

    if (navId === "wallets") {

      window.location.href =
        "wallets.html";

      return;

    }


    /* ---------- WITHDRAWALS ---------- */

    if (navId === "withdrawals") {

      window.location.href =
        "withdrawals.html";

      return;

    }


    /* ---------- FEEDBACK ---------- */

    if (navId === "feedback") {

      window.location.href =
        "feedback.html";

      return;

    }


    /* ---------- PENDING PRODUCTS ---------- */

    if (navId === "pending-products") {

      window.location.href =
        "pending-products.html";

      return;

    }


    /* ---------- ACTIVITY / ALERTS ---------- */

    if (navId === "alerts") {

      window.location.href =
        "alerts.html";

      return;

    }


    /* ---------- COMMISSIONS ---------- */

    if (navId === "commissions") {

      window.location.href =
        "commissions.html";

      return;

    }


    /* ---------- CASHBACK ---------- */

    if (navId === "cashback") {

      window.location.href =
        "cashback.html";

      return;

    }


    /* ---------- REFERRALS ---------- */

    if (navId === "referrals") {

      window.location.href =
        "referrals.html";

      return;

    }


    /* ---------- REPAIRS ---------- */

    if (navId === "repairs") {

      window.location.href =
        "repairs.html";

      return;

    }


    /* ---------- CHATS ---------- */

    if (navId === "chats") {

      window.location.href =
        "chats.html";

      return;

    }


    /* ---------- DASHBOARD ---------- */

    if (navId === "dashboard") {

      closeDrawer();

      return;

    }


    /* ---------- NOTIFICATIONS ---------- */

    if (navId === "notifications") {

      window.location.href =
        "notifications.html";

      return;

    }


    /* ---------- REPORTS ---------- */

    if (navId === "reports") {

      window.location.href =
        "reports.html";

      return;

    }


    /* ---------- AUDIT LOG ---------- */

    if (navId === "audit-log") {

      window.location.href =
        "audit-log.html";

      return;

    }


    /* ---------- SETTINGS ---------- */

    if (navId === "settings") {

      window.location.href =
        "settings.html";

      return;

    }


    /* ---------- OTHER SECTIONS ---------- */

    showToast(
      "This section is coming soon",
      "info"
    );


    closeDrawer();

  }
);


/* ============================================================
   RETRY
   ============================================================ */

errorRetryBtn.addEventListener(
  "click",
  () => {

    window.location.reload();

  }
);


/* ============================================================
   AUTH GUARD
   ============================================================ */

// Safety net: if auth check hasn't resolved to any state within
// 10s (slow/broken network, Firebase Auth not responding), stop
// showing an endless spinner and let the user retry instead.
const authWatchdog = setTimeout(() => {
  if (initialLoadingState && !initialLoadingState.classList.contains("bf-hidden")) {
    showError("Taking longer than expected to verify your login. Check your connection and retry.");
  }
}, 10000);

onAuthStateChanged(
  auth,
  async user => {

    clearTimeout(authWatchdog);

    /* ---------- NOT LOGGED IN ---------- */

    if (!user) {

      showAuthRequired();

      return;

    }


    try {

      /*
        Check admin access the same way the rest of the
        admin panel does: a Firestore `isAdmin` flag on the
        user's own document (not a Firebase custom claim —
        nothing in this project ever sets one, so that check
        could never pass).
      */

      const adminDoc =
        await getDoc(
          doc(db, "users", user.uid)
        );


      /* ---------- ADMIN CHECK ---------- */

      if (!adminDoc.exists() || adminDoc.data().isAdmin !== true) {

        showAccessDenied();

        return;

      }


      /* ---------- USER INFO ---------- */

      const displayName =
        user.displayName ||
        (
          user.email
            ? user.email.split("@")[0]
            : "Admin"
        );


      userName.textContent =
        displayName;


      userEmail.textContent =
        user.email || "";


      userAvatar.textContent =
        displayName
          .charAt(0)
          .toUpperCase();


      /* ---------- NAVIGATION ---------- */

      renderNav();


      /* ---------- SHOW ADMIN ---------- */

      showShell();


      /* ---------- LOAD DATA ---------- */

      await loadDashboardMetrics();


    } catch (error) {

      console.error(
        "Admin verification error:",
        error
      );


      showError(
        "We couldn't verify your admin access. Please try again."
      );

    }

  }
);


/* ============================================================
   GLOBAL SEARCH (Users / Products / Orders)
   ============================================================ */

const adminGlobalSearch = document.getElementById("adminGlobalSearch");
const adminSearchResults = document.getElementById("adminSearchResults");

let searchDebounceTimer = null;

function escapeSearchHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

async function ensureProductsCache() {
  if (searchProductsCache !== null) return searchProductsCache;
  try {
    const snap = await getDocs(collection(db, "products"));
    searchProductsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Search products load error:", error);
    searchProductsCache = [];
  }
  return searchProductsCache;
}

function resultRow(icon, title, subtitle, href) {
  return `
    <a href="${href}" class="bf-admin-search-row">
      <span class="bf-admin-search-row-icon">${icon}</span>
      <span class="bf-admin-search-row-text">
        <span class="bf-admin-search-row-title">${title}</span>
        <span class="bf-admin-search-row-sub">${subtitle}</span>
      </span>
    </a>
  `;
}

function resultGroup(label, rowsHtml) {
  if (!rowsHtml) return "";
  return `
    <div class="bf-admin-search-group">
      <div class="bf-admin-search-group-label">${label}</div>
      ${rowsHtml}
    </div>
  `;
}

async function runGlobalSearch(term) {

  const q = term.trim().toLowerCase();

  if (!q) {
    adminSearchResults.innerHTML = "";
    return;
  }

  await ensureProductsCache();

  const matchedUsers = searchUsersCache.filter(u => {
    const name = (u.name || u.fullName || u.displayName || "").toLowerCase();
    const phone = (u.phone || u.mobile || "").toLowerCase();
    const email = (u.email || "").toLowerCase();
    return name.includes(q) || phone.includes(q) || email.includes(q);
  }).slice(0, 5);

  const matchedProducts = (searchProductsCache || []).filter(p => {
    const name = (p.productName || "").toLowerCase();
    const category = (p.category || "").toLowerCase();
    return name.includes(q) || category.includes(q);
  }).slice(0, 5);

  const matchedOrders = searchOrdersCache.filter(o => {
    const orderNo = (o.orderNumber || o.id || "").toLowerCase();
    const customer = (o.customerName || "").toLowerCase();
    return orderNo.includes(q) || customer.includes(q);
  }).slice(0, 5);

  if (!matchedUsers.length && !matchedProducts.length && !matchedOrders.length) {
    adminSearchResults.innerHTML = `
      <div class="bf-admin-search-empty">No results for "${escapeSearchHtml(term)}"</div>
    `;
    return;
  }

  adminSearchResults.innerHTML =
    resultGroup("Users", matchedUsers.map(u =>
      resultRow(
        "👤",
        escapeSearchHtml(u.name || u.fullName || u.displayName || "Unnamed User"),
        escapeSearchHtml(u.phone || u.mobile || u.email || ""),
        "users.html"
      )
    ).join("")) +
    resultGroup("Products", matchedProducts.map(p =>
      resultRow(
        "📦",
        escapeSearchHtml(p.productName || "Product"),
        `₹${p.price ?? 0}${p.category ? " · " + escapeSearchHtml(p.category) : ""}`,
        `../product.html?id=${p.id}`
      )
    ).join("")) +
    resultGroup("Orders", matchedOrders.map(o =>
      resultRow(
        "🧾",
        `#${escapeSearchHtml(o.orderNumber || o.id.slice(0, 8).toUpperCase())}`,
        `${escapeSearchHtml(o.customerName || "Customer")} · ₹${o.total || 0}`,
        "orders.html"
      )
    ).join(""));

}

if (adminGlobalSearch) {

  adminGlobalSearch.addEventListener("input", () => {

    clearTimeout(searchDebounceTimer);
    const term = adminGlobalSearch.value;

    searchDebounceTimer = setTimeout(() => {
      runGlobalSearch(term);
    }, 200);

  });

}


/* ============================================================
   RECENT ORDERS — DETAILS MODAL
   (click a row to see the full order: buyer, address, items
   with their catalogue image, and update the order status)
   ============================================================ */

const orderDetailsModal = document.getElementById("orderDetailsModal");
const orderDetailsCloseBtn = document.getElementById("orderDetailsCloseBtn");
const orderDetailsContent = document.getElementById("orderDetailsContent");

function formatOrderDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return "Not available";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
      " · " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "Not available";
  }
}

function renderOrderDetails(order) {

  const total = order.total ?? order.totalPrice ?? 0;
  const products = Array.isArray(order.products) ? order.products : [];

  const productsHTML = products.length
    ? products.map(p => `
        <div style="display:flex; gap:10px; align-items:center; padding:8px 0; border-bottom:1px solid var(--line, #E4DED2);">
          <img
            src="${escapeSearchHtml(p.image || "")}"
            alt="${escapeSearchHtml(p.productName || "")}"
            style="width:50px; height:50px; object-fit:cover; border-radius:8px;">

          <div style="flex:1;">
            <div style="font-weight:600; font-size:13px;">
              ${escapeSearchHtml(p.productName || "Product")}${p.qty > 1 ? ` × ${p.qty}` : ""}
            </div>
            ${(p.selectedSize || p.selectedColour) ? `
              <div style="font-size:12px; opacity:.65;">
                ${escapeSearchHtml([p.selectedSize, p.selectedColour].filter(Boolean).join(", "))}
              </div>
            ` : ""}
          </div>

          <div style="font-weight:600; font-size:13px;">
            ₹${p.price ?? ""}
          </div>
        </div>
      `).join("")
    : `<p style="opacity:.6;">No item details available.</p>`;

  orderDetailsContent.innerHTML = `

    <div style="margin-bottom:14px;">
      <div><b>Order ID:</b> #${escapeSearchHtml(order.orderNumber || order.id.slice(0, 8).toUpperCase())}</div>
      <div><b>Customer:</b> ${escapeSearchHtml(order.customerName || "Customer")}</div>
      <div><b>Mobile:</b> ${escapeSearchHtml(order.mobile || "Not available")}</div>
      <div><b>Address:</b> ${escapeSearchHtml(order.address || "Not available")}</div>
      <div><b>Payment:</b> ${order.paymentMethod === "cod" ? "Cash on Delivery" : "Paid Online"}</div>
      <div><b>Total:</b> ₹${total}</div>
      <div><b>Placed on:</b> ${formatOrderDate(order.createdAt)}</div>
    </div>

    ${order.mobile ? `
      <a href="tel:${escapeSearchHtml(order.mobile)}" style="text-decoration:none;">
        <button type="button" class="bf-btn bf-btn-primary bf-btn-block" style="margin-bottom:14px;">
          📞 Call Customer
        </button>
      </a>
    ` : ""}

    <h3 style="font-size:14px; margin:16px 0 8px;">🛍️ Items</h3>
    <div style="margin-bottom:16px;">
      ${productsHTML}
    </div>

    <h3 style="font-size:14px; margin:16px 0 8px;">📦 Update Status</h3>

    <div class="bf-field">
      <select id="dashOrderStatusSelect" class="bf-select">
        ${STATUS_OPTIONS.map(s =>
          `<option value="${s}" ${order.status === s ? "selected" : ""}>${s}</option>`
        ).join("")}
      </select>
    </div>

    <button
      type="button"
      id="dashUpdateOrderStatusBtn"
      class="bf-btn bf-btn-primary bf-btn-block">
      Update Status
    </button>

    <a href="orders.html" class="bf-btn bf-btn-ghost bf-btn-block" style="margin-top:8px;text-decoration:none;text-align:center;">
      Open in Orders page
    </a>

  `;

  const updateBtn = document.getElementById("dashUpdateOrderStatusBtn");
  if (updateBtn) {
    updateBtn.addEventListener("click", async () => {

      const newStatus = document.getElementById("dashOrderStatusSelect").value;

      updateBtn.disabled = true;
      updateBtn.textContent = "Updating...";

      try {

        await updateDoc(doc(db, "orders", order.id), { status: newStatus });

        await logAdminAction("Updated order status", "Dashboard", {
          orderId: order.id,
          newStatus
        });

        order.status = newStatus;

        const cachedOrder = searchOrdersCache.find(o => o.id === order.id);
        if (cachedOrder) cachedOrder.status = newStatus;

        showToast("Order status updated", "success");
        closeModal("orderDetailsModal");

        await loadDashboardMetrics();

      } catch (error) {

        console.error("Order status update error:", error);
        showToast(error.message || "Failed to update status.", "danger");

      } finally {

        updateBtn.disabled = false;
        updateBtn.textContent = "Update Status";

      }

    });
  }

}

const recentOrdersListEl = document.getElementById("recentOrdersList");

if (recentOrdersListEl) {

  recentOrdersListEl.addEventListener("click", (e) => {

    const row = e.target.closest(".bf-admin-recent-order-row");
    if (!row) return;

    const orderId = row.dataset.orderId;
    const order = searchOrdersCache.find(o => o.id === orderId);
    if (!order) return;

    currentOrderDetailsId = orderId;
    renderOrderDetails(order);
    openModal("orderDetailsModal");

  });

}

if (orderDetailsCloseBtn) {
  orderDetailsCloseBtn.addEventListener("click", () => {
    closeModal("orderDetailsModal");
  });
}
