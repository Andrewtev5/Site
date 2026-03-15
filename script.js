const STORAGE_KEYS = {
users: "lamp_store_users_v1",
session: "lamp_store_session_v1",
language: "lamp_store_language_v1",
flashToast: "lamp_store_flash_toast_v1"
};

const state = {
activeModal: null,
currentUserEmail: null,
language: window.LAMP_I18N?.defaultLanguage || "pl",
activeInfoType: null
};

function getCurrentPageName(){
const path = window.location.pathname.replace(/\\/g, "/");
return path.split("/").pop().toLowerCase() || "index.html";
}

function getPageType(){
return document.body.dataset.page || "catalog";
}

function getLanguage(){
const savedLanguage = localStorage.getItem(STORAGE_KEYS.language);
return window.LAMP_I18N.supportedLanguages.includes(savedLanguage) ? savedLanguage : window.LAMP_I18N.defaultLanguage;
}

function getTranslationValue(key){
return key.split(".").reduce((accumulator, part) => {
if(accumulator && Object.prototype.hasOwnProperty.call(accumulator, part)){
return accumulator[part];
}

return null;
}, window.LAMP_I18N.translations[state.language]);
}

function t(key, params = {}){
const template = getTranslationValue(key);

if(typeof template !== "string"){
return key;
}

return template.replace(/\{(\w+)\}/g, (match, token) => {
return Object.prototype.hasOwnProperty.call(params, token) ? String(params[token]) : match;
});
}

function escapeHtml(value){
return String(value)
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;")
.replace(/"/g, "&quot;")
.replace(/'/g, "&#39;");
}

function queueFlashToast(message, type = "success"){
sessionStorage.setItem(STORAGE_KEYS.flashToast, JSON.stringify({ message, type }));
}

function flushFlashToast(){
try{
const payload = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.flashToast) || "null");

if(payload?.message){
showToast(payload.message, payload.type || "success");
}
}catch(error){
}

sessionStorage.removeItem(STORAGE_KEYS.flashToast);
}

