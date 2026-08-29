import { auth, db } from "./firebase.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const cartDiv = document.getElementById("cartItems");
const totalEl = document.getElementById("cartTotal");
const checkoutBtn = document.getElementById("checkoutBtn");

let cartItems = [];

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    alert("Please Login");
    window.location.href = "login.html";
    return;
  }

  try {

    const querySnapshot = await getDocs(
      collection(db, "users", user.uid, "cart")
    );

    cartItems = querySnapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      qty: d.data().qty || 1
    }));

    render();

  } catch (error) {
    console.log(error);
    alert(error.message);
  }

});

function render() {

  if (cartItems.length === 0) {
    cartDiv.innerHTML = "<h2>Your Cart is Empty 🛒</h2>";
    totalEl.textContent = "0";
    if (checkoutBtn) checkoutBtn.style.display = "none";
    return;
  }

  if (checkoutBtn) checkoutBtn.style.display = "block";

  cartDiv.innerHTML = cartItems.map((item) => `
    <div class="card">
      <img src="${item.image}" alt="${item.productName}">
      <div class="card-content">
        <h2>${item.productName}</h2>
        <p class="price">₹${item.price}</p>
        <div class="qty-stepper">
          <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
          <span>${item.qty}</span>
          <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
        </div>
        <p class="line-total">Subtotal: ₹${item.price * item.qty}</p>
        <button class="remove-btn" data-id="${item.id}">Remove</button>
      </div>
    </div>
  `).join("");

  const total = cartItems.reduce((sum, i) => sum + Number(i.price) * i.qty, 0);
  totalEl.textContent = total;

}

cartDiv.addEventListener("click", async (e) => {

  const user = auth.currentUser;
  if (!user) return;

  const removeBtn = e.target.closest(".remove-btn");
  if (removeBtn) {

    const id = removeBtn.dataset.id;

    try {
      await deleteDoc(doc(db, "users", user.uid, "cart", id));
      cartItems = cartItems.filter((i) => i.id !== id);
      render();
    } catch (error) {
      console.log(error);
      alert(error.message);
    }

    return;
  }

  const qtyBtn = e.target.closest(".qty-btn");
  if (qtyBtn) {

    const id = qtyBtn.dataset.id;
    const action = qtyBtn.dataset.action;
    const item = cartItems.find((i) => i.id === id);
    if (!item) return;

    if (action === "inc") item.qty += 1;
    if (action === "dec") item.qty = Math.max(1, item.qty - 1);

    render();

    try {
      await updateDoc(doc(db, "users", user.uid, "cart", id), { qty: item.qty });
    } catch (error) {
      console.log(error);
    }

  }

});

window.removeFromCart = async function (id) {

  const user = auth.currentUser;
  if (!user) {
    alert("Please Login");
    return;
  }

  try {
    await deleteDoc(doc(db, "users", user.uid, "cart", id));
    cartItems = cartItems.filter((i) => i.id !== id);
    render();
  } catch (error) {
    console.log(error);
    alert(error.message);
  }

};
