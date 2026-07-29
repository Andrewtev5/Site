window.LampAccount = (() => {
const { state, escapeHtml, formatDate } = window.LampStorage;

function valueOrDash(value){
return value ? String(value) : "-";
}

function initials(name){
const parts = String(name || "Konto").trim().split(/\s+/).filter(Boolean);
return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "K";
}

async function refreshAccountFromApi(){
if(!state.apiToken) return state.currentUser;

try{
const payload = await window.LampStorage.apiFetch("/api/account", { method: "GET" });
if(payload.user){
window.LampStorage.saveSession(payload.user, state.apiToken);
}
}catch(error){
}

return state.currentUser;
}

async function renderAccountPage(){
if(window.LampUI.getPageType() !== "account") return;

const authRequired = document.getElementById("accountAuthRequired");
const content = document.getElementById("accountContent");
const user = await refreshAccountFromApi();

if(!authRequired || !content) return;

if(!user){
authRequired.hidden = false;
content.hidden = true;
return;
}

authRequired.hidden = true;
content.hidden = false;

document.getElementById("accountInitials").textContent = initials(user.name);
document.getElementById("accountName").textContent = valueOrDash(user.name);
document.getElementById("accountEmail").textContent = valueOrDash(user.email);
document.getElementById("accountFullName").textContent = valueOrDash(user.name);
document.getElementById("accountEmailValue").textContent = valueOrDash(user.email);
document.getElementById("accountPhone").textContent = valueOrDash(user.phone);
document.getElementById("accountCreatedAt").textContent = user.createdAt ? formatDate(user.createdAt) : "-";
document.getElementById("accountCity").textContent = valueOrDash(user.city);
document.getElementById("accountStreet").textContent = valueOrDash(user.street);
document.getElementById("accountBuilding").textContent = valueOrDash(user.building);
document.getElementById("accountApartment").textContent = valueOrDash(user.apartment);
}

function buildProductFromPurchase(item){
const product = window.LampProducts.getCatalogProduct(item.id) || {};
return {
...product,
...item,
name: product.name || item.id,
image: product.image || "images/lamp1.jpg",
price: product.price || "0 PLN",
description: product.description || "",
tag: product.tag || "Lampa",
};
}

async function loadPurchases(){
if(!state.apiToken){
return window.LampProducts.getLibrary().filter((item) => item.purchasedAt);
}

try{
const payload = await window.LampStorage.apiFetch("/api/purchases", { method: "GET" });
return Array.isArray(payload.items) ? payload.items.map((item) => ({
id: item.id || item.product_id || item.productId,
savedAt: item.savedAt,
purchasedAt: item.purchasedAt,
quantity: item.quantity || 1,
})) : [];
}catch(error){
return window.LampProducts.getLibrary().filter((item) => item.purchasedAt);
}
}

async function renderPurchaseHistory(){
if(window.LampUI.getPageType() !== "purchase-history") return;

const authRequired = document.getElementById("purchaseAuthRequired");
const content = document.getElementById("purchaseHistoryContent");
const list = document.getElementById("purchaseHistoryList");
const empty = document.getElementById("purchaseHistoryEmpty");
const intro = document.getElementById("purchaseHistoryIntro");

if(!authRequired || !content || !list || !empty || !intro) return;

if(!state.currentUser){
authRequired.hidden = false;
content.hidden = true;
return;
}

authRequired.hidden = true;
content.hidden = false;

const purchases = (await loadPurchases()).filter((item) => item.id && item.purchasedAt).map(buildProductFromPurchase);
intro.textContent = `${state.currentUser.name}, liczba zakupów demonstracyjnych: ${purchases.length}.`;
list.innerHTML = "";

if(!purchases.length){
empty.style.display = "block";
return;
}

empty.style.display = "none";
list.innerHTML = purchases.map((item) => `
<article class="purchase-history-card">
<img class="library-card-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
<div class="library-card-copy">
<span class="library-card-tag">${escapeHtml(item.tag)}</span>
<strong>${escapeHtml(item.name)}</strong>
<span>${escapeHtml(item.price)} - kupiono ${escapeHtml(formatDate(item.purchasedAt))}</span>
<span>${escapeHtml(item.description)}</span>
</div>
</article>
`).join("");
}

async function render(){
await renderAccountPage();
await renderPurchaseHistory();
}

return { render, renderAccountPage, renderPurchaseHistory };
})();