function renderSharedShell(){
if(document.getElementById("sideMenu")){
return;
}

const main = document.querySelector("main");

if(!main){
return;
}

main.insertAdjacentHTML("beforebegin", `
<div class="background-light"></div>
<div class="menu-overlay" id="menuOverlay" onclick="closeMenu()"></div>
<div class="modal-overlay" id="modalOverlay" onclick="closeActiveModal()"></div>
<button class="menu-tab" type="button" onclick="toggleMenu()" data-i18n-aria-label="aria.openMenu" aria-label="Open menu">
<div class="tab-icon">
<span></span>
<span></span>
<span></span>
</div>
</button>
<header class="header">
<div class="header-inner">
<h1 class="logo-title">
<span class="logo-brand" data-i18n="brand">Sklep Lamp</span>
</h1>
<div class="header-tools">
<div class="lang-switch" role="group" data-i18n-aria-label="aria.languageSwitch" aria-label="Language switch">
<button class="lang-option" type="button" data-lang-option="en">EN</button>
<button class="lang-option" type="button" data-lang-option="pl">PL</button>
</div>
</div>
</div>
</header>
<aside class="side-menu" id="sideMenu" aria-hidden="true">
<div class="side-menu-head">
<div>
<p class="menu-eyebrow" data-i18n="menu.eyebrow">Sklep Lamp</p>
<h3 data-i18n="menu.title">Menu</h3>
</div>
<button class="menu-close" type="button" onclick="closeMenu()" data-i18n-aria-label="aria.closeMenu" aria-label="Close menu">&times;</button>
</div>
<div class="menu-account-card" id="menuAccountCard">
<span class="menu-account-label" id="menuAccountLabel">Tryb goscia</span>
<strong class="menu-account-name" id="menuAccountName">Zaloguj sie, aby zapisywac lampy w swojej bibliotece.</strong>
</div>
<nav class="menu-nav">
<button class="menu-item" id="menuCatalogButton" type="button" onclick="goToPage('index.html')">
<span data-i18n="menu.catalogTitle">Katalog</span>
<small data-i18n="menu.catalogDesc">Przegladaj cala kolekcje lamp</small>
</button>
<button class="menu-item" id="menuAuthPrimary" type="button" onclick="openAuthModal('login')">
<span data-i18n="menu.loginTitle">Zaloguj sie</span>
<small data-i18n="menu.loginDesc">Uzyskaj bezpieczny dostep do konta</small>
</button>
<button class="menu-item" id="menuAuthSecondary" type="button" onclick="openAuthModal('register')">
<span data-i18n="menu.registerTitle">Zaloz konto</span>
<small data-i18n="menu.registerDesc">Utworz nowy profil</small>
</button>
<button class="menu-item" id="menuLibraryButton" type="button" onclick="openLibraryModal()">
<span data-i18n="menu.libraryTitle">Biblioteka</span>
<small data-i18n="menu.libraryDesc">Zapisane lampy i ulubione</small>
</button>
<button class="menu-item" type="button" onclick="openInfoModal('return')">
<span data-i18n="menu.returnTitle">Zwrot produktu</span>
<small data-i18n="menu.returnDesc">Wskazowki zwrotu i gwarancji</small>
</button>
<button class="menu-item" type="button" onclick="openInfoModal('contact')">
<span data-i18n="menu.contactTitle">Kontakt</span>
<small data-i18n="menu.contactDesc">Wsparcie i komunikacja</small>
</button>
</nav>
</aside>
`);

main.insertAdjacentHTML("afterend", `
<section class="modal-window info-modal" id="infoModal" aria-hidden="true" data-i18n-aria-label="aria.infoWindow" aria-label="Information window">
<div class="modal-head">
<div>
<p class="modal-kicker" id="infoKicker">Zwroty</p>
<h3 class="modal-title" id="infoTitle">Zwrot produktu</h3>
</div>
<button class="modal-close" type="button" onclick="closeActiveModal()" data-i18n-aria-label="aria.closeInfo" aria-label="Close information window">&times;</button>
</div>
<p class="info-text" id="infoText"></p>
</section>
<button class="chat-button" type="button" onclick="toggleChat()" data-i18n-aria-label="aria.openAssistant" aria-label="Open assistant">
<img src="images/botlog.png" data-i18n-alt="chat.robotAlt" alt="Assistant robot">
</button>
<div class="chat-overlay" id="chatOverlay" onclick="closeChat()"></div>
<section class="chat-modal" id="chatWindow" aria-hidden="true" data-i18n-aria-label="aria.assistantWindow" aria-label="Lamp Assistant window">
<div class="chat-badge" data-i18n="chat.badge">Asystent Lamp</div>
<h3 class="chat-title" data-i18n="chat.title">Czesc! Jestem gotowy, aby pomoc.</h3>
<p class="chat-text" data-i18n="chat.text">Pomoge wybrac lampe, dowiedziec sie wiecej o dostawie i szybko znalezc model odpowiedni do Twojego domu.</p>
<div class="chat-cards">
<div class="chat-card">
<span class="chat-card-title" data-i18n="chat.card1Title">Wybierz lampe</span>
<p data-i18n="chat.card1Text">Otrzymaj pomoc przy wyborze najlepszej lampy do pomieszczenia i stylu.</p>
</div>
<div class="chat-card">
<span class="chat-card-title" data-i18n="chat.card2Title">Szybkie wsparcie</span>
<p data-i18n="chat.card2Text">Znajdz szybkie odpowiedzi o zamowieniach, dostawie i szczegolach produktow.</p>
</div>
<div class="chat-card">
<span class="chat-card-title" data-i18n="chat.card3Title">Juz teraz</span>
<p data-i18n="chat.card3Text">Asystent jest online i gotowy, aby poprowadzic Cie od razu.</p>
</div>
</div>
<p class="chat-tip" data-i18n="chat.tip">Kliknij poza oknem lub ponownie nacisnij robota, aby zamknac okno.</p>
</section>
<div class="toast-stack" id="toastStack" aria-live="polite" aria-atomic="true"></div>
<footer>
<p data-i18n="footer.copyright">&copy; 2026 Sklep Lamp</p>
</footer>
`);

bindLanguageSwitch();
}

function bindLanguageSwitch(){
document.querySelectorAll("[data-lang-option]").forEach((button) => {
button.addEventListener("click", () => {
setLanguage(button.dataset.langOption || window.LAMP_I18N.defaultLanguage);
});
});
}

