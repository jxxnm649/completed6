import { db } from "../firebase.js";

import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { guardVendorPage, wireLogout } from "./vendor-common.js";

wireLogout(document.getElementById("logoutBtn"));

async function loadStats(user, vendor) {

  document.getElementById("shopNameLabel").textContent = vendor.shopName || "Dashboard";
  document.getElementById("statCommissionRate").textContent = `${vendor.commissionRate ?? 0}%`;
  document.getElementById("statWalletBalance").textContent = `₹${Number(vendor.walletBalance || 0).toLocaleString("en-IN")}`;

  try {

    // Products
    const productsSnap = await getDocs(
      query(collection(db, "products"), where("vendorId", "==", user.uid))
    );
    document.getElementById("statProducts").textContent = productsSnap.size;

    // Orders containing this vendor's items
    const ordersSnap = await getDocs(
      query(collection(db, "orders"), where("vendorIds", "array-contains", user.uid))
    );

    const pending = ordersSnap.docs.filter((d) => {
      const status = d.data().status;
      return !["Delivered", "Cancelled"].includes(status);
    }).length;

    document.getElementById("statPendingOrders").textContent = pending;

    // Earnings (commissions)
    const commissionsSnap = await getDocs(
      query(collection(db, "commissions"), where("vendorId", "==", user.uid))
    );

    let totalEarnings = 0;
    commissionsSnap.forEach((d) => {
      totalEarnings += Number(d.data().commissionAmount || 0);
    });

    document.getElementById("statEarnings").textContent = `₹${totalEarnings.toLocaleString("en-IN")}`;

  } catch (error) {
    console.error("Vendor dashboard stats error:", error);
  }

}

guardVendorPage(loadStats);
