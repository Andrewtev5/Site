window.LampProducts = (() => {
const storage = window.LampStorage;
const { state, escapeHtml, formatDate } = storage;
const t = (...args) => window.LampI18n.t(...args);

let libraryItems = [];
let cartItems = storage.getLocalCart();
let selectedThemeId = getThemeFromHash();

async function loadCatalogProducts(){
const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
const timeout = controller ? window.setTimeout(() => controller.abort(), 900) : null;

try{
const payload = await storage.apiFetch("/api/products", { method: "GET", signal: controller?.signal });

if(!payload || typeof payload.products !== "object"){
throw new Error("Invalid API payload");
}

window.LAMP_I18N.products = payload.products;
state.catalogSource = payload.source || "postgresql";
}catch(error){
state.catalogSource = "local";
console.warn("Catalog API unavailable. Falling back to local products.", error);
}finally{
if(timeout) window.clearTimeout(timeout);
}
}

function getThemeFromHash(){
const match = window.location.hash.match(/theme=([\w-]+)/);
return match ? match[1] : null;
}

function getProductThemes(){
return window.LAMP_I18N.productThemes || {};
}

function getTheme(themeId = selectedThemeId){
return getProductThemes()[themeId] || null;
}

function localizeTheme(theme){
if(!theme) return null;
return theme[state.language] || theme.en || theme.pl;
}

function getSelectedThemeProductIds(){
const theme = getTheme();
return Array.isArray(theme?.products) ? theme.products : [];
}

async function loadUserData(){
await Promise.allSettled([loadLibraryFromApi(), loadCartFromApi()]);
}

async function loadLibraryFromApi(){
if(!state.apiToken){
libraryItems = [];
return;
}

try{
const payload = await storage.apiFetch("/api/library", { method: "GET" });
libraryItems = Array.isArray(payload.items) ? payload.items : [];
}catch(error){
libraryItems = [];
}
}

async function loadCartFromApi(){
if(!state.apiToken){
cartItems = storage.getLocalCart();
return;
}

try{
const payload = await storage.apiFetch("/api/cart", { method: "GET" });
cartItems = Array.isArray(payload.items) ? payload.items : storage.getLocalCart();
storage.saveLocalCart(cartItems);
}catch(error){
cartItems = storage.getLocalCart();
}
}

function getCatalogProduct(productId){
const product = window.LAMP_I18N.products[productId];
if(!product) return null;

const localized = product[state.language] || product.en;
return {
id: productId,
image: product.image,
price: product.price,
name: localized.name,
tag: localized.tag,
description: localized.description,
meta: localized.meta || [],
imageAlt: localized.imageAlt
};
}

function buildProductPayload(productId){
const product = getCatalogProduct(productId);
if(product){
return {
id: product.id,
image: product.image,
price: product.price,
name: product.name,
tag: product.tag,
description: product.description
};
}

return { id: productId, image: "images/lamp1.jpg", price: "0 PLN", name: "Lamp", tag: "Lamp", description: "" };
}

function normalizeLibraryItem(item){
const product = getCatalogProduct(item?.id || item?.product_id) || {};

return {
id: item?.id || item?.product_id || product.id || `lamp-${Date.now()}`,
image: product.image || item?.image || "images/lamp1.jpg",
price: product.price || item?.price || "0 PLN",
name: product.name || item?.name || "Lamp",
tag: product.tag || item?.tag || "Lamp",
description: product.description || item?.description || "",
savedAt: item?.savedAt || item?.saved_at || new Date().toISOString(),
purchasedAt: item?.purchasedAt || item?.purchased_at || null
};
}

function normalizeCartItem(item){
const product = getCatalogProduct(item?.id || item?.product_id) || {};
return {
id: item?.id || item?.product_id || product.id || `lamp-${Date.now()}`,
image: product.image || item?.image || "images/lamp1.jpg",
price: product.price || item?.price || "0 PLN",
name: product.name || item?.name || "Lamp",
tag: product.tag || item?.tag || "Lamp",
quantity: Math.max(1, Number(item?.quantity || 1)),
addedAt: item?.addedAt || item?.savedAt || item?.saved_at || new Date().toISOString()
};
}

function parsePrice(price){
const amount = Number(String(price || "0").replace(",", ".").match(/[\d.]+/)?.[0] || 0);
return Number.isFinite(amount) ? amount : 0;
}

function formatPrice(amount){
return `${amount.toFixed(0)} PLN`;
}

function getLibrary(){
return libraryItems.map(normalizeLibraryItem);
}

function getCart(){
return cartItems.map(normalizeCartItem);
}

function getUserStats(){
const saved = getLibrary();
return {
savedCount: saved.length,
purchasedCount: saved.filter((item) => item.purchasedAt).length
};
}

function getProductState(productId){
const item = getLibrary().find((entry) => entry.id === productId);
return { saved: Boolean(item), purchased: Boolean(item?.purchasedAt) };
}

function renderProductThemes(){
const themesRoot = document.getElementById("productThemes");
if(!themesRoot) return;

const themes = getProductThemes();
themesRoot.innerHTML = Object.entries(themes).map(([themeId, theme]) => {
const localized = localizeTheme(theme);
const count = Array.isArray(theme.products) ? theme.products.length : 0;
const isActive = themeId === selectedThemeId;

return `
<button class="theme-card${isActive ? " active" : ""}" type="button" data-product-theme="${escapeHtml(themeId)}" aria-pressed="${String(isActive)}">
<span class="theme-media"><img src="${escapeHtml(theme.image)}" alt="${escapeHtml(localized.title)}" decoding="async"></span>
<span class="theme-copy">
<span class="theme-kicker">${escapeHtml(localized.kicker)}</span>
<strong>${escapeHtml(localized.title)}</strong>
<span>${escapeHtml(localized.description)}</span>
<span class="theme-meta">${escapeHtml(t("themes.count", { count }))}</span>
</span>
<span class="theme-cta">${escapeHtml(localized.cta)}</span>
</button>
`;
}).join("");
}

function renderCatalogProducts(){
const productsGrid = document.getElementById("productsGrid");
const catalogSection = document.querySelector(".catalog-section");
const catalogTitle = document.getElementById("catalogTitle");
const catalogText = document.getElementById("catalogSectionText");
const allProductIds = Object.keys(window.LAMP_I18N.products || {});
const selectedTheme = getTheme();
const localizedTheme = localizeTheme(selectedTheme);
const productIds = selectedTheme ? getSelectedThemeProductIds().filter((productId) => window.LAMP_I18N.products[productId]) : [];
const firstStatValue = document.querySelector(".hero-stats .stat-card .stat-value");

if(firstStatValue) firstStatValue.textContent = String(allProductIds.length);
if(!productsGrid) return;

catalogSection?.classList.toggle("catalog-waiting", !selectedTheme);

if(catalogTitle){
catalogTitle.textContent = localizedTheme?.title || t("catalog.sectionTitle");
}

if(catalogText){
catalogText.textContent = localizedTheme?.description || t("catalog.sectionText");
}

if(!selectedTheme){
productsGrid.innerHTML = `
<div class="catalog-empty">
<strong>${escapeHtml(t("themes.emptyTitle"))}</strong>
<p>${escapeHtml(t("themes.emptyText"))}</p>
</div>
`;
return;
}

productsGrid.innerHTML = productIds.map((productId) => {
const product = getCatalogProduct(productId);
if(!product) return "";

return `
<article class="product" data-product-card data-product-id="${escapeHtml(product.id)}">
<img src="${escapeHtml(product.image)}" class="product-image" alt="${escapeHtml(product.imageAlt)}" loading="lazy" decoding="async">
<div class="product-info">
<div class="product-topline"><h3>${escapeHtml(product.name)}</h3><span class="product-tag">${escapeHtml(product.tag)}</span></div>
<p class="description">${escapeHtml(product.description)}</p>
<p class="price">${escapeHtml(product.price)}</p>
<div class="product-meta">${product.meta.slice(0, 3).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
<div class="product-actions">
<button class="product-action secondary" type="button" data-add-library data-product-id="${escapeHtml(product.id)}"></button>
<button class="product-action secondary" type="button" data-add-cart data-product-id="${escapeHtml(product.id)}"></button>
<button class="product-action" type="button" data-buy-product data-product-id="${escapeHtml(product.id)}"></button>
</div>
</div>
</article>
`;
}).join("");
}

function selectProductTheme(themeId){
if(!getProductThemes()[themeId]) return;
selectedThemeId = themeId;
window.location.hash = `theme=${themeId}`;
renderProductThemes();
renderCatalogProducts();
renderProductActions();
document.querySelector(".catalog-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderProductActions(){
document.querySelectorAll("[data-add-library]").forEach((button) => {
const stateForProduct = getProductState(button.dataset.productId || "");
button.textContent = stateForProduct.saved ? t("buttons.savedInLibrary") : t("buttons.addToLibrary");
button.disabled = stateForProduct.saved;
});

document.querySelectorAll("[data-buy-product]").forEach((button) => {
const stateForProduct = getProductState(button.dataset.productId || "");
button.textContent = stateForProduct.purchased ? t("buttons.purchased") : t("buttons.buyNow");
button.disabled = stateForProduct.purchased;
});

document.querySelectorAll("[data-add-cart]").forEach((button) => {
button.textContent = t("cart.add");
});
}

function renderLibrary(){
const currentUser = state.currentUser;
const libraryIntro = document.getElementById("libraryIntro");
const libraryList = document.getElementById("libraryList");
const libraryEmptyState = document.getElementById("libraryEmptyState");
if(!libraryIntro || !libraryList || !libraryEmptyState) return;

libraryList.innerHTML = "";

if(!currentUser){
libraryIntro.textContent = t("account.guestText");
libraryEmptyState.style.display = "block";
libraryEmptyState.innerHTML = `<strong>${escapeHtml(t("library.authRequiredTitle"))}</strong><p>${escapeHtml(t("library.authRequiredText"))}</p>`;
return;
}

const savedItems = getLibrary();
const purchasedCount = savedItems.filter((item) => item.purchasedAt).length;
libraryIntro.textContent = t("library.intro", { name: currentUser.name, savedCount: savedItems.length, purchasedCount });

if(savedItems.length === 0){
libraryEmptyState.style.display = "block";
libraryEmptyState.innerHTML = `<strong>${escapeHtml(t("library.emptyTitle"))}</strong><p>${escapeHtml(t("library.emptyText"))}</p>`;
return;
}

libraryEmptyState.style.display = "none";

savedItems.forEach((item) => {
const card = document.createElement("article");
card.className = "library-card";
card.innerHTML = `
<img class="library-card-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
<div class="library-card-copy">
<span class="library-card-tag">${escapeHtml(item.tag)}</span>
<strong>${escapeHtml(item.name)}</strong>
<span>${escapeHtml(t("library.savedOn", { price: item.price, date: formatDate(item.savedAt) }))}</span>
<span>${escapeHtml(item.description)}</span>
<span class="library-card-status${item.purchasedAt ? " purchased" : ""}">${escapeHtml(item.purchasedAt ? t("library.purchasedOn", { date: formatDate(item.purchasedAt) }) : t("library.readyForPurchase"))}</span>
</div>
<div class="library-card-actions">
<button class="library-buy" type="button" data-library-buy="${escapeHtml(item.id)}"${item.purchasedAt ? " disabled" : ""}>${escapeHtml(item.purchasedAt ? t("buttons.purchased") : t("buttons.buy"))}</button>
<button class="library-remove" type="button" data-library-remove="${escapeHtml(item.id)}">${escapeHtml(t("buttons.remove"))}</button>
</div>
`;
libraryList.appendChild(card);
});
}

function renderCart(){
const cartList = document.getElementById("cartList") || document.querySelector("[data-cart-list]");
const cartTotal = document.getElementById("cartTotal") || document.querySelector("[data-cart-total]");
const cartCount = document.getElementById("cartCount");
const items = getCart();
const total = items.reduce((sum, item) => sum + parsePrice(item.price) * item.quantity, 0);
const count = items.reduce((sum, item) => sum + item.quantity, 0);

if(cartCount) cartCount.textContent = String(count);
if(cartTotal) cartTotal.textContent = formatPrice(total);
if(!cartList) return;

if(!items.length){
cartList.innerHTML = `<div class="library-empty"><strong>${escapeHtml(t("cart.emptyTitle"))}</strong><p>${escapeHtml(t("cart.emptyText"))}</p></div>`;
return;
}

cartList.innerHTML = items.map((item) => `
<article class="cart-item">
<img class="cart-item-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
<div class="cart-item-copy">
<strong>${escapeHtml(item.name)}</strong>
<span>${escapeHtml(item.price)} x ${escapeHtml(item.quantity)}</span>
</div>
<div class="cart-item-actions">
<button class="library-buy" type="button" data-cart-buy="${escapeHtml(item.id)}">${escapeHtml(t("buttons.buy"))}</button>
<button class="library-remove" type="button" data-cart-remove="${escapeHtml(item.id)}">${escapeHtml(t("buttons.remove"))}</button>
</div>
</article>
`).join("");
}

function openCartModal(){
renderCart();
window.LampUI.openModal("cartModal");
}

function ensureSignedIn(actionType){
if(state.currentUser) return state.currentUser;

window.LampUI.showToast(actionType === "purchase" ? t("toasts.signInFirstPurchase") : t("toasts.signInFirstSave"), "error");
window.LampUI.goToPage("login.html");
return null;
}

async function addToLibrary(product){
if(!ensureSignedIn("save")) return;

const existingItem = getLibrary().find((item) => item.id === product.id);
if(existingItem){
window.LampUI.showToast(t("toasts.alreadyInLibrary"), "error");
return;
}

try{
await storage.apiFetch("/api/library", { method: "POST", body: JSON.stringify({ productId: product.id }) });
await loadLibraryFromApi();
}catch(error){
libraryItems = [...libraryItems, { id: product.id, savedAt: new Date().toISOString(), purchasedAt: null }];
}

syncUi();
window.LampUI.showToast(t("toasts.addedToLibrary", { name: product.name }));
}

async function buyProduct(product, source = "catalog"){
if(!ensureSignedIn("purchase")) return;

const existingItem = getLibrary().find((item) => item.id === product.id);
if(existingItem?.purchasedAt){
window.LampUI.showToast(t("toasts.alreadyPurchased"), "error");
return;
}

try{
await storage.apiFetch("/api/purchase", { method: "POST", body: JSON.stringify({ productId: product.id }) });
await Promise.allSettled([loadLibraryFromApi(), loadCartFromApi()]);
}catch(error){
const now = new Date().toISOString();
libraryItems = existingItem
? libraryItems.map((item) => item.id === product.id ? { ...item, purchasedAt: item.purchasedAt || now } : item)
: [...libraryItems, { id: product.id, savedAt: now, purchasedAt: now }];
cartItems = cartItems.filter((item) => item.id !== product.id);
storage.saveLocalCart(cartItems);
}

syncUi();
const message = t("toasts.purchaseComplete", { name: product.name });

if(source === "catalog"){
window.LampUI.goToPage("library.html", { message, type: "success" });
return;
}

window.LampUI.showToast(message);
}

async function removeFromLibrary(productId){
if(!state.currentUser) return;

try{
await storage.apiFetch("/api/library", { method: "DELETE", body: JSON.stringify({ productId }) });
await loadLibraryFromApi();
}catch(error){
libraryItems = libraryItems.filter((item) => item.id !== productId);
}

syncUi();
window.LampUI.showToast(t("toasts.removedFromLibrary"));
}

async function addToCart(product){
const existing = cartItems.find((item) => item.id === product.id || item.product_id === product.id);

try{
if(state.apiToken){
await storage.apiFetch("/api/cart", { method: "POST", body: JSON.stringify({ productId: product.id, quantity: 1 }) });
await loadCartFromApi();
}else if(existing){
cartItems = cartItems.map((item) => item.id === product.id ? { ...item, quantity: Number(item.quantity || 1) + 1 } : item);
}else{
cartItems = [...cartItems, { ...product, quantity: 1, addedAt: new Date().toISOString() }];
}
}catch(error){
cartItems = existing
? cartItems.map((item) => item.id === product.id ? { ...item, quantity: Number(item.quantity || 1) + 1 } : item)
: [...cartItems, { ...product, quantity: 1, addedAt: new Date().toISOString() }];
}

storage.saveLocalCart(cartItems);
syncUi();
window.LampUI.showToast(t("cart.added", { name: product.name }));
}

async function removeFromCart(productId){
try{
if(state.apiToken){
await storage.apiFetch("/api/cart", { method: "DELETE", body: JSON.stringify({ productId }) });
await loadCartFromApi();
}else{
cartItems = cartItems.filter((item) => item.id !== productId);
}
}catch(error){
cartItems = cartItems.filter((item) => item.id !== productId);
}

storage.saveLocalCart(cartItems);
syncUi();
}

function bindProductActions(){
document.addEventListener("click", (event) => {
const addLibrary = event.target.closest("[data-add-library]");
const buyButton = event.target.closest("[data-buy-product], [data-library-buy], [data-cart-buy]");
const addCart = event.target.closest("[data-add-cart]");
const removeLibrary = event.target.closest("[data-library-remove]");
const removeCart = event.target.closest("[data-cart-remove]");
const themeButton = event.target.closest("[data-product-theme]");

if(themeButton) selectProductTheme(themeButton.dataset.productTheme || "");
if(addLibrary) addToLibrary(buildProductPayload(addLibrary.dataset.productId || ""));
if(addCart) addToCart(buildProductPayload(addCart.dataset.productId || ""));
if(buyButton){
const productId = buyButton.dataset.productId || buyButton.dataset.libraryBuy || buyButton.dataset.cartBuy || "";
buyProduct(buildProductPayload(productId), buyButton.dataset.productId ? "catalog" : "library");
}
if(removeLibrary) removeFromLibrary(removeLibrary.dataset.libraryRemove || "");
if(removeCart) removeFromCart(removeCart.dataset.cartRemove || "");
});
}

function syncUi(){
window.LampUI.renderMenuAccount();
renderProductThemes();
renderCatalogProducts();
renderLibrary();
renderCart();
renderProductActions();
window.LampSearch?.renderSearchResults?.();
window.LampUI.highlightCurrentPage();
}

return {
loadCatalogProducts,
loadUserData,
getCatalogProduct,
buildProductPayload,
getLibrary,
getCart,
getUserStats,
getProductState,
renderProductThemes,
renderCatalogProducts,
renderLibrary,
renderCart,
openCartModal,
addToLibrary,
buyProduct,
removeFromLibrary,
addToCart,
removeFromCart,
bindProductActions,
syncUi
};
})();