function setLanguage(language){
if(!window.LAMP_I18N.supportedLanguages.includes(language)){
return;
}

state.language = language;
localStorage.setItem(STORAGE_KEYS.language, language);
applyTranslations();
syncUi();
}

function goToPage(path, toastPayload = null){
if(!path){
return;
}

if(toastPayload?.message){
queueFlashToast(toastPayload.message, toastPayload.type || "success");
}

closeMenu();
closeChat();
closeActiveModal();
window.location.href = path;
}

function toggleMenu(){
const menu = document.getElementById("sideMenu");
const overlay = document.getElementById("menuOverlay");

if(!menu || !overlay){
return;
}

const willOpen = !menu.classList.contains("active");

menu.classList.toggle("active", willOpen);
overlay.classList.toggle("active", willOpen);
document.body.classList.toggle("menu-open", willOpen);
menu.setAttribute("aria-hidden", String(!willOpen));
}

function closeMenu(){
const menu = document.getElementById("sideMenu");
const overlay = document.getElementById("menuOverlay");

if(!menu || !overlay){
return;
}

menu.classList.remove("active");
overlay.classList.remove("active");
document.body.classList.remove("menu-open");
menu.setAttribute("aria-hidden", "true");
}

function toggleChat(){
const chat = document.getElementById("chatWindow");
const overlay = document.getElementById("chatOverlay");

if(!chat || !overlay){
return;
}

const willOpen = !chat.classList.contains("active");

chat.classList.toggle("active", willOpen);
overlay.classList.toggle("active", willOpen);
document.body.classList.toggle("chat-open", willOpen);
chat.setAttribute("aria-hidden", String(!willOpen));
}

function closeChat(){
const chat = document.getElementById("chatWindow");
const overlay = document.getElementById("chatOverlay");

if(!chat || !overlay){
return;
}

chat.classList.remove("active");
overlay.classList.remove("active");
document.body.classList.remove("chat-open");
chat.setAttribute("aria-hidden", "true");
}

function openModal(modalId){
const overlay = document.getElementById("modalOverlay");
const modal = document.getElementById(modalId);

if(!overlay || !modal){
return;
}

closeMenu();
closeActiveModal();
overlay.classList.add("active");
modal.classList.add("active");
document.body.classList.add("modal-open");
modal.setAttribute("aria-hidden", "false");
state.activeModal = modalId;
}

function closeActiveModal(){
const overlay = document.getElementById("modalOverlay");

if(overlay){
overlay.classList.remove("active");
}

document.querySelectorAll(".modal-window.active").forEach((modal) => {
modal.classList.remove("active");
modal.setAttribute("aria-hidden", "true");
});

document.body.classList.remove("modal-open");
state.activeModal = null;
state.activeInfoType = null;
}

function openAuthModal(tab = "login"){
const targetPage = tab === "register" ? "register.html" : "login.html";

if(getCurrentPageName() === targetPage){
return;
}

goToPage(targetPage);
}

function openLibraryModal(){
if(getCurrentPageName() === "library.html"){
renderLibrary();
return;
}

goToPage("library.html");
}

function openInfoModal(type){
const infoKicker = document.getElementById("infoKicker");
const infoTitle = document.getElementById("infoTitle");
const infoText = document.getElementById("infoText");

if(!infoKicker || !infoTitle || !infoText){
return;
}

state.activeInfoType = type;
infoKicker.textContent = t(`info.${type}.kicker`);
infoTitle.textContent = t(`info.${type}.title`);
infoText.textContent = t(`info.${type}.text`);
openModal("infoModal");
}

function getUsers(){
try{
const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || "[]");
return Array.isArray(users) ? users : [];
}catch(error){
return [];
}
}

function saveUsers(users){
localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
}

function saveCurrentSession(email){
state.currentUserEmail = email;

if(email){
sessionStorage.setItem(STORAGE_KEYS.session, email);
}else{
sessionStorage.removeItem(STORAGE_KEYS.session);
}
}

function loadCurrentSession(){
state.currentUserEmail = sessionStorage.getItem(STORAGE_KEYS.session);
}

