window.LampPromotions = (() => {
const PROMOTION_INTERVAL_MS = 4.5 * 60 * 1000;
const PROMOTION_LIFETIME_MS = 40 * 1000;
const PROMOTION_VALID_DAYS = 4;
const MAX_RECENT_PRODUCTS = 8;
const QUANTITIES = [10, 12, 15, 18, 20, 24, 25, 30, 36, 40, 45, 48, 50, 60];
const DISCOUNTS = [10, 12, 15, 17, 18, 20, 22, 25, 27, 30, 32, 35, 37, 40];
const STORAGE_KEYS = {
active: "lamp_store_promotion_active_v1",
nextAt: "lamp_store_promotion_next_at_v1",
recent: "lamp_store_promotion_recent_v1",
lastConfig: "lamp_store_promotion_last_config_v1"
};

let initialized = false;
let scheduleTimer = null;
let dismissTimer = null;

const t = (...args) => window.LampI18n.t(...args);
const escapeHtml = (value) => window.LampStorage.escapeHtml(value);

function readJson(key, fallback){
try{
const value = JSON.parse(sessionStorage.getItem(key) || "null");
return value ?? fallback;
}catch(error){
return fallback;
}
}

function randomItem(items){
return items[Math.floor(Math.random() * items.length)];
}

function parsePrice(value){
const amount = Number(String(value || "0").replace(",", ".").match(/[\d.]+/)?.[0] || 0);
return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(amount){
const value = Number(amount || 0);
const hasDecimals = Math.abs(value - Math.round(value)) > 0.001;
return `${new Intl.NumberFormat(window.LampI18n.getLocale(), {
minimumFractionDigits: hasDecimals ? 2 : 0,
maximumFractionDigits: 2
}).format(value)} PLN`;
}

function formatDate(value){
return new Intl.DateTimeFormat(window.LampI18n.getLocale(), {
day: "2-digit",
month: "2-digit",
year: "numeric"
}).format(new Date(value));
}

function getProduct(productId){
const product = window.LAMP_I18N.products?.[productId];
if(!product) return null;
const localized = product[window.LampStorage.state.language] || product.en || product.pl || {};
return {
id: productId,
image: product.image || "images/lamp1.jpg",
price: parsePrice(product.price),
name: localized.name || productId,
tag: localized.tag || t("promotion.kicker")
};
}

function generateOffer(){
const products = Object.keys(window.LAMP_I18N.products || {})
.map(getProduct)
.filter((product) => product && product.price > 0);
if(!products.length) return null;

const recent = readJson(STORAGE_KEYS.recent, []);
const available = products.filter((product) => !recent.includes(product.id));
const product = randomItem(available.length ? available : products);
const lastConfig = readJson(STORAGE_KEYS.lastConfig, {});
const quantity = randomItem(QUANTITIES.filter((value) => value !== lastConfig.quantity));
const discount = randomItem(DISCOUNTS.filter((value) => value !== lastConfig.discount));
const regularTotal = product.price * quantity;
const discountedTotal = regularTotal * (1 - discount / 100);
const now = Date.now();

sessionStorage.setItem(STORAGE_KEYS.recent, JSON.stringify(
[product.id, ...recent.filter((id) => id !== product.id)].slice(0, MAX_RECENT_PRODUCTS)
));
sessionStorage.setItem(STORAGE_KEYS.lastConfig, JSON.stringify({ quantity, discount }));

return {
id: `${product.id}-${now}`,
productId: product.id,
quantity,
discount,
unitPrice: product.price,
regularTotal,
discountedTotal,
savings: regularTotal - discountedTotal,
validUntil: now + PROMOTION_VALID_DAYS * 24 * 60 * 60 * 1000,
expiresAt: now + PROMOTION_LIFETIME_MS
};
}

function removeOfferElement(){
const element = document.getElementById("quantityPromotion");
if(!element) return;
element.classList.add("is-leaving");
window.setTimeout(() => {
element.remove();
document.body.classList.remove("has-quantity-promotion");
}, 620);
}

function dismissOffer(){
if(dismissTimer) window.clearTimeout(dismissTimer);
sessionStorage.removeItem(STORAGE_KEYS.active);
removeOfferElement();
}

function renderOffer(offer){
const product = getProduct(offer.productId);
if(!product){
sessionStorage.removeItem(STORAGE_KEYS.active);
return;
}

document.getElementById("quantityPromotion")?.remove();
if(dismissTimer) window.clearTimeout(dismissTimer);

const remainingTime = Math.max(0, offer.expiresAt - Date.now());
if(remainingTime === 0){
sessionStorage.removeItem(STORAGE_KEYS.active);
return;
}

const element = document.createElement("aside");
element.id = "quantityPromotion";
element.className = "quantity-promotion";
element.setAttribute("role", "status");
element.setAttribute("aria-live", "polite");
element.innerHTML = `
<button class="quantity-promotion-close" type="button" aria-label="${escapeHtml(t("promotion.close"))}">×</button>
<div class="quantity-promotion-media">
<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" decoding="async">
<strong>−${escapeHtml(offer.discount)}%</strong>
</div>
<div class="quantity-promotion-copy">
<span class="quantity-promotion-kicker">${escapeHtml(t("promotion.kicker"))}</span>
<h3>${escapeHtml(product.name)}</h3>
<p>${escapeHtml(t("promotion.details", {
unitPrice: formatMoney(offer.unitPrice),
quantity: offer.quantity,
discount: offer.discount
}))}</p>
<div class="quantity-promotion-price-row">
<span><small>${escapeHtml(t("promotion.regularPrice"))}</small><s>${escapeHtml(formatMoney(offer.regularTotal))}</s></span>
<span><small>${escapeHtml(t("promotion.offerPrice"))}</small><strong>${escapeHtml(formatMoney(offer.discountedTotal))}</strong></span>
</div>
<p class="quantity-promotion-saving">${escapeHtml(t("promotion.savings", { savings: formatMoney(offer.savings) }))}</p>
<p class="quantity-promotion-expiry">${escapeHtml(t("promotion.expires", { date: formatDate(offer.validUntil) }))}</p>
</div>
<div class="quantity-promotion-timer" aria-hidden="true" style="--promotion-duration:${remainingTime}ms"></div>
`;

element.querySelector(".quantity-promotion-close")?.addEventListener("click", dismissOffer);
document.body.appendChild(element);
document.body.classList.add("has-quantity-promotion");
window.requestAnimationFrame(() => element.classList.add("is-visible"));

dismissTimer = window.setTimeout(dismissOffer, remainingTime);
}

function scheduleNext(){
if(scheduleTimer) window.clearTimeout(scheduleTimer);
let nextAt = Number(sessionStorage.getItem(STORAGE_KEYS.nextAt));
if(!Number.isFinite(nextAt) || nextAt <= 0){
nextAt = Date.now() + PROMOTION_INTERVAL_MS;
sessionStorage.setItem(STORAGE_KEYS.nextAt, String(nextAt));
}

scheduleTimer = window.setTimeout(showNextOffer, Math.max(0, nextAt - Date.now()));
}

function createAndDisplayOffer(){
const offer = generateOffer();
sessionStorage.setItem(STORAGE_KEYS.nextAt, String(Date.now() + PROMOTION_INTERVAL_MS));
if(offer){
sessionStorage.setItem(STORAGE_KEYS.active, JSON.stringify(offer));
renderOffer(offer);
}
scheduleNext();
}

function showNextOffer(){
const scheduledAt = Number(sessionStorage.getItem(STORAGE_KEYS.nextAt));
if(Number.isFinite(scheduledAt) && scheduledAt > Date.now() + 250){
scheduleNext();
return;
}

createAndDisplayOffer();
}

function refresh(){
if(!initialized) return;
const offer = readJson(STORAGE_KEYS.active, null);
if(offer?.expiresAt > Date.now()) renderOffer(offer);
}

function init(){
if(initialized) return;
initialized = true;

const activeOffer = readJson(STORAGE_KEYS.active, null);
const hasActiveOffer = activeOffer?.expiresAt > Date.now();
if(hasActiveOffer){
renderOffer(activeOffer);
}else{
sessionStorage.removeItem(STORAGE_KEYS.active);
}

scheduleNext();

if(new URLSearchParams(window.location.search).has("promo-preview") && !hasActiveOffer){
window.setTimeout(createAndDisplayOffer, 700);
}
}

return { init, refresh };
})();
