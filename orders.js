import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { raiseAdminAlert } from "./admin-alerts.js";

const ordersDiv = document.getElementById("orders");
const orderStatusFilter = document.getElementById("orderStatusFilter");
const orderSearchInput = document.getElementById("orderSearchInput");

let allOrders = [];

const STEPS = ["Ordered", "Packed", "Shipped", "Delivered"];

function stepIndexFor(status) {
  switch (status) {
    case "Pending":
    case "Ordered":
    case "Confirmed":
      return 0;
    case "Packed":
      return 1;
    case "Shipped":
      return 2;
    case "Out for Delivery":
    case "Delivered":
      return 3;
    default:
      return 0;
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

function renderTracker(order) {

  if (order.status === "Cancelled") {
    return `<div class="cancelled-banner">❌ This order was cancelled</div>`;
  }

  const activeIndex = stepIndexFor(order.status);
  const progressWidth = (activeIndex / (STEPS.length - 1)) * 100 + "%";

  const icons = ["fa-check", "fa-box", "fa-truck", "fa-house"];

  const stepsHTML = STEPS.map((label, i) => {
    let cls = "";
    if (i < activeIndex) cls = "completed";
    else if (i === activeIndex) cls = "current";

    return `
      <div class="step ${cls}">
        <div class="circle"><i class="fa-solid ${icons[i]}"></i></div>
        <span>${label}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="status-tracker">
      <div class="progress-bar">
        <div class="progress-line" style="width: ${progressWidth};"></div>
        ${stepsHTML}
      </div>
    </div>
  `;

}

function renderOrderCard(id, order) {

  const orderTotal = order.total ?? order.totalPrice ?? 0;

  let productsHTML = "";
  if (Array.isArray(order.products)) {
    order.products.forEach((product) => {
      productsHTML += `
        <div class="product-item" ${product.id ? `data-product-id="${product.id}" style="cursor:pointer;"` : ""}>
          <img src="${product.image}" alt="${product.productName}">
          <div class="product-details">
            <h3>${product.productName}${product.qty > 1 ? ` × ${product.qty}` : ""}</h3>
            ${(product.selectedSize || product.selectedColour) ? `<p style="font-size:12px;color:var(--ink-soft);margin:0 0 4px;">${[product.selectedSize, product.selectedColour].filter(Boolean).join(", ")}</p>` : ""}
            <p class="price">₹${product.price}</p>
          </div>
        </div>
      `;
    });
  }

  const canCancel = ["Pending", "Confirmed", "Ordered", "Packed"].includes(order.status);
  const statusClass = order.status === "Cancelled" ? "status-rust" : "status-leaf";

  return `
    <div class="order-card">
      <div class="order-head">
        <span class="order-id-tag">#${order.orderNumber || id.slice(0, 8).toUpperCase()}</span>
        <span class="order-date">${formatDate(order.createdAt)}</span>
      </div>

      <h2>${order.customerName || "Customer"}</h2>
      <p class="order-meta">📍 ${order.address || ""} &nbsp;·&nbsp; 📞 ${order.mobile || ""} &nbsp;·&nbsp; ${order.paymentMethod === "cod" ? "COD" : "Paid Online"}</p>
      <p class="order-total-line"><b>Total: ₹${orderTotal}</b></p>

      <div class="order-status-row">
        <b>Status:</b>
        <span class="status-pill ${statusClass}">${order.status}</span>
      </div>

      ${renderTracker(order)}

      ${productsHTML}

      ${canCancel ? `<button class="cancel-btn" data-id="${id}">Cancel Order</button>` : ""}
    </div>
  `;

}

// Auth State Monitor
onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  await loadOrders(user);

});

async function loadOrders(user) {

  try {
    const q = query(
      collection(db, "orders"),
      where("userId", "==", user.uid)
    );

    const querySnapshot = await getDocs(q);

    allOrders = querySnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

    if (allOrders.length === 0) {
      ordersDiv.innerHTML = `
        <div class="no-results">
          <h2>No Orders Found 📦</h2>
          <p>Looking like you haven't placed an order yet.</p>
        </div>`;
      return;
    }

    renderFilteredOrders();

  } catch (error) {
    console.error("Orders Fetch Error: ", error);
    alert("Error fetching orders: " + error.message);
  }

}

function renderFilteredOrders() {

  const statusFilter = orderStatusFilter ? orderStatusFilter.value : "All";
  const term = orderSearchInput ? orderSearchInput.value.trim().toLowerCase() : "";

  const filtered = allOrders.filter((order) => {

    const matchesStatus = statusFilter === "All" || order.status === statusFilter;

    const matchesTerm = !term || (order.products || []).some(p =>
      (p.productName || "").toLowerCase().includes(term)
    );

    return matchesStatus && matchesTerm;

  });

  if (!filtered.length) {
    ordersDiv.innerHTML = `
      <div class="no-results">
        <h2>No orders match this filter</h2>
        <p>Try a different status or search term.</p>
      </div>`;
    return;
  }

  ordersDiv.innerHTML = filtered
    .map((order) => renderOrderCard(order.id, order))
    .join("");

}

if (orderStatusFilter) orderStatusFilter.addEventListener("change", renderFilteredOrders);
if (orderSearchInput) orderSearchInput.addEventListener("input", renderFilteredOrders);

ordersDiv.addEventListener("click", async (e) => {

  const cancelBtn = e.target.closest(".cancel-btn");

  if (!cancelBtn) {
    const productItem = e.target.closest(".product-item");
    if (productItem && productItem.dataset.productId) {
      window.location.href = `product.html?id=${productItem.dataset.productId}`;
    }
    return;
  }

  const id = cancelBtn.dataset.id;

  const sure = confirm("Cancel this order?");
  if (!sure) return;

  try {

    cancelBtn.disabled = true;
    cancelBtn.textContent = "Cancelling...";

    await updateDoc(doc(db, "orders", id), {
      status: "Cancelled",
      cancelledAt: new Date()
    });

    raiseAdminAlert("order_cancel", `Order cancelled by customer`, {
      userId: auth.currentUser?.uid,
      orderId: id
    });

    await loadOrders(auth.currentUser);

  } catch (error) {
    console.log(error);
    alert(error.message);
  }

});