function normalizeEmail(email){
return email.trim().toLowerCase();
}

function escapeText(value){
return String(value || "").replace(/\s+/g, " ").trim();
}

function validateEmail(email){
return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password){
const hasMinLength = password.length >= 8;
const hasUppercase = /[A-Z]/.test(password);
const hasLowercase = /[a-z]/.test(password);
const hasDigit = /\d/.test(password);
return hasMinLength && hasUppercase && hasLowercase && hasDigit;
}

function getCryptoApi(){
if(!window.crypto){
throw new Error(t("toasts.secureBrowserUnavailable"));
}

return window.crypto;
}

function bufferToHex(buffer){
return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex){
const bytes = new Uint8Array(hex.length / 2);

for(let index = 0; index < bytes.length; index += 1){
bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
}

return bytes;
}

function generateSaltHex(length = 16){
const bytes = new Uint8Array(length);
getCryptoApi().getRandomValues(bytes);
return bufferToHex(bytes);
}

async function derivePasswordHash(password, saltHex, iterations = 120000){
const browserCrypto = getCryptoApi();

if(!browserCrypto.subtle){
throw new Error(t("toasts.secureBrowserUnavailable"));
}

const encoder = new TextEncoder();
const baseKey = await browserCrypto.subtle.importKey("raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
const derivedBits = await browserCrypto.subtle.deriveBits({ name: "PBKDF2", salt: hexToBytes(saltHex), iterations, hash: "SHA-256" }, baseKey, 256);
return bufferToHex(derivedBits);
}

function getLocale(){
return state.language === "pl" ? "pl-PL" : "en-GB";
}

function formatDate(value){
return new Date(value).toLocaleDateString(getLocale());
}

function showToast(message, type = "success"){
const stack = document.getElementById("toastStack");

if(!stack){
return;
}

const toast = document.createElement("div");
toast.className = `toast ${type}`;
toast.textContent = message;
stack.appendChild(toast);

window.setTimeout(() => {
toast.remove();
}, 3600);
}

function setButtonBusy(button, isBusy, busyText){
if(!button){
return;
}

if(isBusy){
button.dataset.originalText = button.textContent;
button.textContent = busyText;
button.disabled = true;
return;
}

button.textContent = button.dataset.originalText || button.textContent;
button.disabled = false;
}

function getCatalogProduct(productId){
const product = window.LAMP_I18N.products[productId];

if(!product){
return null;
}

const localized = product[state.language] || product.en;

return {
id: productId,
image: product.image,
price: product.price,
name: localized.name,
tag: localized.tag,
description: localized.description,
meta: localized.meta,
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
const product = getCatalogProduct(item?.id) || {};

return {
id: item?.id || product.id || `lamp-${Date.now()}`,
image: product.image || item?.image || "images/lamp1.jpg",
price: product.price || item?.price || "0 PLN",
name: product.name || item?.name || "Lamp",
tag: product.tag || item?.tag || "Lamp",
description: product.description || item?.description || "",
savedAt: item?.savedAt || new Date().toISOString(),
purchasedAt: item?.purchasedAt || null
};
}

function getCurrentUser(){
if(!state.currentUserEmail){
return null;
}

const currentUser = getUsers().find((user) => user.email === state.currentUserEmail) || null;

if(!currentUser){
return null;
}

return {
...currentUser,
library: Array.isArray(currentUser.library) ? currentUser.library.map(normalizeLibraryItem) : []
};
}

function updateUserRecord(updatedUser){
const users = getUsers().map((user) => {
if(user.email !== updatedUser.email){
return user;
}

return {
...updatedUser,
library: Array.isArray(updatedUser.library) ? updatedUser.library.map((item) => ({
id: item.id,
savedAt: item.savedAt,
purchasedAt: item.purchasedAt || null
})) : []
};
});

saveUsers(users);
}

function setMenuButtonContent(button, title, description, action){
if(!button){
return;
}

const titleNode = button.querySelector("span");
const descriptionNode = button.querySelector("small");

if(titleNode){
titleNode.textContent = title;
}

if(descriptionNode){
descriptionNode.textContent = description;
}

button.setAttribute("onclick", action);
}

function renderMenuAccount(){
const currentUser = getCurrentUser();
const menuAccountLabel = document.getElementById("menuAccountLabel");
const menuAccountName = document.getElementById("menuAccountName");
const menuAuthPrimary = document.getElementById("menuAuthPrimary");
const menuAuthSecondary = document.getElementById("menuAuthSecondary");

if(!menuAccountLabel || !menuAccountName || !menuAuthPrimary || !menuAuthSecondary){
return;
}

if(currentUser){
const savedCount = currentUser.library.length;
const purchasedCount = currentUser.library.filter((item) => item.purchasedAt).length;

menuAccountLabel.textContent = t("account.signedInLabel");
menuAccountName.textContent = t("account.signedInText", { name: currentUser.name, savedCount, purchasedCount });
setMenuButtonContent(menuAuthPrimary, t("account.openLibraryTitle"), t("account.openLibraryDesc"), "openLibraryModal()");
setMenuButtonContent(menuAuthSecondary, t("account.logoutTitle"), t("account.logoutDesc"), "logoutUser()");
return;
}

menuAccountLabel.textContent = t("account.guestLabel");
menuAccountName.textContent = t("account.guestText");
setMenuButtonContent(menuAuthPrimary, t("menu.loginTitle"), t("menu.loginDesc"), "openAuthModal('login')");
setMenuButtonContent(menuAuthSecondary, t("menu.registerTitle"), t("menu.registerDesc"), "openAuthModal('register')");
}

function renderCatalogProducts(){
document.querySelectorAll("[data-product-card]").forEach((card) => {
const product = getCatalogProduct(card.dataset.productId || "");

if(!product){
return;
}

const image = card.querySelector(".product-image");

if(image){
image.src = product.image;
image.alt = product.imageAlt;
}

card.querySelector("[data-product-field='name']").textContent = product.name;
card.querySelector("[data-product-field='tag']").textContent = product.tag;
card.querySelector("[data-product-field='description']").textContent = product.description;
card.querySelector("[data-product-field='price']").textContent = product.price;

card.querySelectorAll("[data-product-meta]").forEach((node) => {
node.textContent = product.meta[Number(node.dataset.productMeta || 0)] || "";
});
});
}

function renderLibrary(){
const currentUser = getCurrentUser();
const libraryIntro = document.getElementById("libraryIntro");
const libraryList = document.getElementById("libraryList");
const libraryEmptyState = document.getElementById("libraryEmptyState");

if(!libraryIntro || !libraryList || !libraryEmptyState){
return;
}

libraryList.innerHTML = "";

if(!currentUser){
libraryIntro.textContent = t("account.guestText");
libraryEmptyState.style.display = "block";
libraryEmptyState.innerHTML = `<strong>${escapeHtml(t("library.authRequiredTitle"))}</strong><p>${escapeHtml(t("library.authRequiredText"))}</p>`;
return;
}

const savedItems = currentUser.library;
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
<button class="library-buy" type="button"${item.purchasedAt ? " disabled" : ""}>${escapeHtml(item.purchasedAt ? t("buttons.purchased") : t("buttons.buy"))}</button>
<button class="library-remove" type="button">${escapeHtml(t("buttons.remove"))}</button>
</div>
`;

card.querySelector(".library-buy").addEventListener("click", () => {
buyProduct(item, "library");
});

card.querySelector(".library-remove").addEventListener("click", () => {
removeFromLibrary(item.id);
});

libraryList.appendChild(card);
});
}

function getProductState(productId){
const currentUser = getCurrentUser();

if(!currentUser){
return { saved: false, purchased: false };
}

const item = currentUser.library.find((entry) => entry.id === productId);
return { saved: Boolean(item), purchased: Boolean(item?.purchasedAt) };
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
}

function syncUi(){
renderMenuAccount();
renderCatalogProducts();
renderLibrary();
renderProductActions();
highlightCurrentPage();
}

function ensureSignedIn(actionType){
const currentUser = getCurrentUser();

if(currentUser){
return currentUser;
}

showToast(actionType === "purchase" ? t("toasts.signInFirstPurchase") : t("toasts.signInFirstSave"), "error");
openAuthModal("login");
return null;
}

function saveProductRecord(product, options = {}){
const currentUser = ensureSignedIn(options.purchase ? "purchase" : "save");

if(!currentUser){
return { ok: false, reason: "not-signed-in" };
}

const existingItem = currentUser.library.find((item) => item.id === product.id);

if(existingItem && !options.purchase){
return { ok: false, reason: "already-saved" };
}

const now = new Date().toISOString();
const nextItem = normalizeLibraryItem({
id: product.id,
savedAt: existingItem?.savedAt || now,
purchasedAt: options.purchase ? existingItem?.purchasedAt || now : existingItem?.purchasedAt || null
});

const nextLibrary = existingItem
? currentUser.library.map((item) => item.id === product.id ? nextItem : item)
: [...currentUser.library, nextItem];

updateUserRecord({ ...currentUser, library: nextLibrary });
syncUi();

return { ok: true, alreadyPurchased: Boolean(existingItem?.purchasedAt), item: nextItem };
}

function addToLibrary(product){
const result = saveProductRecord(product);

if(!result.ok){
if(result.reason === "already-saved"){
showToast(t("toasts.alreadyInLibrary"), "error");
}
return;
}

showToast(t("toasts.addedToLibrary", { name: product.name }));
}

function buyProduct(product, source = "catalog"){
const result = saveProductRecord(product, { purchase: true });

if(!result.ok){
if(result.reason === "already-saved" && source === "catalog"){
showToast(t("toasts.alreadyInLibrary"), "error");
}
return;
}

if(result.alreadyPurchased){
showToast(t("toasts.alreadyPurchased"), "error");
return;
}

const message = t("toasts.purchaseComplete", { name: product.name });

if(source === "catalog"){
goToPage("library.html", { message, type: "success" });
return;
}

showToast(message);
}

function removeFromLibrary(productId){
const currentUser = getCurrentUser();

if(!currentUser){
return;
}

updateUserRecord({ ...currentUser, library: currentUser.library.filter((item) => item.id !== productId) });
syncUi();
showToast(t("toasts.removedFromLibrary"));
}

async function handleRegister(event){
event.preventDefault();

const submitButton = document.getElementById("registerSubmit");
const name = escapeText(document.getElementById("registerName")?.value);
const email = normalizeEmail(document.getElementById("registerEmail")?.value || "");
const password = document.getElementById("registerPassword")?.value || "";
const passwordRepeat = document.getElementById("registerPasswordRepeat")?.value || "";

if(name.length < 2){
showToast(t("toasts.enterFullName"), "error");
return;
}

if(!validateEmail(email)){
showToast(t("toasts.invalidEmail"), "error");
return;
}

if(!validatePassword(password)){
showToast(t("toasts.weakPassword"), "error");
return;
}

if(password !== passwordRepeat){
showToast(t("toasts.passwordsMismatch"), "error");
return;
}

const users = getUsers();

if(users.some((user) => user.email === email)){
showToast(t("toasts.accountExists"), "error");
return;
}

setButtonBusy(submitButton, true, t("busy.creating"));

try{
const salt = generateSaltHex();
const iterations = 120000;
const passwordHash = await derivePasswordHash(password, salt, iterations);
const browserCrypto = getCryptoApi();

users.push({
id: browserCrypto.randomUUID ? browserCrypto.randomUUID() : `user-${Date.now()}`,
name,
email,
passwordHash,
salt,
iterations,
library: [],
createdAt: new Date().toISOString()
});

saveUsers(users);
saveCurrentSession(email);
syncUi();
event.target.reset();
goToPage("library.html", { message: t("toasts.accountCreated"), type: "success" });
}catch(error){
showToast(error.message || t("toasts.createFailed"), "error");
}finally{
setButtonBusy(submitButton, false, t("busy.creating"));
}
}

async function handleLogin(event){
event.preventDefault();

const submitButton = document.getElementById("loginSubmit");
const email = normalizeEmail(document.getElementById("loginEmail")?.value || "");
const password = document.getElementById("loginPassword")?.value || "";
const user = getUsers().find((entry) => entry.email === email);

if(!validateEmail(email)){
showToast(t("toasts.invalidEmail"), "error");
return;
}

if(!password){
showToast(t("toasts.incorrectPassword"), "error");
return;
}

if(!user){
showToast(t("toasts.accountNotFound"), "error");
return;
}

setButtonBusy(submitButton, true, t("busy.checking"));

try{
const passwordHash = await derivePasswordHash(password, user.salt, user.iterations || 120000);

if(passwordHash !== user.passwordHash){
showToast(t("toasts.incorrectPassword"), "error");
return;
}

saveCurrentSession(user.email);
syncUi();
event.target.reset();
goToPage("library.html", { message: t("toasts.welcomeBack", { name: user.name }), type: "success" });
}catch(error){
showToast(error.message || t("toasts.loginFailed"), "error");
}finally{
setButtonBusy(submitButton, false, t("busy.checking"));
}
}

function logoutUser(){
saveCurrentSession(null);
syncUi();
closeMenu();
showToast(t("toasts.loggedOut"));
}

function bindProductActions(){
document.querySelectorAll("[data-add-library]").forEach((button) => {
button.addEventListener("click", () => {
addToLibrary(buildProductPayload(button.dataset.productId || ""));
});
});

document.querySelectorAll("[data-buy-product]").forEach((button) => {
button.addEventListener("click", () => {
buyProduct(buildProductPayload(button.dataset.productId || ""), "catalog");
});
});
}

function bindForms(){
const registerForm = document.getElementById("registerPanel");
const loginForm = document.getElementById("loginPanel");

if(registerForm){
registerForm.addEventListener("submit", handleRegister);
}

if(loginForm){
loginForm.addEventListener("submit", handleLogin);
}
}

function initScrollReveal(){
const revealItems = document.querySelectorAll(".reveal-on-scroll");

if(!revealItems.length){
return;
}

if(!("IntersectionObserver" in window)){
revealItems.forEach((item) => item.classList.add("is-visible"));
return;
}

const observer = new IntersectionObserver((entries) => {
entries.forEach((entry) => {
if(entry.isIntersecting){
entry.target.classList.add("is-visible");
observer.unobserve(entry.target);
}
});
}, { threshold: 0.16, rootMargin: "0px 0px -40px 0px" });

revealItems.forEach((item) => observer.observe(item));
}

function highlightCurrentPage(){
document.querySelectorAll(".menu-item").forEach((button) => {
button.classList.remove("is-current");
});

if(getPageType() === "catalog"){
document.getElementById("menuCatalogButton")?.classList.add("is-current");
}

if(getPageType() === "library"){
document.getElementById("menuLibraryButton")?.classList.add("is-current");
}

if(getPageType() === "login"){
document.getElementById("menuAuthPrimary")?.classList.add("is-current");
}

if(getPageType() === "register"){
document.getElementById("menuAuthSecondary")?.classList.add("is-current");
}
}

function applyTranslations(){
document.documentElement.lang = state.language;
document.title = t(`titles.${getPageType()}`);

document.querySelectorAll("[data-i18n]").forEach((element) => {
element.textContent = t(element.dataset.i18n);
});

document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
});

document.querySelectorAll("[data-i18n-alt]").forEach((element) => {
element.setAttribute("alt", t(element.dataset.i18nAlt));
});

document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
});

document.querySelectorAll("[data-lang-option]").forEach((button) => {
button.classList.toggle("active", button.dataset.langOption === state.language);
});

if(state.activeInfoType){
const infoKicker = document.getElementById("infoKicker");
const infoTitle = document.getElementById("infoTitle");
const infoText = document.getElementById("infoText");

if(infoKicker && infoTitle && infoText){
infoKicker.textContent = t(`info.${state.activeInfoType}.kicker`);
infoTitle.textContent = t(`info.${state.activeInfoType}.title`);
infoText.textContent = t(`info.${state.activeInfoType}.text`);
}
}
}

function bootstrap(){
state.language = getLanguage();
renderSharedShell();
loadCurrentSession();
bindProductActions();
bindForms();
applyTranslations();
syncUi();
initScrollReveal();
flushFlashToast();
}

document.addEventListener("keydown", (event) => {
if(event.key === "Escape"){
closeMenu();
closeChat();
closeActiveModal();
}
});

document.addEventListener("DOMContentLoaded", bootstrap);
