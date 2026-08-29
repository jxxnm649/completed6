import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const wishlistDiv = document.getElementById("wishlistItems");

let wishlistItems = [];
let currentUser = null;

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {

    const querySnapshot = await getDocs(
      collection(db, "users", user.uid, "wishlist")
    );

    wishlistItems = querySnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    render();

  } catch (error) {

    alert(error.message);
    console.log(error);

  }

});

function render() {

  if (wishlistItems.length === 0) {
    wishlistDiv.innerHTML = "<h2>You haven't liked anything yet ❤️</h2>";
    return;
  }

  wishlistDiv.innerHTML = wishlistItems.map((product) => `
    <div class="card">

      <img src="${product.image}" alt="${product.productName}">

      <div class="card-content">

        <h2>${product.productName}</h2>

        <p>${product.category}</p>

        <p class="price">₹${product.price}</p>

        <p>${product.description}</p>

        <button class="move-btn" data-id="${product.id}">
          🛒 Move to Cart
        </button>

        <button class="remove-btn" data-id="${product.id}">
          Remove ❤️
        </button>

      </div>

    </div>
  `).join("");

}

wishlistDiv.addEventListener("click", async (e) => {

  if (!currentUser) return;

  const removeBtn = e.target.closest(".remove-btn");
  if (removeBtn) {

    const id = removeBtn.dataset.id;

    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "wishlist", id));
      wishlistItems = wishlistItems.filter((i) => i.id !== id);
      render();
    } catch (error) {
      alert(error.message);
      console.log(error);
    }

    return;
  }

  const moveBtn = e.target.closest(".move-btn");
  if (moveBtn) {

    const id = moveBtn.dataset.id;

    try {

      const productSnap = await getDoc(doc(db, "products", id));

      if (!productSnap.exists()) {
        alert("Product Not Found");
        return;
      }

      const cartRef = doc(db, "users", currentUser.uid, "cart", id);
      const cartSnap = await getDoc(cartRef);
      const qty = cartSnap.exists() ? (cartSnap.data().qty || 1) + 1 : 1;

      await setDoc(cartRef, { ...productSnap.data(), qty });
      await deleteDoc(doc(db, "users", currentUser.uid, "wishlist", id));

      wishlistItems = wishlistItems.filter((i) => i.id !== id);
      render();

      alert("Moved to Cart 🛒");

    } catch (error) {
      alert(error.message);
      console.log(error);
    }

  }

});

// Kept for backward compatibility (inline onclick no longer used)
window.removeWishlist = async function(id) {

  const user = auth.currentUser;

  if (!user) {
    alert("Please Login First");
    return;
  }

  try {

    await deleteDoc(doc(db, "users", user.uid, "wishlist", id));
    wishlistItems = wishlistItems.filter((i) => i.id !== id);
    render();

  } catch (error) {

    alert(error.message);

  }

};
