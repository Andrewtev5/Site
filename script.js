const STORAGE_KEYS = {
users: "lamp_store_users_v1",
session: "lamp_store_session_v1"
};

const state = {
activeModal: null,
activeAuthTab: "login",
currentUserEmail: null,
catalogProducts: {}
};

const infoContent = {
return: {
kicker: "Returns",
title: "Return product",
text: "You can prepare a return request after sign in. For the diploma demo, the store already supports saving products, pseudo-purchasing them, and managing the library in one place."
},
contact: {
kicker: "Contact",
title: "Support contact",
text: "Lamp Store support can help with product questions, delivery details, and account issues. In the next step this section can be connected to a contact form, messenger, or diploma presentation FAQ."
}
};

function getCurrentPageName(){
const path = window.location.pathname.replace(/\\/g, "/");
return path.split("/").pop().toLowerCase() || "index.html";
}

function goToPage(path){
if(!path){
return;
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
throw new Error("Secure browser crypto is unavailable. Open the project through localhost or Live Server.");
}

return window.crypto;
}

function bufferToHex(buffer){
return Array.from(new Uint8Array(buffer))
.map((byte) => byte.toString(16).padStart(2, "0"))
.join("");
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
throw new Error("Secure browser crypto is unavailable. Open the project through localhost or Live Server.");
}

const encoder = new TextEncoder();
const baseKey = await browserCrypto.subtle.importKey(
"raw",
encoder.encode(password),
{ name: "PBKDF2" },
false,
["deriveBits"]
);

const derivedBits = await browserCrypto.subtle.deriveBits(
{
name: "PBKDF2",
salt: hexToBytes(saltHex),
iterations,
hash: "SHA-256"
},
baseKey,
256
);

return bufferToHex(derivedBits);
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

function collectCatalogProducts(){
state.catalogProducts = {};

document.querySelectorAll("[data-product-id]").forEach((element) => {
const productId = element.dataset.productId;

if(!productId || state.catalogProducts[productId]){
return;
}

state.catalogProducts[productId] = {
id: productId,
name: element.dataset.productName || "Lamp",
price: element.dataset.productPrice || "0 PLN",
image: element.dataset.productImage || "images/lamp1.jpg",
tag: element.dataset.productTag || "Lamp",
description: element.dataset.productDescription || "Premium lamp for a stylish interior."
};
});
}

function getCatalogProduct(productId){
return state.catalogProducts[productId] || null;
}

function normalizeLibraryItem(item){
const defaults = getCatalogProduct(item?.id) || {};

return {
id: item?.id || defaults.id || `lamp-${Date.now()}`,
name: item?.name || defaults.name || "Lamp",
price: item?.price || defaults.price || "0 PLN",
image: item?.image || defaults.image || "images/lamp1.jpg",
tag: item?.tag || defaults.tag || "Lamp",
description: item?.description || defaults.description || "Premium lamp for a stylish interior.",
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
const users = getUsers().map((user) => user.email === updatedUser.email ? {
...updatedUser,
library: Array.isArray(updatedUser.library) ? updatedUser.library.map(normalizeLibraryItem) : []
} : user);

saveUsers(users);
}

function switchAuthTab(tab){
state.activeAuthTab = tab;

const loginTabButton = document.getElementById("loginTabButton");
const registerTabButton = document.getElementById("registerTabButton");
const loginPanel = document.getElementById("loginPanel");
const registerPanel = document.getElementById("registerPanel");

if(!loginTabButton || !registerTabButton || !loginPanel || !registerPanel){
return;
}

const isLogin = tab === "login";

loginTabButton.classList.toggle("active", isLogin);
registerTabButton.classList.toggle("active", !isLogin);
loginPanel.classList.toggle("active", isLogin);
registerPanel.classList.toggle("active", !isLogin);
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
const payload = infoContent[type];
const infoKicker = document.getElementById("infoKicker");
const infoTitle = document.getElementById("infoTitle");
const infoText = document.getElementById("infoText");

if(!payload || !infoKicker || !infoTitle || !infoText){
return;
}

infoKicker.textContent = payload.kicker;
infoTitle.textContent = payload.title;
infoText.textContent = payload.text;
openModal("infoModal");
}

function setMenuButtonContent(button, title, description, action){
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

menuAccountLabel.textContent = "Signed in";
menuAccountName.textContent = `${currentUser.name}, ${savedCount} lamp${savedCount === 1 ? "" : "s"} in library${purchasedCount ? `, ${purchasedCount} purchased.` : "."}`;
setMenuButtonContent(menuAuthPrimary, "Open library", "Review saved and purchased lamps", "openLibraryModal()");
setMenuButtonContent(menuAuthSecondary, "Log out", "Securely close the current session", "logoutUser()");
return;
}

menuAccountLabel.textContent = "Guest mode";
menuAccountName.textContent = "Sign in to save lamps in your personal library and run a demo purchase.";
setMenuButtonContent(menuAuthPrimary, "Log in", "Access your account securely", "openAuthModal('login')");
setMenuButtonContent(menuAuthSecondary, "Create account", "Create a new protected profile", "openAuthModal('register')");
}

