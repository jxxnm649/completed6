import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";

import { raiseAdminAlert } from "./admin-alerts.js";
import { nextSequenceNumber } from "./counters.js";

const functions = getFunctions();
const createRazorpayOrder = httpsCallable(functions, "createRazorpayOrder");
const verifyRazorpayPayment = httpsCallable(functions, "verifyRazorpayPayment");

const form = document.getElementById("checkoutForm");
const summaryEl = document.getElementById("orderSummary");

let currentUser = null;

const params = new URLSearchParams(window.location.search);
const buyNowProductId = params.get("productId");
const buyNowQty = Number(params.get("qty")) || 1;
const buyNowSize = params.get("size");
const buyNowColour = params.get("colour");

onAuthStateChanged(auth, (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  renderSummary();
  prefillFromProfile(user);

});

// Prefill checkout form with saved profile details (name/mobile/address), still editable
async function prefillFromProfile(user) {
  try {
    const docSnap = await getDoc(doc(db, "users", user.uid));
    if (!docSnap.exists()) return;

    const data = docSnap.data();
    const nameField = document.getElementById("customerName");
    const mobileField = document.getElementById("mobile");
    const addressField = document.getElementById("address");

    const isValidText = (v) => typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "true" && v.trim().toLowerCase() !== "false";

    if (nameField && !nameField.value && isValidText(data.name)) nameField.value = data.name;
    if (mobileField && !mobileField.value && isValidText(data.mobile)) mobileField.value = data.mobile;
    if (addressField && !addressField.value && isValidText(data.address)) addressField.value = data.address;

  } catch (error) {
    console.log(error);
  }
}

// Fetch the items that will be ordered (Buy Now product OR full cart)
async function getOrderItems() {

  const products = [];
  let cartSnapshot = null;

  if (buyNowProductId) {

    const productSnap = await getDoc(doc(db, "products", buyNowProductId));

    if (!productSnap.exists()) {
      return { products: [], cartSnapshot: null };
    }

    products.push({
      ...productSnap.data(),
      id: buyNowProductId,
      qty: buyNowQty,
      ...(buyNowSize ? { selectedSize: buyNowSize } : {}),
      ...(buyNowColour ? { selectedColour: buyNowColour } : {})
    });

  } else {

    cartSnapshot = await getDocs(
      collection(db, "users", currentUser.uid, "cart")
    );

    cartSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      products.push({ ...data, id: docSnap.id, qty: data.qty || 1 });
    });

  }

  return { products, cartSnapshot };

}

function calcTotal(products) {
  return products.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.qty || 1),
    0
  );
}

async function renderSummary() {

  const { products } = await getOrderItems();

  if (products.length === 0) {
    summaryEl.innerHTML = `<p class="no-results">Your Cart is Empty 🛒</p>`;
    form.querySelector("button[type=submit]").disabled = true;
    return;
  }

  const total = calcTotal(products);

  summaryEl.innerHTML = `
    ${products.map(p => `
      <div class="summary-row">
        <span>${p.productName} ${p.qty > 1 ? `× ${p.qty}` : ""}${(p.selectedSize || p.selectedColour) ? ` <small style="color:var(--ink-soft);">(${[p.selectedSize, p.selectedColour].filter(Boolean).join(", ")})</small>` : ""}</span>
        <span>₹${Number(p.price) * Number(p.qty || 1)}</span>
      </div>
    `).join("")}
    <div class="summary-row summary-total">
      <span>Total</span>
      <span>₹${total}</span>
    </div>
  `;

}

form.addEventListener("submit", async (e) => {

  e.preventDefault();

  const customerName = document.getElementById("customerName").value;
  const mobile = document.getElementById("mobile").value;
  const address = document.getElementById("address").value;
  const paymentMethod = document.querySelector(
    'input[name="paymentMethod"]:checked'
  ).value;

  const placeOrderBtn = document.getElementById("placeOrderBtn");

  try {

    const { products, cartSnapshot } = await getOrderItems();

    if (products.length === 0) {
      alert(buyNowProductId ? "Product Not Found" : "Your Cart is Empty");
      return;
    }

    const totalAmount = calcTotal(products);

    // Unique vendor ids among the ordered items — lets suppliers query
    // "orders that include my products" via array-contains.
    const vendorIds = [...new Set(products.map(p => p.vendorId).filter(Boolean))];

    async function saveOrderAndFinish(extra = {}) {

      const orderNumber = await nextSequenceNumber("orders");

      const orderRef = await addDoc(collection(db, "orders"), {

        userId: currentUser.uid,
        customerName,
        mobile,
        address,
        products,
        vendorIds,
        orderNumber,
        total: totalAmount,
        paymentMethod,
        status: "Pending",
        createdAt: new Date(),
        ...extra

      });

      raiseAdminAlert("order", `New order placed by ${customerName || "a customer"} — ₹${totalAmount}`, {
        userId: currentUser.uid,
        orderId: orderRef.id
      });

      if (!buyNowProductId && cartSnapshot) {

        for (const cartDoc of cartSnapshot.docs) {
          await deleteDoc(
            doc(db, "users", currentUser.uid, "cart", cartDoc.id)
          );
        }

      }

      window.location.href = `payment-success.html?orderId=${orderRef.id}&method=${paymentMethod}`;

    }

    // ---------- Cash on Delivery ----------
    if (paymentMethod === "cod") {

      placeOrderBtn.disabled = true;
      placeOrderBtn.textContent = "Placing Order...";

      await saveOrderAndFinish();
      return;

    }

    // ---------- Online Payment (Razorpay) ----------
    // The order is created server-side (createRazorpayOrder) so the
    // amount can't be tampered with client-side, and it's only written
    // to Firestore after verifyRazorpayPayment confirms the payment
    // signature on the server — see functions/index.js.

    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = "Starting Payment...";

    let rzpOrder;

    try {
      const { data } = await createRazorpayOrder({ amount: totalAmount });
      rzpOrder = data;
    } catch (error) {
      console.log(error);
      alert("Could not start payment. Please try again.");
      placeOrderBtn.disabled = false;
      placeOrderBtn.textContent = "Place Order";
      return;
    }

    placeOrderBtn.textContent = "Place Order";
    placeOrderBtn.disabled = false;

    const options = {

      key: rzpOrder.keyId,
      order_id: rzpOrder.orderId,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,

      name: "Bestify Store",

      description: "Product Purchase",

      handler: async function (response) {

        try {

          const { data } = await verifyRazorpayPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            orderData: {
              customerName,
              mobile,
              address,
              products,
              cartItemIds: (!buyNowProductId && cartSnapshot)
                ? cartSnapshot.docs.map(d => d.id)
                : []
            }
          });

          window.location.href = `payment-success.html?orderId=${data.orderId}&method=online`;

        } catch (error) {
          console.log(error);
          window.location.href = "payment-failed.html";
        }

      },

      modal: {
        ondismiss: function () {
          window.location.href = "payment-failed.html";
        }
      },

      theme: {
        color: "#14213D"
      }

    };

    const rzp = new Razorpay(options);

    rzp.on("payment.failed", function () {
      window.location.href = "payment-failed.html";
    });

    rzp.open();

  } catch (error) {

    console.log(error);
    alert(error.message);

  }

});
