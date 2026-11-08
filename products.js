window.LampProducts = (() => {
const storage = window.LampStorage;
const { state, escapeHtml, formatDate } = storage;
const t = (...args) => window.LampI18n.t(...args);
const MAX_QUANTITY = 999;
const CATALOG_PAGE_SIZE = 12;
const DELIVERY_PRICES = { courier: 15, locker: 12 };
const FREE_DELIVERY_FROM = 200;

let libraryItems = [];
let cartItems = storage.getLocalCart();
let selectedThemeId = getThemeFromHash();
let purchaseInProgress = false;
let openProductId = null;
let catalogView = { sort: "default", maxPrice: null, visible: CATALOG_PAGE_SIZE };
const cartQuantityTimers = new WeakMap();

function restoreCachedCatalog(){
const products = storage.getCachedCatalog();
if(products){
window.LAMP_I18N.products = products;
state.catalogSource = "cache";
}
}

async function loadCatalogProducts(){
const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
const timeout = controller ? window.setTimeout(() => controller.abort(), 10000) : null;

try{
const payload = await storage.apiFetch("/api/products", { method: "GET", signal: controller?.signal });

if(!payload || typeof payload.products !== "object"){
throw new Error("Invalid API payload");
}

window.LAMP_I18N.products = payload.products;
state.catalogSource = payload.source || "mssql";
storage.saveCachedCatalog(payload.products);
}catch(error){
state.catalogSource = state.catalogSource === "cache" ? "cache" : "unavailable";
console.warn("Catalog API unavailable.", error);
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

function normalizeQuantity(value){
const quantity = Math.floor(Number(value));
if(!Number.isFinite(quantity)) return 1;
return Math.min(MAX_QUANTITY, Math.max(1, quantity));
}

function renderQuantityControl(productId, quantity = 1, cart = false){
const inputAttribute = cart ? "data-cart-quantity-input" : "data-product-quantity-input";
const cartAttribute = cart ? " data-cart-quantity" : "";
return `
<div class="quantity-control" data-quantity-control${cartAttribute} data-product-id="${escapeHtml(productId)}">
<button type="button" data-quantity-change="-1" aria-label="${escapeHtml(t("quantity.decrease"))}">−</button>
<input type="number" min="1" max="${MAX_QUANTITY}" step="1" value="${normalizeQuantity(quantity)}" ${inputAttribute} inputmode="numeric" aria-label="${escapeHtml(t("quantity.label"))}">
<button type="button" data-quantity-change="1" aria-label="${escapeHtml(t("quantity.increase"))}">+</button>
</div>
`;
}

function getRequestedQuantity(button, productId){
const scope = button?.closest("[data-product-card], .product-modal-copy, .library-card, .cart-item, .chat-product-card");
const input = scope?.querySelector(`[data-product-quantity-input], [data-cart-quantity-input]`)
|| document.querySelector(`[data-quantity-control][data-product-id="${CSS.escape(productId)}"] [data-product-quantity-input]`);
return normalizeQuantity(input?.value || 1);
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
const allCount = Object.keys(window.LAMP_I18N.products || {}).length;
const allCard = `
<button class="theme-card${selectedThemeId ? "" : " active"}" type="button" data-product-theme="" aria-pressed="${String(!selectedThemeId)}">
<span class="theme-media"><img src="images/lamp5.jpg" alt="" decoding="async"></span>
<span class="theme-copy">
<strong>${escapeHtml(t("catalog.allTitle"))}</strong>
<span class="theme-meta">${escapeHtml(t("themes.count", { count: allCount }))}</span>
</span>
</button>
`;

themesRoot.innerHTML = allCard + Object.entries(themes).map(([themeId, theme]) => {
const localized = localizeTheme(theme);
const count = Array.isArray(theme.products) ? theme.products.length : 0;
const isActive = themeId === selectedThemeId;

return `
<button class="theme-card${isActive ? " active" : ""}" type="button" data-product-theme="${escapeHtml(themeId)}" aria-pressed="${String(isActive)}">
<span class="theme-media"><img src="${escapeHtml(theme.image)}" alt="" decoding="async"></span>
<span class="theme-copy">
<strong>${escapeHtml(localized.title)}</strong>
<span class="theme-meta">${escapeHtml(t("themes.count", { count }))}</span>
</span>
</button>
`;
}).join("");
}

function catalogPosition(product){
return Number(String(product?.image || "").match(/\d+/)?.[0] || 0);
}

function getProductsForCatalog(){
const catalog = window.LAMP_I18N.products || {};
// The database returns ids alphabetically, which would open the catalog with a row of similar amber lamps.
const allIds = Object.keys(catalog).sort((left, right) => catalogPosition(catalog[left]) - catalogPosition(catalog[right]));
const ids = getTheme() ? getSelectedThemeProductIds().filter((productId) => catalog[productId]) : allIds;
return ids.map(getCatalogProduct).filter(Boolean);
}

function viewCatalogProducts(products){
const filtered = catalogView.maxPrice === null
? products
: products.filter((product) => parsePrice(product.price) <= catalogView.maxPrice);

if(catalogView.sort === "price-asc") return [...filtered].sort((left, right) => parsePrice(left.price) - parsePrice(right.price));
if(catalogView.sort === "price-desc") return [...filtered].sort((left, right) => parsePrice(right.price) - parsePrice(left.price));
if(catalogView.sort === "name") return [...filtered].sort((left, right) => left.name.localeCompare(right.name, window.LampI18n.getLocale()));
return filtered;
}

function renderProductCard(product){
const id = escapeHtml(product.id);
const name = escapeHtml(product.name);

return `
<article class="product" data-product-card data-product-id="${id}">
<button class="product-media" type="button" data-open-product="${id}" aria-label="${escapeHtml(t("product.open", { name: product.name }))}">
<img src="${escapeHtml(product.image)}" class="product-image" alt="${escapeHtml(product.imageAlt)}" loading="lazy" decoding="async">
<span class="product-media-overlay"><span>${escapeHtml(t("buttons.viewProduct"))}</span></span>
</button>
<button class="product-heart" type="button" data-library-toggle data-product-id="${id}"></button>
<div class="product-info">
<span class="product-tag">${escapeHtml(product.tag)}</span>
<h3><button class="product-name-link" type="button" data-open-product="${id}">${name}</button></h3>
<p class="description">${escapeHtml(product.description)}</p>
<p class="price">${escapeHtml(product.price)}</p>
<button class="product-action" type="button" data-add-cart data-product-id="${id}"></button>
</div>
</article>
`;
}

function renderCatalogSkeleton(productsGrid){
productsGrid.innerHTML = Array.from({ length: 8 }, () => `
<div class="product-skeleton" aria-hidden="true"><span class="skeleton-image"></span><span class="skeleton-line"></span><span class="skeleton-line short"></span></div>
`).join("");
}

function renderCatalogToolbar(products, shownCount){
const toolbar = document.getElementById("catalogToolbar");
if(!toolbar) return;

toolbar.hidden = !products.length;
const prices = products.map((product) => parsePrice(product.price));
const highest = Math.ceil(Math.max(0, ...prices));
const lowest = Math.floor(Math.min(highest, ...prices));
const slider = document.getElementById("catalogMaxPrice");
const sort = document.getElementById("catalogSort");
const priceValue = catalogView.maxPrice === null ? highest : Math.min(catalogView.maxPrice, highest);

if(sort) sort.value = catalogView.sort;
if(slider){
slider.min = String(lowest);
slider.max = String(highest);
slider.value = String(priceValue);
}

const priceLabel = document.getElementById("catalogMaxPriceValue");
if(priceLabel) priceLabel.textContent = t("catalog.priceUpTo", { price: priceValue });

const count = document.getElementById("catalogCount");
if(count) count.textContent = t("catalog.resultsCount", { shown: shownCount, total: viewCatalogProducts(products).length });
}

function renderCatalogProducts(){
const productsGrid = document.getElementById("productsGrid");
const catalogTitle = document.getElementById("catalogTitle");
const catalogText = document.getElementById("catalogSectionText");
const moreButton = document.getElementById("catalogMore");
const allProductIds = Object.keys(window.LAMP_I18N.products || {});
const localizedTheme = localizeTheme(getTheme());
const firstStatValue = document.querySelector(".hero-stats .stat-card .stat-value");

if(firstStatValue && allProductIds.length) firstStatValue.textContent = String(allProductIds.length);
if(!productsGrid) return;

if(catalogTitle) catalogTitle.textContent = localizedTheme?.title || t("catalog.allTitle");
if(catalogText) catalogText.textContent = localizedTheme?.description || t("catalog.sectionText");
if(moreButton) moreButton.hidden = true;

if(state.catalogSource === "unavailable"){
productsGrid.innerHTML = `
<div class="catalog-empty">
<strong>${escapeHtml(t("catalog.unavailableTitle"))}</strong>
<p>${escapeHtml(t("catalog.unavailableText"))}</p>
</div>
`;
renderCatalogToolbar([], 0);
return;
}

if(!allProductIds.length){
renderCatalogSkeleton(productsGrid);
renderCatalogToolbar([], 0);
return;
}

const products = getProductsForCatalog();
const viewed = viewCatalogProducts(products);
const visible = viewed.slice(0, catalogView.visible);

renderCatalogToolbar(products, visible.length);

if(!viewed.length){
productsGrid.innerHTML = `
<div class="catalog-empty">
<strong>${escapeHtml(t("catalog.noResultsTitle"))}</strong>
<p>${escapeHtml(t("catalog.noResultsText"))}</p>
</div>
`;
return;
}

productsGrid.innerHTML = visible.map(renderProductCard).join("");
if(moreButton){
moreButton.hidden = visible.length >= viewed.length;
moreButton.textContent = t("catalog.showMore", { count: Math.min(CATALOG_PAGE_SIZE, viewed.length - visible.length) });
}
}

function selectProductTheme(themeId){
if(themeId && !getProductThemes()[themeId]) return;
selectedThemeId = themeId || null;
catalogView = { ...catalogView, maxPrice: null, visible: CATALOG_PAGE_SIZE };
window.history.replaceState(null, "", themeId ? `#theme=${themeId}` : window.location.pathname + window.location.search);
renderProductThemes();
renderCatalogProducts();
renderProductActions();
document.querySelector(".catalog-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderProductModal(){
const body = document.getElementById("productModalBody");
const product = openProductId ? getCatalogProduct(openProductId) : null;
if(!body || !product) return;

const id = escapeHtml(product.id);
document.getElementById("productModalKicker").textContent = product.tag;
document.getElementById("productModalTitle").textContent = product.name;
body.innerHTML = `
<img class="product-modal-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.imageAlt)}" decoding="async">
<div class="product-modal-copy">
<p class="price">${escapeHtml(product.price)}</p>
<p class="description">${escapeHtml(product.description)}</p>
<h4 class="product-modal-heading">${escapeHtml(t("product.features"))}</h4>
<ul class="product-modal-features">${product.meta.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
${renderQuantityControl(product.id)}
<div class="product-actions">
<button class="product-action" type="button" data-add-cart data-product-id="${id}"></button>
<button class="product-action secondary" type="button" data-buy-product data-product-id="${id}"></button>
<button class="product-heart with-label" type="button" data-library-toggle data-product-id="${id}"></button>
</div>
</div>
`;
renderProductActions();
}

function openProductModal(productId){
if(!getCatalogProduct(productId)) return;
openProductId = productId;
renderProductModal();
window.LampUI.openModal("productModal");
}

function toggleLibrary(productId){
if(getProductState(productId).saved){
removeFromLibrary(productId);
return;
}
addToLibrary(buildProductPayload(productId));
}

function renderProductActions(){
document.querySelectorAll("[data-add-library]").forEach((button) => {
const stateForProduct = getProductState(button.dataset.productId || "");
button.textContent = stateForProduct.saved ? t("buttons.savedInLibrary") : t("buttons.addToLibrary");
button.disabled = stateForProduct.saved;
});

document.querySelectorAll("[data-library-toggle]").forEach((button) => {
const saved = getProductState(button.dataset.productId || "").saved;
const label = saved ? t("buttons.savedInLibrary") : t("buttons.addToLibrary");
button.classList.toggle("is-saved", saved);
button.setAttribute("aria-pressed", String(saved));
button.setAttribute("aria-label", label);
button.title = label;
button.textContent = button.classList.contains("with-label") ? `${saved ? "\u2665" : "\u2661"} ${label}` : (saved ? "\u2665" : "\u2661");
});

document.querySelectorAll("[data-buy-product]").forEach((button) => {
button.textContent = t("buttons.buyNow");
button.disabled = false;
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
${renderQuantityControl(item.id)}
</div>
<div class="library-card-actions">
<button class="library-buy primary" type="button" data-library-buy="${escapeHtml(item.id)}">${escapeHtml(t("buttons.buy"))}</button>
<button class="library-remove ghost" type="button" data-library-remove="${escapeHtml(item.id)}">${escapeHtml(t("buttons.remove"))}</button>
</div>
`;
libraryList.appendChild(card);
});
}

function renderCart(){
const cartLists = [...document.querySelectorAll("#cartList, [data-cart-list]")];
const cartTotals = [...document.querySelectorAll("#cartTotal, [data-cart-total]")];
const cartCount = document.getElementById("cartCount");
const items = getCart();
const total = items.reduce((sum, item) => sum + parsePrice(item.price) * item.quantity, 0);
const count = items.reduce((sum, item) => sum + item.quantity, 0);

if(cartCount) cartCount.textContent = String(count);
document.querySelectorAll("[data-open-checkout]").forEach((button) => {
button.hidden = items.length === 0;
});
cartTotals.forEach((element) => {
element.textContent = formatPrice(total);
});
if(!cartLists.length) return;

if(!items.length){
const emptyMarkup = `<div class="library-empty"><strong>${escapeHtml(t("cart.emptyTitle"))}</strong><p>${escapeHtml(t("cart.emptyText"))}</p></div>`;
cartLists.forEach((element) => {
element.innerHTML = emptyMarkup;
});
return;
}

const cartMarkup = items.map((item) => `
<article class="cart-item">
<img class="cart-item-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
<div class="cart-item-copy">
<strong>${escapeHtml(item.name)}</strong>
<span>${escapeHtml(t("quantity.unitPrice", { price: item.price }))}</span>
<strong class="cart-item-subtotal">${escapeHtml(t("quantity.subtotal", { total: formatPrice(parsePrice(item.price) * item.quantity) }))}</strong>
${renderQuantityControl(item.id, item.quantity, true)}
</div>
<div class="cart-item-actions">
<button class="library-buy primary" type="button" data-cart-buy="${escapeHtml(item.id)}">${escapeHtml(t("buttons.buy"))}</button>
<button class="library-remove ghost" type="button" data-cart-remove="${escapeHtml(item.id)}">${escapeHtml(t("buttons.remove"))}</button>
</div>
</article>
`).join("");
cartLists.forEach((element) => {
element.innerHTML = cartMarkup;
});
}

function deliveryPrice(method, subtotal){
return subtotal >= FREE_DELIVERY_FROM ? 0 : DELIVERY_PRICES[method] || 0;
}

function renderCheckoutTotals(){
const form = document.getElementById("checkoutForm");
if(!form) return;

const items = getCart();
const subtotal = items.reduce((sum, item) => sum + parsePrice(item.price) * item.quantity, 0);
const delivery = deliveryPrice(form.elements.delivery.value, subtotal);
document.getElementById("checkoutDelivery").textContent = delivery ? formatPrice(delivery) : t("checkout.free");
document.getElementById("checkoutTotal").textContent = formatPrice(subtotal + delivery);
}

function renderCheckoutOption(group, value, label, note, checked){
return `
<label class="checkout-option">
<input type="radio" name="${group}" value="${value}"${checked ? " checked" : ""}>
<span><strong>${escapeHtml(label)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ""}</span>
</label>
`;
}

function renderCheckoutField(name, label, value, required = true){
return `
<label class="checkout-field">
<span>${escapeHtml(label)}</span>
<input name="${name}" type="text" value="${escapeHtml(value || "")}"${required ? " required" : ""}>
</label>
`;
}

function openCheckout(){
if(!ensureSignedIn("purchase")) return;

const body = document.getElementById("checkoutBody");
const items = getCart();
if(!body || !items.length) return;

const user = state.currentUser;
body.innerHTML = `
<form id="checkoutForm" class="checkout-form">
<h4 class="product-modal-heading">${escapeHtml(t("checkout.summary"))}</h4>
<ul class="checkout-summary">${items.map((item) => `<li><span>${item.quantity} × ${escapeHtml(item.name)}</span><strong>${escapeHtml(formatPrice(parsePrice(item.price) * item.quantity))}</strong></li>`).join("")}</ul>
<h4 class="product-modal-heading">${escapeHtml(t("checkout.deliveryTitle"))}</h4>
<div class="checkout-options">
${renderCheckoutOption("delivery", "courier", t("checkout.courier"), t("checkout.deliveryNote", { price: DELIVERY_PRICES.courier }), true)}
${renderCheckoutOption("delivery", "locker", t("checkout.locker"), t("checkout.deliveryNote", { price: DELIVERY_PRICES.locker }), false)}
</div>
<p class="checkout-note">${escapeHtml(t("checkout.freeNote", { price: FREE_DELIVERY_FROM }))}</p>
<h4 class="product-modal-heading">${escapeHtml(t("checkout.addressTitle"))}</h4>
<div class="checkout-fields">
${renderCheckoutField("phone", t("checkout.phone"), user.phone)}
${renderCheckoutField("city", t("checkout.city"), user.city)}
${renderCheckoutField("street", t("checkout.street"), user.street)}
${renderCheckoutField("building", t("checkout.building"), user.building)}
${renderCheckoutField("apartment", t("checkout.apartment"), user.apartment, false)}
</div>
<h4 class="product-modal-heading">${escapeHtml(t("checkout.paymentTitle"))}</h4>
<div class="checkout-options">
${renderCheckoutOption("payment", "blik", "BLIK", "", true)}
${renderCheckoutOption("payment", "card", t("checkout.card"), "", false)}
${renderCheckoutOption("payment", "transfer", t("checkout.transfer"), "", false)}
</div>
<p class="checkout-note">${escapeHtml(t("checkout.demoNote"))}</p>
<div class="checkout-totals">
<div><span>${escapeHtml(t("checkout.deliveryLabel"))}</span><strong id="checkoutDelivery"></strong></div>
<div class="checkout-grand-total"><span>${escapeHtml(t("cart.total"))}</span><strong id="checkoutTotal"></strong></div>
</div>
<button class="product-action checkout-submit" type="submit">${escapeHtml(t("checkout.submit"))}</button>
</form>
`;
renderCheckoutTotals();
window.LampUI.openModal("checkoutModal");
}

async function submitCheckout(form){
if(purchaseInProgress) return;
purchaseInProgress = true;

const items = getCart();
const count = items.reduce((sum, item) => sum + item.quantity, 0);
const subtotal = items.reduce((sum, item) => sum + parsePrice(item.price) * item.quantity, 0);
const total = subtotal + deliveryPrice(form.elements.delivery.value, subtotal);

try{
if(state.apiToken){
await storage.apiFetch("/api/checkout", { method: "POST", body: JSON.stringify({}) });
await Promise.allSettled([loadLibraryFromApi(), loadCartFromApi()]);
}else{
const now = new Date().toISOString();
libraryItems = [...libraryItems, ...items.map((item) => ({ id: item.id, savedAt: now, purchasedAt: now, quantity: item.quantity }))];
cartItems = [];
}
storage.saveLocalCart(cartItems);
}catch(error){
purchaseInProgress = false;
if(!error.sessionExpired) window.LampUI.showToast(t("checkout.failed"), "error");
return;
}

syncUi();
await window.LampUI.playPurchaseSound();
window.LampUI.goToPage("purchase-history.html", {
message: t("checkout.done", { count, total: formatPrice(total) }),
type: "success"
});
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
if(error.sessionExpired) return;
libraryItems = [...libraryItems, { id: product.id, savedAt: new Date().toISOString(), purchasedAt: null }];
}

syncUi();
window.LampUI.showToast(t("toasts.addedToLibrary", { name: product.name }));
}

async function buyProduct(product, source = "catalog", quantity = 1){
if(!ensureSignedIn("purchase") || purchaseInProgress) return;
purchaseInProgress = true;

const existingItem = getLibrary().find((item) => item.id === product.id);
const purchaseQuantity = normalizeQuantity(quantity);

try{
await storage.apiFetch("/api/purchase", {
method: "POST",
body: JSON.stringify({ productId: product.id, quantity: purchaseQuantity })
});
await Promise.allSettled([loadLibraryFromApi(), loadCartFromApi()]);
}catch(error){
if(error.sessionExpired) return;
const now = new Date().toISOString();
libraryItems = existingItem
? libraryItems.map((item) => item.id === product.id ? { ...item, purchasedAt: item.purchasedAt || now, quantity: purchaseQuantity } : item)
: [...libraryItems, { id: product.id, savedAt: now, purchasedAt: now, quantity: purchaseQuantity }];
cartItems = cartItems.filter((item) => item.id !== product.id);
storage.saveLocalCart(cartItems);
}

syncUi();
const message = t("toasts.purchaseComplete", { name: product.name, quantity: purchaseQuantity });
const purchaseSoundFinished = window.LampUI.playPurchaseSound();

if(source === "catalog"){
// Leaving the page stops the audio, so the redirect waits for the sound; the flag stays set until then.
await purchaseSoundFinished;
window.LampUI.goToPage("purchase-history.html", { message, type: "success" });
return;
}

purchaseInProgress = false;
window.LampUI.showToast(message);
}

async function removeFromLibrary(productId){
if(!state.currentUser) return;

try{
await storage.apiFetch("/api/library", { method: "DELETE", body: JSON.stringify({ productId }) });
await loadLibraryFromApi();
}catch(error){
if(error.sessionExpired) return;
libraryItems = libraryItems.filter((item) => item.id !== productId);
}

syncUi();
window.LampUI.showToast(t("toasts.removedFromLibrary"));
}

async function addToCart(product, quantity = 1){
const existing = cartItems.find((item) => item.id === product.id || item.product_id === product.id);
const addedQuantity = normalizeQuantity(quantity);

try{
if(state.apiToken){
await storage.apiFetch("/api/cart", { method: "POST", body: JSON.stringify({ productId: product.id, quantity: addedQuantity }) });
await loadCartFromApi();
}else if(existing){
cartItems = cartItems.map((item) => item.id === product.id ? { ...item, quantity: normalizeQuantity(Number(item.quantity || 1) + addedQuantity) } : item);
}else{
cartItems = [...cartItems, { ...product, quantity: addedQuantity, addedAt: new Date().toISOString() }];
}
}catch(error){
if(error.sessionExpired) return;
cartItems = existing
? cartItems.map((item) => item.id === product.id ? { ...item, quantity: normalizeQuantity(Number(item.quantity || 1) + addedQuantity) } : item)
: [...cartItems, { ...product, quantity: addedQuantity, addedAt: new Date().toISOString() }];
}

storage.saveLocalCart(cartItems);
syncUi();
window.LampUI.showToast(t("cart.added", { name: product.name, quantity: addedQuantity }));
}

async function updateCartQuantity(productId, quantity){
const normalized = normalizeQuantity(quantity);

try{
if(state.apiToken){
await storage.apiFetch("/api/cart", {
method: "PUT",
body: JSON.stringify({ productId, quantity: normalized })
});
await loadCartFromApi();
}else{
cartItems = cartItems.map((item) => item.id === productId ? { ...item, quantity: normalized } : item);
}
}catch(error){
if(error.sessionExpired) return;
cartItems = cartItems.map((item) => item.id === productId ? { ...item, quantity: normalized } : item);
}

storage.saveLocalCart(cartItems);
syncUi();
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
if(error.sessionExpired) return;
cartItems = cartItems.filter((item) => item.id !== productId);
}

storage.saveLocalCart(cartItems);
syncUi();
}

function bindProductActions(){
document.addEventListener("click", (event) => {
const quantityButton = event.target.closest("[data-quantity-change]");
const addLibrary = event.target.closest("[data-add-library]");
const buyButton = event.target.closest("[data-buy-product], [data-library-buy], [data-cart-buy]");
const addCart = event.target.closest("[data-add-cart]");
const removeLibrary = event.target.closest("[data-library-remove]");
const removeCart = event.target.closest("[data-cart-remove]");
const themeButton = event.target.closest("[data-product-theme]");
const productOpener = event.target.closest("[data-open-product]");
const libraryToggle = event.target.closest("[data-library-toggle]");

if(event.target.closest("#catalogMore")){
catalogView = { ...catalogView, visible: catalogView.visible + CATALOG_PAGE_SIZE };
renderCatalogProducts();
renderProductActions();
return;
}

if(event.target.closest("[data-open-checkout]")){
openCheckout();
return;
}

if(productOpener){
openProductModal(productOpener.dataset.openProduct || "");
return;
}

if(libraryToggle){
toggleLibrary(libraryToggle.dataset.productId || "");
return;
}

if(quantityButton){
const control = quantityButton.closest("[data-quantity-control]");
const input = control?.querySelector("input[type='number']");
if(!control || !input) return;
const quantity = normalizeQuantity(Number(input.value) + Number(quantityButton.dataset.quantityChange || 0));
input.value = String(quantity);
if(control.hasAttribute("data-cart-quantity")){
updateCartQuantity(control.dataset.productId || "", quantity);
}
return;
}

if(themeButton) selectProductTheme(themeButton.dataset.productTheme || "");
if(addLibrary) addToLibrary(buildProductPayload(addLibrary.dataset.productId || ""));
if(addCart){
const productId = addCart.dataset.productId || "";
addToCart(buildProductPayload(productId), getRequestedQuantity(addCart, productId));
}
if(buyButton){
const productId = buyButton.dataset.productId || buyButton.dataset.libraryBuy || buyButton.dataset.cartBuy || "";
const source = buyButton.dataset.cartBuy ? "cart" : (buyButton.dataset.productId ? "catalog" : "library");
const quantity = getRequestedQuantity(buyButton, productId);
buyProduct(buildProductPayload(productId), source, quantity);
}
if(removeLibrary) removeFromLibrary(removeLibrary.dataset.libraryRemove || "");
if(removeCart) removeFromCart(removeCart.dataset.cartRemove || "");
});

document.addEventListener("keydown", (event) => {
const opener = event.target.closest?.("figure[data-open-product]");
if(opener && (event.key === "Enter" || event.key === " ")){
event.preventDefault();
openProductModal(opener.dataset.openProduct || "");
}
});

document.addEventListener("submit", (event) => {
if(event.target.id !== "checkoutForm") return;
event.preventDefault();
submitCheckout(event.target);
});

document.addEventListener("change", (event) => {
if(event.target.id === "catalogSort"){
catalogView = { ...catalogView, sort: event.target.value, visible: CATALOG_PAGE_SIZE };
renderCatalogProducts();
renderProductActions();
return;
}

if(event.target.name === "delivery"){
renderCheckoutTotals();
return;
}

const input = event.target.closest("[data-product-quantity-input], [data-cart-quantity-input]");
if(!input) return;
const quantity = normalizeQuantity(input.value);
input.value = String(quantity);
const control = input.closest("[data-quantity-control]");
if(control?.hasAttribute("data-cart-quantity")){
const timer = cartQuantityTimers.get(input);
if(timer) window.clearTimeout(timer);
updateCartQuantity(control.dataset.productId || "", quantity);
}
});

document.addEventListener("input", (event) => {
if(event.target.id === "catalogMaxPrice"){
const value = Number(event.target.value);
catalogView = { ...catalogView, maxPrice: value >= Number(event.target.max) ? null : value, visible: CATALOG_PAGE_SIZE };
renderCatalogProducts();
renderProductActions();
return;
}

const input = event.target.closest("[data-cart-quantity-input]");
if(!input) return;

const numericValue = Number(input.value);
if(!Number.isInteger(numericValue) || numericValue < 1 || numericValue > MAX_QUANTITY) return;

const existingTimer = cartQuantityTimers.get(input);
if(existingTimer) window.clearTimeout(existingTimer);

const control = input.closest("[data-quantity-control]");
const timer = window.setTimeout(() => {
updateCartQuantity(control?.dataset.productId || "", numericValue);
}, 350);
cartQuantityTimers.set(input, timer);
});
}

function syncUi(){
window.LampUI.renderMenuAccount();
renderProductThemes();
renderCatalogProducts();
renderLibrary();
renderCart();
renderProductModal();
renderProductActions();
window.LampSearch?.renderSearchResults?.();
window.LampUI.highlightCurrentPage();
}

return {
restoreCachedCatalog,
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
openProductModal,
addToLibrary,
buyProduct,
removeFromLibrary,
addToCart,
removeFromCart,
bindProductActions,
syncUi
};
})();
