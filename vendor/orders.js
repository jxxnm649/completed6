import { db } from "../firebase.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { showToast } from "../design-system.js";
import { guardVendorPage, wireLogout } from "./vendor-common.js";

wireLogout(document.getElementById("logoutBtn"));

const ordersList = document.getElementById("ordersList");
const orderCount = document.getElementById("orderCount");
const orderSearch = document.getElementById("orderSearch");
const orderStatusFilter = document.getElementById("orderStatusFilter");

// Vendors may only move an order forward through these two steps.
// Admin retains control over Confirmed / Out for Delivery / Delivered / Cancelled.
const VENDOR_ALLOWED_NEXT_STATUS = {
  "Pending": "Packed",
  "Confirmed": "Packed",
  "Packed": "Shipped"
};

let allOrders = [];
let currentVendorId = null;

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function statusPillClass(status) {
  if (status === "Cancelled") return "bf-status-danger";
  if (status === "Delivered") return "bf-status-success";
  return "bf-status-pending";
}

async function loadOrders() {

  try {

    const snapshot = await getDocs(
      query(collection(db, "orders"), where("vendorIds", "array-contains", currentVendorId))
    );

    allOrders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    renderOrders();

  } catch (error) {
    console.error("Vendor orders load error:", error);
    ordersList.innerHTML = `<div class="bf-card" style="padding:20px;">❌ Unable to load orders.</div>`;
  }

}

function getFiltered() {

  const term = orderSearch.value.trim().toLowerCase();
  const statusFilter = orderStatusFilter.value;

  return allOrders.filter((order) => {
    const name = (order.customerName || "").toLowerCase();
    const matchesTerm = !term || name.includes(term) || order.id.toLowerCase().includes(term);
    const matchesStatus = statusFilter === "All" || order.status === statusFilter;
    return matchesTerm && matchesStatus;
  });

}

function renderOrders() {

  const filtered = getFiltered();

  orderCount.textContent = `Total Orders: ${allOrders.length}`;

  if (!filtered.length) {
    ordersList.innerHTML = `<div class="bf-card" style="padding:20px;">No orders found.</div>`;
    return;
  }

  ordersList.innerHTML = filtered.map((order) => {

    // Only show this vendor's own line items within the order
    const myItems = (order.products || []).filter(p => p.vendorId === currentVendorId);

    const itemsHtml = myItems.map(p => `
      <div style="display:flex;gap:10px;align-items:center;padding:6px 0;">
        <img src="${escapeHtml(p.image || "")}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;">
        <div style="font-size:13px;">
          ${escapeHtml(p.productName || "")}${p.qty > 1 ? ` × ${p.qty}` : ""}
          <div style="opacity:.65;">₹${escapeHtml(String(p.price ?? 0))}</div>
        </div>
      </div>
    `).join("");

    const nextStatus = VENDOR_ALLOWED_NEXT_STATUS[order.status];

    return `
      <div class="bf-card" style="padding:16px;">

        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div>
            <div style="font-weight:700;">#${escapeHtml(String(order.orderNumber || order.id.slice(0, 8).toUpperCase()))}</div>
            <div style="font-size:12px;opacity:.65;">${formatDate(order.createdAt)} · ${escapeHtml(order.customerName || "Customer")}</div>
          </div>
          <span class="bf-status-pill ${statusPillClass(order.status)}">${escapeHtml(order.status || "Pending")}</span>
        </div>

        <div style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px;">
          ${itemsHtml || "<div style='font-size:13px;opacity:.6;'>No items from your shop in this order.</div>"}
        </div>

        ${nextStatus ? `
          <button
            type="button"
            class="bf-btn bf-btn-ghost bf-btn-sm advance-status-btn"
            data-id="${escapeHtml(order.id)}"
            data-next="${nextStatus}"
            style="margin-top:10px;">
            Mark as ${nextStatus}
          </button>
        ` : ""}

      </div>
    `;

  }).join("");

}

orderSearch.addEventListener("input", renderOrders);
orderStatusFilter.addEventListener("change", renderOrders);

ordersList.addEventListener("click", async (e) => {

  const btn = e.target.closest(".advance-status-btn");
  if (!btn) return;

  const id = btn.dataset.id;
  const nextStatus = btn.dataset.next;

  btn.disabled = true;
  btn.textContent = "Updating...";

  try {

    await updateDoc(doc(db, "orders", id), { status: nextStatus });

    const idx = allOrders.findIndex(o => o.id === id);
    if (idx !== -1) allOrders[idx].status = nextStatus;

    renderOrders();
    showToast(`Order marked as ${nextStatus}`, "success");

  } catch (error) {
    console.error("Order status update error:", error);
    showToast(error.message || "Failed to update order.", "danger");
    btn.disabled = false;
    btn.textContent = `Mark as ${nextStatus}`;
  }

});

guardVendorPage((user) => {
  currentVendorId = user.uid;
  loadOrders();
});
