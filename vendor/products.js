import { db } from "../firebase.js";

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  deleteDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  openModal,
  closeModal,
  showToast
} from "../design-system.js";

import { guardVendorPage, wireLogout } from "./vendor-common.js";

import { nextSequenceNumber } from "../counters.js";

wireLogout(document.getElementById("logoutBtn"));

const form = document.getElementById("productForm");
const productsList = document.getElementById("productsList");
const productCount = document.getElementById("productCount");
const productSearch = document.getElementById("productSearch");
const productStatusFilter = document.getElementById("productStatusFilter");

const imageFile = document.getElementById("imageFile");
const previewRow = document.getElementById("previewRow");
const imageCountLabel = document.getElementById("imageCountLabel");
const categoryList = document.getElementById("categoryList");

const returnPolicySelect = document.getElementById("returnPolicy");
const returnPolicyCustom = document.getElementById("returnPolicyCustom");
const warrantySelect = document.getElementById("warranty");
const warrantyCustom = document.getElementById("warranty" + "Custom");

function toggleCustomInput(select, input) {
  input.style.display = select.value === "Custom" ? "block" : "none";
}

if (returnPolicySelect) {
  returnPolicySelect.addEventListener("change", () => toggleCustomInput(returnPolicySelect, returnPolicyCustom));
}
if (warrantySelect) {
  warrantySelect.addEventListener("change", () => toggleCustomInput(warrantySelect, warrantyCustom));
}

const MAX_IMAGES = 8;

const addProductBtn = document.getElementById("addProductBtn");
const productFormModal = document.getElementById("productFormModal");
const productFormCloseBtn = document.getElementById("productFormCloseBtn");
const productFormTitle = document.getElementById("productFormTitle");
const productFormSubmitBtn = document.getElementById("productFormSubmitBtn");

let editMode = false;
let editProductId = null;
let existingImages = [];
let selectedFiles = [];
let allProducts = [];
let currentVendorId = null;


/* =========================
   IMAGE PREVIEW (accumulates up to MAX_IMAGES)
========================= */

imageFile.value = "";

imageFile.addEventListener("change", () => {

  const newFiles = Array.from(imageFile.files);
  const usedSlots = existingImages.length + selectedFiles.length;
  const remainingSlots = MAX_IMAGES - usedSlots;

  if (newFiles.length > remainingSlots) {
    showToast(`Max ${MAX_IMAGES} images allowed. Added first ${Math.max(remainingSlots, 0)}.`, "danger");
  }

  selectedFiles = selectedFiles.concat(newFiles.slice(0, Math.max(remainingSlots, 0)));

  imageFile.value = "";

  renderPreview();

});

function thumb(src, onRemove) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";

  const img = document.createElement("img");
  img.src = src;
  img.width = 120;
  img.height = 120;
  img.style.objectFit = "cover";
  img.style.borderRadius = "10px";
  wrap.appendChild(img);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.textContent = "✕";
  removeBtn.style.cssText = "position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;border:none;background:#c62828;color:#fff;cursor:pointer;font-size:12px;line-height:1;";
  removeBtn.addEventListener("click", onRemove);
  wrap.appendChild(removeBtn);

  return wrap;
}

function renderPreview() {
  previewRow.innerHTML = "";

  existingImages.forEach((url, idx) => {
    previewRow.appendChild(thumb(url, () => {
      existingImages = existingImages.filter((_, i) => i !== idx);
      renderPreview();
    }));
  });

  selectedFiles.forEach((file, idx) => {
    previewRow.appendChild(thumb(URL.createObjectURL(file), () => {
      selectedFiles = selectedFiles.filter((_, i) => i !== idx);
      renderPreview();
    }));
  });

  if (imageCountLabel) {
    imageCountLabel.textContent = `${existingImages.length + selectedFiles.length}/${MAX_IMAGES}`;
  }
}


/* =========================
   MODAL OPEN / CLOSE
========================= */