function formatDate(value){
return new Date(value).toLocaleDateString();
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
libraryIntro.textContent = "Sign in to keep your saved lamps here.";
libraryEmptyState.style.display = "block";
libraryEmptyState.innerHTML = "<strong>Authorization required.</strong><p>Log in or create an account to build a personal lamp library and use the demo purchase buttons.</p>";
return;
}

const savedItems = currentUser.library;
const purchasedCount = savedItems.filter((item) => item.purchasedAt).length;

libraryIntro.textContent = `${currentUser.name}, you saved ${savedItems.length} lamp${savedItems.length === 1 ? "" : "s"} in your private library. Purchased: ${purchasedCount}.`;

if(savedItems.length === 0){
libraryEmptyState.style.display = "block";
libraryEmptyState.innerHTML = "<strong>Your library is empty.</strong><p>Add products from the catalog and they will appear here with images and a buy button.</p>";
return;
}

libraryEmptyState.style.display = "none";

savedItems.forEach((item) => {
const card = document.createElement("article");
card.className = "library-card";

const image = document.createElement("img");
image.className = "library-card-image";
image.src = item.image;
image.alt = item.name;

const copy = document.createElement("div");
copy.className = "library-card-copy";

const tag = document.createElement("span");
tag.className = "library-card-tag";
tag.textContent = item.tag;

const title = document.createElement("strong");
title.textContent = item.name;

const meta = document.createElement("span");
meta.textContent = `${item.price} - saved ${formatDate(item.savedAt)}`;

const description = document.createElement("span");
description.textContent = item.description;

const status = document.createElement("span");
status.className = "library-card-status";
status.textContent = item.purchasedAt ? `Purchased on ${formatDate(item.purchasedAt)}` : "Ready for demo purchase";

if(item.purchasedAt){
status.classList.add("purchased");
}

copy.appendChild(tag);
copy.appendChild(title);
copy.appendChild(meta);
copy.appendChild(description);
copy.appendChild(status);

const actions = document.createElement("div");
actions.className = "library-card-actions";

const buyButton = document.createElement("button");
buyButton.className = "library-buy";
buyButton.type = "button";
buyButton.textContent = item.purchasedAt ? "Purchased" : "Buy";
buyButton.disabled = Boolean(item.purchasedAt);
buyButton.addEventListener("click", () => {
buyProduct(item, "library");
});

const removeButton = document.createElement("button");
removeButton.className = "library-remove";
removeButton.type = "button";
removeButton.textContent = "Remove";
removeButton.addEventListener("click", () => {
removeFromLibrary(item.id);
});

actions.appendChild(buyButton);
actions.appendChild(removeButton);
card.appendChild(image);
card.appendChild(copy);
card.appendChild(actions);
libraryList.appendChild(card);
});
}

function getProductState(productId){
const currentUser = getCurrentUser();

if(!currentUser){
return {
saved: false,
purchased: false
};
}

const item = currentUser.library.find((entry) => entry.id === productId);

return {
saved: Boolean(item),
purchased: Boolean(item?.purchasedAt)
};
}

function renderProductActions(){
document.querySelectorAll("[data-add-library]").forEach((button) => {
const productId = button.dataset.productId || "";
const productState = getProductState(productId);

button.textContent = productState.saved ? "Saved in library" : "Add to library";
button.disabled = productState.saved;
});

document.querySelectorAll("[data-buy-product]").forEach((button) => {
const productId = button.dataset.productId || "";
const productState = getProductState(productId);

button.textContent = productState.purchased ? "Purchased" : "Buy now";
button.disabled = productState.purchased;
});
}

function syncUi(){
renderMenuAccount();
renderLibrary();
renderProductActions();
}

function ensureSignedIn(actionText){
const currentUser = getCurrentUser();

if(currentUser){
return currentUser;
}

showToast(`Please sign in first to ${actionText}.`, "error");
openAuthModal("login");
return null;
}

function buildProductPayloadFromButton(button){
return normalizeLibraryItem({
id: button.dataset.productId || "",
name: button.dataset.productName || "Lamp",
price: button.dataset.productPrice || "0 PLN",
image: button.dataset.productImage || "images/lamp1.jpg",
tag: button.dataset.productTag || "Lamp",
description: button.dataset.productDescription || "Premium lamp for a stylish interior."
});
}

