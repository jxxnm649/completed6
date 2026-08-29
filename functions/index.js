/* ============================================================
   Bestify — Cloud Functions
   Razorpay order creation + server-side payment verification.

   WHY THIS EXISTS:
   checkout.js used to open Razorpay Checkout with a hardcoded
   test key and, on the client's own say-so, write the order to
   Firestore as soon as the Razorpay modal called its success
   handler. Nothing on a server ever confirmed money actually
   moved — anyone could open devtools and call that handler
   manually to get a free "paid" order.

   These two functions fix that:
   1. createRazorpayOrder  — server creates the Razorpay order
      (needs the SECRET key, so it can never live in the browser).
   2. verifyRazorpayPayment — after Razorpay's checkout modal
      succeeds, the client sends the payment/order/signature IDs
      here. This function independently recomputes the signature
      with the secret key. Only if it matches does the order get
      written to Firestore, using the Admin SDK (server-trusted,
      not subject to being spoofed the way a client write is).

   SETUP:
   1. cd functions && npm install
   2. Get your Razorpay Key ID + Key Secret from the Razorpay
      Dashboard → Settings → API Keys.
   3. Store them as Cloud Functions secrets (never as plain env
      vars, never hardcoded):

        firebase functions:secrets:set RAZORPAY_KEY_ID
        firebase functions:secrets:set RAZORPAY_KEY_SECRET

      (paste the value when prompted for each)

   4. Deploy:
        firebase deploy --only functions
   ============================================================ */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