function resetForm() {
  form.reset();
  document.getElementById("status").value = "Active";
  if (returnPolicySelect) { returnPolicySelect.value = "7 Days Return"; returnPolicyCustom.value = ""; returnPolicyCustom.style.display = "none"; }
  if (warrantySelect) { warrantySelect.value = "6 Month Warranty"; warrantyCustom.value = ""; warrantyCustom.style.display = "none"; }
  previewRow.innerHTML = "";
  existingImages = [];
  selectedFiles = [];
  imageFile.value = "";
  if (imageCountLabel) imageCountLabel.textContent = `0/${MAX_IMAGES}`;
  editMode = false;
  editProductId = null;
  productFormTitle.textContent = "Add Product";
  productFormSubmitBtn.textContent = "Save Product";
}

addProductBtn.addEventListener("click", () => {
  resetForm();
  openModal("productFormModal");
});

productFormCloseBtn.addEventListener("click", () => {
  closeModal("productFormModal");
});


/* =========================
   IMAGE UPLOAD (Cloudinary)
========================= */

async function uploadImages() {

  if (selectedFiles.length === 0 && existingImages.length === 0) {
    showToast("Select at least one image", "danger");
    return null;
  }

  const uploadedUrls = [];

  for (const file of selectedFiles) {

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "Bestifyimg");

    const response = await fetch(
      "https://api.cloudinary.com/v1_1/rgksliph/image/upload",
      { method: "POST", body: formData }
    );

    const data = await response.json();
    uploadedUrls.push(data.secure_url);

  }

  return [...existingImages, ...uploadedUrls].slice(0, MAX_IMAGES);

}


/* =========================
   SUBMIT (ADD / UPDATE)
========================= */

form.addEventListener("submit", async (e) => {

  e.preventDefault();

  productFormSubmitBtn.disabled = true;
  productFormSubmitBtn.textContent = editMode ? "Updating..." : "Saving...";

  try {

    const imageUrls = await uploadImages();

    if (!imageUrls || imageUrls.length === 0) {
      productFormSubmitBtn.disabled = false;
      productFormSubmitBtn.textContent = editMode ? "Update Product" : "Save Product";
      return;
    }

    const productData = {
      image: imageUrls[0],
      images: imageUrls,
      productName: document.getElementById("productName").value.trim(),
      category: document.getElementById("category").value.trim(),
      mrp: document.getElementById("mrp").value ? Number(document.getElementById("mrp").value) : 0,
      price: Number(document.getElementById("price").value),
      stock: Number(document.getElementById("stock").value),
      description: document.getElementById("description").value.trim(),
      sizes: document.getElementById("sizes").value
        ? document.getElementById("sizes").value.split(",").map(s => s.trim()).filter(Boolean)
        : [],
      colours: document.getElementById("colours").value
        ? document.getElementById("colours").value.split(",").map(s => s.trim()).filter(Boolean)
        : [],
      returnPolicy: document.getElementById("returnPolicy").value === "Custom"
        ? (document.getElementById("returnPolicyCustom").value.trim() || "7 Days Return")
        : document.getElementById("returnPolicy").value,
      warranty: document.getElementById("warranty").value === "Custom"
        ? (document.getElementById("warrantyCustom").value.trim() || "6 Month Warranty")
        : document.getElementById("warranty").value,
      status: document.getElementById("status").value,
      vendorId: currentVendorId,
      // Every vendor create/edit goes back to Pending review — it only
      // reaches the public storefront once an admin approves it.
      approvalStatus: "Pending",
      rejectionReason: ""
    };

    if (editMode) {
      await updateDoc(doc(db, "products", editProductId), productData);
      showToast("Product updated — sent for admin review", "success");
    } else {
      const seq = await nextSequenceNumber("products");
      productData.productCode = `Bestify${seq}`;
      await addDoc(collection(db, "products"), productData);
      showToast("Product submitted for admin review", "success");
    }

    closeModal("productFormModal");
    resetForm();
    loadProducts();

  } catch (error) {

    console.error("Product save error:", error);
    showToast(error.message || "Failed to save product.", "danger");

  } finally {

    productFormSubmitBtn.disabled = false;
    productFormSubmitBtn.textContent = editMode ? "Update Product" : "Save Product";

  }

});


