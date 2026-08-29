import { db } from "./firebase.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
const params = new URLSearchParams(window.location.search);
const orderId = params.get("id");

const orderIdEl = document.getElementById("orderId");
const customerEl = document.getElementById("customer");
const mobileEl = document.getElementById("mobile");
const addressEl = document.getElementById("address");
const productsEl = document.getElementById("products");
const totalEl = document.getElementById("total");

loadInvoice();

async function loadInvoice() {

  try {

    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {

      document.body.innerHTML = "<h2>Invoice Not Found</h2>";
      return;

    }

    const order = orderSnap.data();

    orderIdEl.innerText = order.orderNumber ? `#${order.orderNumber}` : orderId;
    customerEl.innerText = order.customerName;
    mobileEl.innerText = order.mobile;
    addressEl.innerText = order.address;
    const total = order.products.reduce(
    (sum, item) => sum + Number(item.price),
    0
);

totalEl.innerText = total;

    productsEl.innerHTML = "";

    order.products.forEach((product) => {

      productsEl.innerHTML += `
        <div class="product">
          <span>${product.productName}</span>
          <span>₹${product.price}</span>
        </div>
      `;

    });

  } catch (error) {

    alert(error.message);
    console.log(error);

  }

}
