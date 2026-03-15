const STORAGE_KEYS = {
users: "lamp_store_users_v1",
session: "lamp_store_session_v1"
};

const state = {
activeModal: null,
activeAuthTab: "login",
currentUserEmail: null
};

const infoContent = {
return: {
kicker: "Returns",
title: "Return product",
text: "You can prepare a return request after sign in. In the next step we can add a proper return form, order lookup, and return status tracking."
},
contact: {
kicker: "Contact",
title: "Support contact",
text: "Lamp Store support can help with product questions, delivery details, and account issues. In the next step we can connect this section to a contact form or messenger."
}
};

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

function getCurrentUser(){
if(!state.currentUserEmail){
return null;
}

return getUsers().find((user) => user.email === state.currentUserEmail) || null;
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
switchAuthTab(tab);
openModal("authModal");
}

function openLibraryModal(){
renderLibrary();
openModal("libraryModal");
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
menuAccountLabel.textContent = "Signed in";
menuAccountName.textContent = `${currentUser.name}, your personal lamp library is active.`;
setMenuButtonContent(menuAuthPrimary, "Account", "Stay signed in and manage your access", "openAuthModal('login')");
setMenuButtonContent(menuAuthSecondary, "Log out", "Securely close the current session", "logoutUser()");
return;
}

menuAccountLabel.textContent = "Guest mode";
menuAccountName.textContent = "Sign in to save lamps in your personal library.";
setMenuButtonContent(menuAuthPrimary, "Log in", "Access your account securely", "openAuthModal('login')");
setMenuButtonContent(menuAuthSecondary, "Create account", "Create a new protected profile", "openAuthModal('register')");
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
libraryEmptyState.innerHTML = "<strong>Authorization required.</strong><p>Log in or create an account to build a personal lamp library.</p>";
return;
}

libraryIntro.textContent = `${currentUser.name}, these are the lamps saved in your private library.`;

const savedItems = Array.isArray(currentUser.library) ? currentUser.library : [];

if(savedItems.length === 0){
libraryEmptyState.style.display = "block";
libraryEmptyState.innerHTML = "<strong>Your library is empty.</strong><p>Add products from the catalog and they will appear here.</p>";
return;
}

libraryEmptyState.style.display = "none";

savedItems.forEach((item) => {
const card = document.createElement("article");
card.className = "library-card";

const copy = document.createElement("div");
const title = document.createElement("strong");
const price = document.createElement("span");
title.textContent = item.name;
price.textContent = `${item.price} - saved ${new Date(item.savedAt).toLocaleDateString()}`;

const removeButton = document.createElement("button");
removeButton.className = "library-remove";
removeButton.type = "button";
removeButton.textContent = "Remove";
removeButton.addEventListener("click", () => {
removeFromLibrary(item.id);
});

copy.appendChild(title);
copy.appendChild(price);
card.appendChild(copy);
card.appendChild(removeButton);
libraryList.appendChild(card);
});
}

function updateUserRecord(updatedUser){
const users = getUsers().map((user) => user.email === updatedUser.email ? updatedUser : user);
saveUsers(users);
}

function addToLibrary(product){
const currentUser = getCurrentUser();

if(!currentUser){
showToast("Please sign in first to save lamps in your library.", "error");
openAuthModal("login");
return;
}

const currentLibrary = Array.isArray(currentUser.library) ? currentUser.library : [];
const alreadySaved = currentLibrary.some((item) => item.id === product.id);

if(alreadySaved){
showToast("This lamp is already in your library.", "error");
openLibraryModal();
return;
}

const updatedUser = {
...currentUser,
library: [
...currentLibrary,
{
id: product.id,
name: product.name,
price: product.price,
savedAt: new Date().toISOString()
}
]
};

updateUserRecord(updatedUser);
renderMenuAccount();
renderLibrary();
showToast(`${product.name} was added to your library.`);
}

function removeFromLibrary(productId){
const currentUser = getCurrentUser();

if(!currentUser){
return;
}

const updatedUser = {
...currentUser,
library: (currentUser.library || []).filter((item) => item.id !== productId)
};

updateUserRecord(updatedUser);
renderLibrary();
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
renderMenuAccount();
renderLibrary();
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
renderMenuAccount();
renderLibrary();
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
renderMenuAccount();
renderLibrary();
closeMenu();
showToast("You have been logged out.");
}

function bindProductActions(){
document.querySelectorAll("[data-add-library]").forEach((button) => {
button.addEventListener("click", () => {
addToLibrary({
id: button.dataset.productId || "",
name: button.dataset.productName || "Lamp",
price: button.dataset.productPrice || "0 PLN"
});
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

function bootstrap(){
loadCurrentSession();
renderMenuAccount();
renderLibrary();
bindProductActions();
bindForms();
switchAuthTab(state.activeAuthTab);
}

document.addEventListener("keydown", (event) => {
if(event.key === "Escape"){
closeMenu();
closeChat();
closeActiveModal();
}
});

document.addEventListener("DOMContentLoaded", bootstrap);