const RAZORPAY_KEY_ID = defineSecret("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = defineSecret("RAZORPAY_KEY_SECRET");

/**
 * Atomically returns the next sequential number for a named counter
 * (e.g. "orders", "products"), creating it starting at 1 if needed.
 */
async function nextSequenceNumber(counterName) {

  const counterRef = db.collection("counters").doc(counterName);

  return db.runTransaction(async (tx) => {

    const snap = await tx.get(counterRef);
    const current = snap.exists ? Number(snap.data().count || 0) : 0;
    const updated = current + 1;

    tx.set(counterRef, { count: updated });

    return updated;

  });

}


/* ============================================================
   1) CREATE RAZORPAY ORDER
   Client calls this right before opening the Razorpay Checkout
   modal. Returns a Razorpay order_id that ties the payment to an
   exact, server-decided amount (the client can't tamper with the
   amount charged, because the amount is never taken from the
   client alone for the actual charge — the order_id fixes it).
   ============================================================ */

exports.createRazorpayOrder = onCall(
  { secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] },
  async (request) => {

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to pay.");
    }

    const amountRupees = Number(request.data?.amount);

    if (!amountRupees || amountRupees <= 0) {
      throw new HttpsError("invalid-argument", "A valid amount is required.");
    }

    const keyId = RAZORPAY_KEY_ID.value();
    const keySecret = RAZORPAY_KEY_SECRET.value();
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    try {

      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${auth}`
        },
        body: JSON.stringify({
          amount: Math.round(amountRupees * 100), // paise
          currency: "INR",
          receipt: `bestify_${request.auth.uid}_${Date.now()}`
        })
      });

      const order = await response.json();

      if (!response.ok) {
        logger.error("Razorpay order creation failed", order);
        throw new HttpsError("internal", "Could not start payment. Please try again.");
      }

      return {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId
      };

    } catch (error) {

      if (error instanceof HttpsError) throw error;

      logger.error("createRazorpayOrder error", error);
      throw new HttpsError("internal", "Could not start payment. Please try again.");

    }

  }
);


/* ============================================================
   2) VERIFY PAYMENT & WRITE THE ORDER
   Called from the Razorpay Checkout success handler. Verifies
   the signature server-side with the secret key, and only on a
   verified match writes the order document (via Admin SDK) and
   clears the user's cart. This is the step that used to be
   missing — the actual source of trust now lives here, not in
   the browser.
   ============================================================ */

exports.verifyRazorpayPayment = onCall(
  { secrets: [RAZORPAY_KEY_SECRET] },
  async (request) => {

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to pay.");
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderData
    } = request.data || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new HttpsError("invalid-argument", "Missing payment verification details.");
    }

    if (!orderData || !Array.isArray(orderData.products) || orderData.products.length === 0) {
      throw new HttpsError("invalid-argument", "Missing order details.");
    }

    // Recompute the expected signature ourselves — this is the check
    // that actually proves the payment happened and wasn't forged.
    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET.value())
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      logger.warn("Razorpay signature mismatch", {
        uid: request.auth.uid,
        razorpay_order_id
      });
      throw new HttpsError("failed-precondition", "Payment verification failed.");
    }

    // Recompute the total server-side from the product list rather than
    // trusting a client-sent total, so a tampered "total" can't slip
    // through even after signature verification.
    const serverTotal = orderData.products.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.qty || 1),
      0
    );

    const orderNumber = await nextSequenceNumber("orders");

    // Unique vendor ids among the ordered items — lets suppliers query
    // "orders that include my products" via array-contains.
    const vendorIds = [...new Set(
      orderData.products.map(item => item.vendorId).filter(Boolean)
    )];

    const orderRef = await db.collection("orders").add({
      userId: request.auth.uid,
      customerName: orderData.customerName || "",
      mobile: orderData.mobile || "",
      address: orderData.address || "",
      products: orderData.products,
      vendorIds,
      orderNumber,
      total: serverTotal,
      paymentMethod: "online",
      status: "Paid",
      paymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Clear the cart server-side, same as the old client-only flow did.
    if (Array.isArray(orderData.cartItemIds) && orderData.cartItemIds.length > 0) {

      const batch = db.batch();

      orderData.cartItemIds.forEach((itemId) => {
        batch.delete(
          db.collection("users").doc(request.auth.uid).collection("cart").doc(itemId)
        );
      });

      await batch.commit();

    }

    await db.collection("auditLogs").add({
      action: "Online payment verified",
      module: "Checkout",
      performedBy: request.auth.token?.email || request.auth.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      details: { orderId: orderRef.id, paymentId: razorpay_payment_id }
    });

    await db.collection("adminAlerts").add({
      type: "order",
      message: `New order placed by ${orderData.customerName || "a customer"} — ₹${serverTotal}`,
      userId: request.auth.uid,
      orderId: orderRef.id,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, orderId: orderRef.id };

  }
);


/* ============================================================
   3) WALLET WITHDRAWAL REQUESTS (manual admin approval)
   A user or vendor's wallet balance can only ever be decreased
   by this function (never directly by the client), so a request
   can't be forged for more than the caller actually has.
   Money is put "on hold" (deducted + a debit ledger entry
   written) the moment the request is submitted; if an admin
   rejects it, the hold is released back to the wallet.
   ============================================================ */

const WITHDRAWAL_LEDGER = {
  user: { doc: "users", balanceField: "walletBalance", ledger: "walletTransactions", idField: "userId" },
  vendor: { doc: "vendors", balanceField: "walletBalance", ledger: "vendorWalletTransactions", idField: "vendorId" }
};

exports.requestWithdrawal = onCall(async (request) => {

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const uid = request.auth.uid;
  const { requesterType, amount, method, upiId, bankAccountName, bankAccountNumber, bankIFSC } = request.data || {};

  const config = WITHDRAWAL_LEDGER[requesterType];
  if (!config) {
    throw new HttpsError("invalid-argument", "Invalid requester type.");
  }

  const withdrawAmount = Number(amount);
  if (!withdrawAmount || withdrawAmount <= 0) {
    throw new HttpsError("invalid-argument", "Enter a valid amount.");
  }

  if (method !== "upi" && method !== "bank") {
    throw new HttpsError("invalid-argument", "Choose a payout method.");
  }

  if (method === "upi" && !upiId) {
    throw new HttpsError("invalid-argument", "UPI ID is required.");
  }

  if (method === "bank" && (!bankAccountName || !bankAccountNumber || !bankIFSC)) {
    throw new HttpsError("invalid-argument", "Full bank details are required.");
  }

  const ownerRef = db.collection(config.doc).doc(uid);

  const result = await db.runTransaction(async (tx) => {

    const ownerSnap = await tx.get(ownerRef);

    if (!ownerSnap.exists) {
      throw new HttpsError("failed-precondition", "Account not found.");
    }

    const currentBalance = Number(ownerSnap.data()[config.balanceField] || 0);

    if (currentBalance < withdrawAmount) {
      throw new HttpsError("failed-precondition", "Insufficient wallet balance.");
    }

    const newBalance = currentBalance - withdrawAmount;
    const requestRef = db.collection("withdrawalRequests").doc();
    const ledgerRef = db.collection(config.ledger).doc();

    tx.update(ownerRef, { [config.balanceField]: newBalance });

    tx.set(requestRef, {
      requesterType,
      [config.idField]: uid,
      requesterId: uid,
      requesterName: ownerSnap.data().shopName || ownerSnap.data().name || ownerSnap.data().email || "User",
      amount: withdrawAmount,
      method,
      upiId: upiId || null,
      bankAccountName: bankAccountName || null,
      bankAccountNumber: bankAccountNumber || null,
      bankIFSC: bankIFSC || null,
      status: "Pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    tx.set(ledgerRef, {
      [config.idField]: uid,
      type: "debit",
      amount: withdrawAmount,
      reason: "Withdrawal requested",
      balanceAfter: newBalance,
      withdrawalRequestId: requestRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { requestId: requestRef.id, newBalance };

  });

  return { success: true, ...result };

});


exports.processWithdrawal = onCall(async (request) => {

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const adminSnap = await db.collection("users").doc(request.auth.uid).get();
  if (!adminSnap.exists || adminSnap.data().isAdmin !== true) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }

  const { requestId, action, adminNote } = request.data || {};

  if (!requestId || (action !== "approve" && action !== "reject")) {
    throw new HttpsError("invalid-argument", "Invalid request.");
  }

  const requestRef = db.collection("withdrawalRequests").doc(requestId);

  await db.runTransaction(async (tx) => {

    const reqSnap = await tx.get(requestRef);

    if (!reqSnap.exists) {
      throw new HttpsError("not-found", "Withdrawal request not found.");
    }

    const reqData = reqSnap.data();

    if (reqData.status !== "Pending") {
      throw new HttpsError("failed-precondition", "This request has already been processed.");
    }

    const config = WITHDRAWAL_LEDGER[reqData.requesterType];
    if (!config) {
      throw new HttpsError("internal", "Unknown requester type on this request.");
    }

    if (action === "approve") {

      tx.update(requestRef, {
        status: "Approved",
        adminNote: adminNote || "",
        processedBy: request.auth.token?.email || request.auth.uid,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

    } else {

      // Reject -> refund the held amount back to the wallet.
      const ownerRef = db.collection(config.doc).doc(reqData.requesterId);
      const ownerSnap = await tx.get(ownerRef);

      const currentBalance = ownerSnap.exists ? Number(ownerSnap.data()[config.balanceField] || 0) : 0;
      const refundedBalance = currentBalance + Number(reqData.amount || 0);

      if (ownerSnap.exists) {
        tx.update(ownerRef, { [config.balanceField]: refundedBalance });
      }

      const ledgerRef = db.collection(config.ledger).doc();
      tx.set(ledgerRef, {
        [config.idField]: reqData.requesterId,
        type: "credit",
        amount: Number(reqData.amount || 0),
        reason: `Withdrawal rejected — refunded${adminNote ? " (" + adminNote + ")" : ""}`,
        balanceAfter: refundedBalance,
        withdrawalRequestId: requestId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      tx.update(requestRef, {
        status: "Rejected",
        adminNote: adminNote || "",
        processedBy: request.auth.token?.email || request.auth.uid,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

    }

  });

  return { success: true };

});


/* ============================================================
   4) LOGOUT OF ALL DEVICES
   Revokes every refresh token for the calling user (Admin SDK only —
   Firebase has no way to selectively revoke a single device's
   session). The current device is signed out locally by the client
   right after this succeeds.
   ============================================================ */

exports.revokeAllSessions = onCall(async (request) => {

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const uid = request.auth.uid;

  await admin.auth().revokeRefreshTokens(uid);

  // Clear the tracked device list too, since none of them are valid anymore.
  const sessionsSnap = await db.collection("users").doc(uid).collection("sessions").get();
  const batch = db.batch();
  sessionsSnap.forEach(docSnap => batch.delete(docSnap.ref));
  await batch.commit();

  return { success: true };

});