/* =========================
   LOAD & RENDER PRODUCTS (own only)
========================= */

async function loadProducts() {

  try {

    const snapshot = await getDocs(
      query(collection(db, "products"), where("vendorId", "==", currentVendorId))
    );

    allProducts = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderProductList();

    if (categoryList) {
      const seen = new Map();
      allProducts.forEach((p) => {
        const raw = (p.category || "").toString().trim();
        if (raw && !seen.has(raw.toLowerCase())) seen.set(raw.toLowerCase(), raw);
      });
      categoryList.innerHTML = [...seen.values()]
        .map((c) => `<option value="${escapeHtml(c)}"></option>`)
        .join("");
    }

  } catch (error) {

    console.error("Products loading error:", error);
    productsList.innerHTML = `<div class="bf-card" style="padding:20px;">❌ Unable to load products.</div>`;

  }

}

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function getFilteredProducts() {

  const term = productSearch.value.trim().toLowerCase();
  const statusFilter = productStatusFilter.value;

  return allProducts.filter((product) => {

    const name = (product.productName || "").toLowerCase();
    const category = (product.category || "").toLowerCase();
    const status = product.status === "Inactive" ? "Inactive" : "Active";

    const matchesTerm = !term || name.includes(term) || category.includes(term);
    const matchesStatus = statusFilter === "All" || status === statusFilter;

    return matchesTerm && matchesStatus;

  });

}

function renderProductList() {

  const filtered = getFilteredProducts();

  productCount.textContent = `Total Products: ${allProducts.length}`;

  if (!filtered.length) {
    productsList.innerHTML = `<div class="bf-card" style="padding:20px;">No products found. Add your first product!</div>`;
    return;
  }

  productsList.innerHTML = filtered.map((product) => {

    const status = product.status === "Inactive" ? "Inactive" : "Active";
    const stock = product.stock ?? 0;

    const stockLabel =
      stock === 0 ? "Out of Stock" :
      stock <= 5 ? `${stock} left` :
      `${stock} in stock`;

    const stockClass =
      stock === 0 ? "bf-status-danger" :
      stock <= 5 ? "bf-status-warning" :
      "bf-status-success";

    const priceHtml =
      Number(product.mrp) > Number(product.price)
        ? `<span style="text-decoration:line-through;opacity:.55;font-size:12px;">₹${escapeHtml(String(product.mrp))}</span> <strong>₹${escapeHtml(String(product.price))}</strong>`
        : `<strong>₹${escapeHtml(String(product.price))}</strong>`;

    const approval = product.approvalStatus || "Approved";
    const approvalBadge =
      approval === "Pending" ? `<span class="bf-status-pill bf-status-pending">🕓 Pending Review</span>` :
      approval === "Rejected" ? `<span class="bf-status-pill bf-status-danger">❌ Rejected</span>` :
      `<span class="bf-status-pill bf-status-success">✅ Live</span>`;

    return `
      <div class="bf-card" style="padding:14px; display:flex; flex-direction:column; gap:8px;">

        <img src="${escapeHtml(product.image || "")}" alt="${escapeHtml(product.productName || "")}" style="width:100%; aspect-ratio:1/1; object-fit:cover; border-radius:10px;">

        <div style="font-weight:700; font-size:15px;">${escapeHtml(product.productName || "Unnamed product")}</div>
        <div style="font-size:12px; opacity:.7;">${escapeHtml(product.category || "Uncategorized")}</div>
        <div style="font-size:14px;">${priceHtml}</div>

        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${approvalBadge}
          <span class="bf-status-pill ${stockClass}">${escapeHtml(stockLabel)}</span>
          <span class="bf-status-pill ${status === "Active" ? "bf-status-success" : "bf-status-pending"}">${status}</span>
        </div>

        ${approval === "Rejected" && product.rejectionReason ? `
          <div style="font-size:12px;color:#c62828;background:#FBEAE6;padding:8px;border-radius:8px;">
            📝 ${escapeHtml(product.rejectionReason)}
          </div>
        ` : ""}

        <div style="display:flex; gap:8px; margin-top:6px;">
          <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm edit-product-btn" data-id="${escapeHtml(product.id)}" style="flex:1;">✏️ Edit</button>
          <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm delete-product-btn" data-id="${escapeHtml(product.id)}" data-name="${escapeHtml(product.productName || "this product")}" style="flex:1; color:#c62828;">🗑️ Delete</button>
        </div>

      </div>
    `;

  }).join("");

}

