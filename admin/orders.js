import { auth, db } from "../firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  openModal,
  closeModal,
  showToast
} from "../design-system.js";

import { logAdminAction } from "./audit.js";


const ordersList = document.getElementById("ordersList");
const orderCount = document.getElementById("orderCount");
const orderSearch = document.getElementById("orderSearch");
const orderStatusFilter = document.getElementById("orderStatusFilter");

const orderDetailsModal = document.getElementById("orderDetailsModal");
const orderDetailsCloseBtn = document.getElementById("orderDetailsCloseBtn");
const orderDetailsContent = document.getElementById("orderDetailsContent");

const STATUS_OPTIONS = [
  "Pending", "Confirmed", "Packed", "Shipped",
  "Out for Delivery", "Delivered", "Cancelled"
];

let allOrders = [];
let currentDetailsOrderId = null;
let selectedOrderIds = new Set();


/* =========================
   HELPERS
========================= */

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatDate(ts) {
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

function statusPillClass(status) {
  if (status === "Cancelled") return "bf-status-danger";
  if (status === "Delivered") return "bf-status-success";
  if (status === "Pending") return "bf-status-pending";
  return "bf-status-progress";
}


/* =========================
   LOAD & RENDER
========================= */

async function loadOrders() {

  try {

    let snapshot;

    try {
      snapshot = await getDocs(
        query(collection(db, "orders"), orderBy("createdAt", "desc"))
      );
    } catch {
      snapshot = await getDocs(collection(db, "orders"));
    }

    allOrders = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderOrderList();

  } catch (error) {

    console.error("Orders loading error:", error);

    ordersList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        ❌ Unable to load orders.
      </div>
    `;

  }

}

function getFilteredOrders() {

  const term = orderSearch.value.trim().toLowerCase();
  const statusFilter = orderStatusFilter.value;

  return allOrders.filter((order) => {

    const name = (order.customerName || "").toLowerCase();
    const mobile = (order.mobile || "").toLowerCase();
    const idMatch = order.id.toLowerCase().includes(term);

    const matchesTerm = !term || name.includes(term) || mobile.includes(term) || idMatch;
    const matchesStatus = statusFilter === "All Status" || order.status === statusFilter;

    return matchesTerm && matchesStatus;

  });

}

function renderOrderList() {

  const filtered = getFilteredOrders();

  orderCount.textContent = `Total Orders: ${allOrders.length}`;

  if (!filtered.length) {
    ordersList.innerHTML = `
      <div class="bf-card" style="padding:20px;">
        No orders found.
      </div>
    `;
    return;
  }

  ordersList.innerHTML = filtered.map((order) => {

    const total = order.total ?? order.totalPrice ?? 0;
    const itemCount = Array.isArray(order.products) ? order.products.length : 0;

    return `
      <div class="bf-card" style="padding:16px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">

        <div style="display:flex; align-items:flex-start; gap:10px;">
          <input type="checkbox" class="order-select-checkbox" data-id="${escapeHtml(order.id)}" ${selectedOrderIds.has(order.id) ? "checked" : ""} style="margin-top:4px; width:18px; height:18px;">

          <div>
            <div style="font-weight:700;">
              #${escapeHtml(String(order.orderNumber || order.id.slice(0, 8).toUpperCase()))}
              &nbsp;·&nbsp;
              ${escapeHtml(order.customerName || "Customer")}
            </div>

            <div style="font-size:13px; opacity:.7; margin-top:2px;">
              ${escapeHtml(order.mobile || "No mobile")} · ${itemCount} item${itemCount === 1 ? "" : "s"} · ₹${escapeHtml(String(total))}
            </div>

            <div style="font-size:12px; opacity:.55; margin-top:2px;">
              ${formatDate(order.createdAt)}
            </div>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:10px;">
          <span class="bf-status-pill ${statusPillClass(order.status)}">
            ${escapeHtml(order.status || "Pending")}
          </span>

          ${order.mobile ? `
            <a href="tel:${escapeHtml(order.mobile)}" class="bf-btn bf-btn-ghost bf-btn-sm" style="text-decoration:none;" title="Call customer">
              📞
            </a>
          ` : ""}

          <button
            type="button"
            class="bf-btn bf-btn-ghost bf-btn-sm view-order-btn"
            data-id="${escapeHtml(order.id)}">
            View
          </button>
        </div>

      </div>
    `;

  }).join("");

  updateBulkBar();

}

if (orderSearch) {
  orderSearch.addEventListener("input", renderOrderList);
}

if (orderStatusFilter) {
  orderStatusFilter.addEventListener("change", renderOrderList);
}


/* =========================
   ORDER DETAILS MODAL
========================= */

function renderOrderDetails(order) {

  const total = order.total ?? order.totalPrice ?? 0;

  const productsHTML = Array.isArray(order.products) && order.products.length
    ? order.products.map((p) => `
        <div style="display:flex; gap:10px; align-items:center; padding:8px 0; border-bottom:1px solid var(--line, #E4DED2);">
          <img
            src="${escapeHtml(p.image || "")}"
            alt="${escapeHtml(p.productName || "")}"
            style="width:50px; height:50px; object-fit:cover; border-radius:8px;">

          <div style="flex:1;">
            <div style="font-weight:600; font-size:13px;">
              ${escapeHtml(p.productName || "Product")}${p.qty > 1 ? ` × ${escapeHtml(String(p.qty))}` : ""}
            </div>
            ${(p.selectedSize || p.selectedColour) ? `
              <div style="font-size:12px; opacity:.65;">
                ${escapeHtml([p.selectedSize, p.selectedColour].filter(Boolean).join(", "))}
              </div>
            ` : ""}
          </div>

          <div style="font-weight:600; font-size:13px;">
            ₹${escapeHtml(String(p.price ?? ""))}
          </div>
        </div>
      `).join("")
    : `<p style="opacity:.6;">No item details available.</p>`;

  orderDetailsContent.innerHTML = `

    <div style="margin-bottom:14px;">
      <div><b>Order ID:</b> #${escapeHtml(String(order.orderNumber || order.id.slice(0, 8).toUpperCase()))}</div>
      <div><b>Customer:</b> ${escapeHtml(order.customerName || "Customer")}</div>
      <div><b>Mobile:</b> ${escapeHtml(order.mobile || "Not available")}</div>
      <div><b>Address:</b> ${escapeHtml(order.address || "Not available")}</div>
      <div><b>Payment:</b> ${order.paymentMethod === "cod" ? "Cash on Delivery" : "Paid Online"}</div>
      <div><b>Total:</b> ₹${escapeHtml(String(total))}</div>
      <div><b>Placed on:</b> ${formatDate(order.createdAt)}</div>
    </div>

    ${order.mobile ? `
      <a href="tel:${escapeHtml(order.mobile)}" style="text-decoration:none;">
        <button type="button" class="bf-btn bf-btn-primary bf-btn-block" style="margin-bottom:14px;">
          📞 Call Customer to Confirm
        </button>
      </a>
    ` : ""}

    <h3 style="font-size:14px; margin:16px 0 8px;">🛍️ Items</h3>
    <div style="margin-bottom:16px;">
      ${productsHTML}
    </div>

    ${(order.status === "Pending" || order.status === "Confirmed") ? `
      <h3 style="font-size:14px; margin:16px 0 8px;">☎️ After calling the customer</h3>
      <p style="font-size:12px; opacity:.65; margin:-4px 0 10px;">Confirm the order only after you've spoken to the customer on the phone.</p>
      <div style="display:flex; gap:8px; margin-bottom:16px;">
        <button type="button" id="quickAcceptBtn" class="bf-btn bf-btn-primary" style="flex:1;">✅ Accept Order</button>
        <button type="button" id="quickRejectBtn" class="bf-btn bf-btn-ghost" style="flex:1;color:#c62828;">❌ Reject Order</button>
      </div>
    ` : ""}

    <h3 style="font-size:14px; margin:16px 0 8px;">📦 Update Status</h3>

    <div class="bf-field">
      <select id="orderStatusSelect" class="bf-select">
        ${STATUS_OPTIONS.map(s =>
          `<option value="${s}" ${order.status === s ? "selected" : ""}>${s}</option>`
        ).join("")}
      </select>
    </div>

    <button
      type="button"
      id="updateOrderStatusBtn"
      class="bf-btn bf-btn-primary bf-btn-block">
      Update Status
    </button>

  `;

}

if (ordersList) {
  ordersList.addEventListener("click", (e) => {

    const viewBtn = e.target.closest(".view-order-btn");
    if (!viewBtn) return;

    const id = viewBtn.dataset.id;
    const order = allOrders.find(o => o.id === id);
    if (!order) return;

    currentDetailsOrderId = id;
    renderOrderDetails(order);
    openModal("orderDetailsModal");

  });
}

if (orderDetailsCloseBtn) {
  orderDetailsCloseBtn.addEventListener("click", () => {
    closeModal("orderDetailsModal");
  });
}

async function applyOrderStatus(newStatus, triggerBtn, defaultLabel) {

  triggerBtn.disabled = true;
  triggerBtn.textContent = "Updating...";

  try {

    await updateDoc(doc(db, "orders", currentDetailsOrderId), { status: newStatus });

    await logAdminAction("Updated order status", "Orders", {
      orderId: currentDetailsOrderId,
      newStatus
    });

    const idx = allOrders.findIndex(o => o.id === currentDetailsOrderId);
    if (idx !== -1) {
      allOrders[idx] = { ...allOrders[idx], status: newStatus };
    }

    renderOrderList();
    showToast("Order status updated", "success");
    closeModal("orderDetailsModal");

  } catch (error) {

    console.error("Order status update error:", error);
    showToast(error.message || "Failed to update status.", "danger");

  } finally {

    triggerBtn.disabled = false;
    triggerBtn.textContent = defaultLabel;

  }

}

if (orderDetailsContent) {
  orderDetailsContent.addEventListener("click", async (e) => {

    if (e.target.id === "updateOrderStatusBtn") {
      const select = document.getElementById("orderStatusSelect");
      await applyOrderStatus(select.value, e.target, "Update Status");
      return;
    }

    if (e.target.id === "quickAcceptBtn") {
      await applyOrderStatus("Confirmed", e.target, "✅ Accept Order");
      return;
    }

    if (e.target.id === "quickRejectBtn") {
      const sure = confirm("Reject this order? This cancels it for the customer.");
      if (!sure) return;
      await applyOrderStatus("Cancelled", e.target, "❌ Reject Order");
    }

  });
}


/* =========================
   BULK SELECT + SHIPPING LABELS
========================= */

const bulkBar = document.getElementById("bulkBar");
const bulkCount = document.getElementById("bulkCount");
const bulkLabelsBtn = document.getElementById("bulkLabelsBtn");
const bulkClearBtn = document.getElementById("bulkClearBtn");

function updateBulkBar() {
  if (!bulkBar) return;
  if (selectedOrderIds.size > 0) {
    bulkBar.style.display = "flex";
    bulkCount.textContent = `${selectedOrderIds.size} order${selectedOrderIds.size === 1 ? "" : "s"} selected`;
  } else {
    bulkBar.style.display = "none";
  }
}

if (ordersList) {
  ordersList.addEventListener("change", (e) => {
    const checkbox = e.target.closest(".order-select-checkbox");
    if (!checkbox) return;

    if (checkbox.checked) {
      selectedOrderIds.add(checkbox.dataset.id);
    } else {
      selectedOrderIds.delete(checkbox.dataset.id);
    }

    updateBulkBar();
  });
}

if (bulkClearBtn) {
  bulkClearBtn.addEventListener("click", () => {
    selectedOrderIds.clear();
    renderOrderList();
  });
}

function labelHTML(order) {

  const itemsHTML = (order.products || []).map(p =>
    `<div>${escapeHtml(p.productName || "")}${p.qty > 1 ? ` × ${p.qty}` : ""} — ${escapeHtml(p.productCode || "")}</div>`
  ).join("");

  return `
    <div class="ship-label">
      <div class="ship-label-header">
        <div><b>Bestify Mobile</b><br>Kolavi</div>
        <div style="text-align:right;">Order #${escapeHtml(String(order.orderNumber || order.id.slice(0, 8).toUpperCase()))}<br>${formatDate(order.createdAt)}</div>
      </div>
      <hr>
      <div class="ship-label-to">
        <b>DELIVER TO:</b><br>
        <b>${escapeHtml(order.customerName || "Customer")}</b><br>
        ${escapeHtml(order.address || "")}<br>
        📞 ${escapeHtml(order.mobile || "")}
      </div>
      <hr>
      <div class="ship-label-items">
        ${itemsHTML}
      </div>
      <hr>
      <div class="ship-label-footer">
        <div>Payment: ${order.paymentMethod === "cod" ? "COD — ₹" + (order.total || 0) : "PREPAID"}</div>
      </div>
    </div>
  `;

}

if (bulkLabelsBtn) {
  bulkLabelsBtn.addEventListener("click", () => {

    const selectedOrders = allOrders.filter(o => selectedOrderIds.has(o.id));
    if (!selectedOrders.length) return;

    const labelsHTML = selectedOrders.map(labelHTML).join("");

    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Shipping Labels</title>
        <style>
          body{ font-family: Arial, sans-serif; margin:0; padding:0; }
          .ship-label{
            width: 4in; min-height: 5in;
            padding: 16px; box-sizing: border-box;
            page-break-after: always;
            font-size: 13px;
          }
          .ship-label-header{ display:flex; justify-content:space-between; font-size:12px; }
          .ship-label-to{ margin:10px 0; line-height:1.5; }
          .ship-label-items{ font-size:12px; margin:10px 0; }
          hr{ border:none; border-top:1px dashed #999; margin:8px 0; }
          @media print{ .ship-label{ page-break-after: always; } }
        </style>
      </head>
      <body onload="window.print()">
        ${labelsHTML}
      </body>
      </html>
    `);
    printWindow.document.close();

  });
}


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

  loadOrders();

});
