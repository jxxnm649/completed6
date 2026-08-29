import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const chatMessages = document.getElementById("chatMessages");
const chatReplyForm = document.getElementById("chatReplyForm");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");

let currentUser = null;
let unsubscribeMessages = null;

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatTime(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function renderMessages(messages) {

  if (!messages.length) {
    chatMessages.innerHTML = `<div class="chat-empty">👋 Say hello! Ask us anything about your order or products.</div>`;
    return;
  }

  chatMessages.innerHTML = messages.map((m) => {
    const isMine = m.sender !== "admin";
    return `
      <div class="chat-bubble-row ${isMine ? "mine" : "theirs"}">
        <div class="chat-bubble">
          <div class="chat-bubble-text"></div>
          <div class="chat-bubble-time">${formatTime(m.createdAt)}</div>
        </div>
      </div>
    `;
  }).join("");

  // Set message text via textContent (not innerHTML) so nothing in the
  // stored text can ever be interpreted as markup or otherwise mangled.
  const textNodes = chatMessages.querySelectorAll(".chat-bubble-text");
  messages.forEach((m, i) => {
    if (textNodes[i]) textNodes[i].textContent = m.text || "";
  });

  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });

}

function listenForMessages(uid) {

  // Guard against a duplicate subscription if onAuthStateChanged ever
  // fires more than once in the same page load (token refresh, etc.) —
  // without this, old and new listeners would both be live at once.
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  const q = query(collection(db, "chats", uid, "messages"), orderBy("createdAt", "asc"));

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMessages(messages);
  }, (error) => {
    console.error("Chat listen error:", error);
    chatMessages.innerHTML = `<div class="chat-empty">❌ Unable to load chat.</div>`;
  });

}

async function ensureChatDoc(user) {

  const chatRef = doc(db, "chats", user.uid);
  const chatSnap = await getDoc(chatRef);

  if (!chatSnap.exists()) {
    await setDoc(chatRef, {
      userId: user.uid,
      customerName: user.displayName || user.email || "Customer",
      lastMessage: "",
      lastMessageAt: serverTimestamp(),
      status: "Open",
      createdAt: serverTimestamp()
    });
  }

}

chatReplyForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  if (chatSendBtn.disabled) return; // ignore double-tap while a send is in flight

  const text = chatInput.value.trim();
  if (!text || !currentUser) return;

  chatSendBtn.disabled = true;
  chatInput.value = "";

  try {

    await ensureChatDoc(currentUser);

    await addDoc(collection(db, "chats", currentUser.uid, "messages"), {
      sender: "user",
      text,
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, "chats", currentUser.uid), {
      lastMessage: text,
      lastMessageAt: serverTimestamp(),
      status: "Open"
    });

  } catch (error) {
    console.error("Send message error:", error);
    alert(error.message || "Failed to send message.");
    chatInput.value = text; // restore so the user doesn't lose what they typed
  } finally {
    chatSendBtn.disabled = false;
  }

});

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    await ensureChatDoc(user);
    listenForMessages(user.uid);
  } catch (error) {
    console.error("Chat init error:", error);
    chatMessages.innerHTML = `<div class="chat-empty">❌ Unable to load chat.</div>`;
  }

});