productSearch.addEventListener("input", renderProductList);
productStatusFilter.addEventListener("change", renderProductList);


/* =========================
   EDIT / DELETE
========================= */

async function editProduct(id) {

  try {

    const productRef = doc(db, "products", id);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists() || productSnap.data().vendorId !== currentVendorId) {
      showToast("Product not found", "danger");
      return;
    }

    const product = productSnap.data();

    existingImages = product.images && product.images.length
      ? product.images
      : (product.image ? [product.image] : []);

    selectedFiles = [];
    imageFile.value = "";
    renderPreview();

    document.getElementById("productName").value = product.productName || "";
    document.getElementById("category").value = product.category || "";
    document.getElementById("mrp").value = product.mrp || "";
    document.getElementById("price").value = product.price || "";
    document.getElementById("stock").value = product.stock ?? 0;
    document.getElementById("description").value = product.description || "";
    document.getElementById("sizes").value = (product.sizes || []).join(", ");
    document.getElementById("colours").value = (product.colours || []).join(", ");
    document.getElementById("status").value = product.status === "Inactive" ? "Inactive" : "Active";

    const STANDARD_RETURN = ["7 Days Return", "No Return"];
    const returnVal = product.returnPolicy || "7 Days Return";
    if (STANDARD_RETURN.includes(returnVal)) {
      returnPolicySelect.value = returnVal;
      returnPolicyCustom.style.display = "none";
      returnPolicyCustom.value = "";
    } else {
      returnPolicySelect.value = "Custom";
      returnPolicyCustom.value = returnVal;
      returnPolicyCustom.style.display = "block";
    }

    const STANDARD_WARRANTY = ["6 Month Warranty", "No Warranty"];
    const warrantyVal = product.warranty || "6 Month Warranty";
    if (STANDARD_WARRANTY.includes(warrantyVal)) {
      warrantySelect.value = warrantyVal;
      warrantyCustom.style.display = "none";
      warrantyCustom.value = "";
    } else {
      warrantySelect.value = "Custom";
      warrantyCustom.value = warrantyVal;
      warrantyCustom.style.display = "block";
    }

    editMode = true;
    editProductId = id;

    productFormTitle.textContent = "Edit Product";
    productFormSubmitBtn.textContent = "Update Product";

    openModal("productFormModal");

  } catch (error) {
    console.error("Edit product error:", error);
    showToast(error.message || "Failed to load product.", "danger");
  }

}

async function deleteProduct(id, name) {

  const ok = window.confirm(`Delete "${name}"? This cannot be undone.`);
  if (!ok) return;

  try {

    await deleteDoc(doc(db, "products", id));
    allProducts = allProducts.filter(p => p.id !== id);
    renderProductList();
    showToast("Product deleted", "success");

  } catch (error) {
    console.error("Delete product error:", error);
    showToast(error.message || "Failed to delete product.", "danger");
  }

}

productsList.addEventListener("click", (e) => {

  const editBtn = e.target.closest(".edit-product-btn");
  if (editBtn) {
    editProduct(editBtn.dataset.id);
    return;
  }

  const deleteBtn = e.target.closest(".delete-product-btn");
  if (deleteBtn) {
    deleteProduct(deleteBtn.dataset.id, deleteBtn.dataset.name);
  }

});


/* =========================
   ACCESS GUARD
========================= */

guardVendorPage((user, vendor) => {
  currentVendorId = user.uid;
  loadProducts();
});