function saveProductRecord(product, options = {}){
const currentUser = ensureSignedIn(options.actionText || "save this product");

if(!currentUser){
return { ok: false };
}

const currentLibrary = currentUser.library;
const existingItem = currentLibrary.find((item) => item.id === product.id);

if(existingItem && !options.purchase){
return {
ok: false,
reason: "already-saved"
};
}

const now = new Date().toISOString();
const nextItem = normalizeLibraryItem({
...existingItem,
...product,
savedAt: existingItem?.savedAt || now,
purchasedAt: options.purchase ? existingItem?.purchasedAt || now : existingItem?.purchasedAt || null
});

const nextLibrary = existingItem
? currentLibrary.map((item) => item.id === product.id ? nextItem : item)
: [...currentLibrary, nextItem];

updateUserRecord({
...currentUser,
library: nextLibrary
});

syncUi();

return {
ok: true,
added: !existingItem,
alreadyPurchased: Boolean(existingItem?.purchasedAt),
purchased: Boolean(nextItem.purchasedAt)
};
}

function addToLibrary(product){
const result = saveProductRecord(product, { actionText: "save products in your library" });

if(!result.ok){
if(result.reason === "already-saved"){
showToast("This lamp is already in your library.", "error");
openLibraryModal();
}
return;
}

showToast(`${product.name} was added to your library.`);
}

function buyProduct(product, source = "catalog"){
const result = saveProductRecord(product, {
purchase: true,
actionText: "complete the demo purchase"
});

if(!result.ok){
if(result.reason === "already-saved" && source === "catalog"){
showToast("This lamp is already in your library.", "error");
}
return;
}

if(result.alreadyPurchased){
showToast("This lamp has already been purchased in the demo.", "error");
openLibraryModal();
return;
}

showToast(`${product.name} demo purchase completed.`);

if(source === "catalog"){
openLibraryModal();
}
}

function removeFromLibrary(productId){
const currentUser = getCurrentUser();

if(!currentUser){
return;
}

const updatedUser = {
...currentUser,
library: currentUser.library.filter((item) => item.id !== productId)
};

updateUserRecord(updatedUser);
syncUi();
showToast("Lamp removed from your library.");
}

async function handleRegister(event){
event.preventDefault();

const submitButton = document.getElementById("registerSubmit");
const name = escapeText(document.getElementById("registerName")?.value);
const email = normalizeEmail(document.getElementById("registerEmail")?.value || "");
const password = document.getElementById("registerPassword")?.value || "";
const passwordRepeat = document.getElementById("registerPasswordRepeat")?.value || "";

if(name.length < 2){
showToast("Enter your full name.", "error");
return;
}

if(!validateEmail(email)){
showToast("Enter a valid email address.", "error");
return;
}

if(!validatePassword(password)){
showToast("Password must be stronger: 8+ chars, upper/lower case, and one digit.", "error");
return;
}

if(password !== passwordRepeat){
showToast("Passwords do not match.", "error");
return;
}

const users = getUsers();
const userExists = users.some((user) => user.email === email);

if(userExists){
showToast("An account with this email already exists.", "error");
return;
}

setButtonBusy(submitButton, true, "Creating...");

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
closeActiveModal();
showToast("Account created and signed in successfully.");
}catch(error){
showToast(error.message || "Unable to create account.", "error");
}finally{
setButtonBusy(submitButton, false, "Creating...");
}
}

async function handleLogin(event){
event.preventDefault();

const submitButton = document.getElementById("loginSubmit");
const email = normalizeEmail(document.getElementById("loginEmail")?.value || "");
const password = document.getElementById("loginPassword")?.value || "";
const user = getUsers().find((entry) => entry.email === email);

if(!validateEmail(email)){
showToast("Enter a valid email address.", "error");
return;
}

if(!password){
showToast("Enter your password.", "error");
return;
}

if(!user){
showToast("Account not found.", "error");
return;
}

setButtonBusy(submitButton, true, "Checking...");

try{
const passwordHash = await derivePasswordHash(password, user.salt, user.iterations || 120000);

if(passwordHash !== user.passwordHash){
showToast("Incorrect password.", "error");
return;
}

saveCurrentSession(user.email);
syncUi();
event.target.reset();
closeActiveModal();
showToast(`Welcome back, ${user.name}.`);
}catch(error){
showToast(error.message || "Unable to log in.", "error");
}finally{
setButtonBusy(submitButton, false, "Checking...");
}
}

function logoutUser(){
saveCurrentSession(null);
syncUi();
closeMenu();
showToast("You have been logged out.");
}

function bindProductActions(){
document.querySelectorAll("[data-add-library]").forEach((button) => {
button.addEventListener("click", () => {
addToLibrary(buildProductPayloadFromButton(button));
});
});

document.querySelectorAll("[data-buy-product]").forEach((button) => {
button.addEventListener("click", () => {
buyProduct(buildProductPayloadFromButton(button), "catalog");
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
}, {
threshold: 0.16,
rootMargin: "0px 0px -40px 0px"
});

revealItems.forEach((item) => observer.observe(item));
}

function bootstrap(){
collectCatalogProducts();
loadCurrentSession();
bindProductActions();
bindForms();
switchAuthTab(state.activeAuthTab);
syncUi();
initScrollReveal();
}

document.addEventListener("keydown", (event) => {
if(event.key === "Escape"){
closeMenu();
closeChat();
closeActiveModal();
}
});

document.addEventListener("DOMContentLoaded", bootstrap);
