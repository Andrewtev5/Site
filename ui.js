window.LampUI = (() => {
const { state, escapeHtml } = window.LampStorage;
const t = (...args) => window.LampI18n.t(...args);
const CHAT_API_BASE_URL = window.LAMP_BOT_API_BASE || "http://127.0.0.1:8001/api/v1";
const CHAT_SESSION_KEY = "lamp_store_chat_session_v1";

function getCurrentPageName(){
const path = window.location.pathname.replace(/\\/g, "/");
return path.split("/").pop().toLowerCase() || "index.html";
}

function getPageType(){
return document.body.dataset.page || "catalog";
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
<div class="menu-overlay" id="menuOverlay" data-close-menu></div>
<div class="modal-overlay" id="modalOverlay" data-close-modal></div>
<button class="menu-tab" type="button" data-toggle-menu data-i18n-aria-label="aria.openMenu" aria-label="Open menu">
<div class="tab-icon"><span></span><span></span><span></span></div>
</button>
<header class="header">
<div class="header-inner">
<h1 class="logo-title"><span class="logo-brand" data-i18n="brand">Sklep Lamp</span></h1>
<div class="header-tools">
<button class="cart-trigger" id="cartButton" type="button" data-open-cart aria-label="Open cart">
<span class="cart-trigger-icon" aria-hidden="true"></span>
<span data-i18n="cart.trigger">Cart</span>
<strong id="cartCount">0</strong>
</button>
<button class="search-trigger" id="searchButton" type="button" data-open-search data-i18n-aria-label="aria.openSearch" aria-label="Open product search">
<span class="search-trigger-dot" aria-hidden="true"></span>
<span data-i18n="search.trigger">Szukaj</span>
</button>
<div class="lang-switch" role="group" data-i18n-aria-label="aria.languageSwitch" aria-label="Language switch">
<button class="lang-option" type="button" data-lang-option="en">EN</button>
<button class="lang-option" type="button" data-lang-option="pl">PL</button>
</div>
</div>
</div>
</header>
<aside class="side-menu" id="sideMenu" aria-hidden="true">
<div class="side-menu-head">
<div><p class="menu-eyebrow" data-i18n="menu.eyebrow">Sklep Lamp</p><h3 data-i18n="menu.title">Menu</h3></div>
<button class="menu-close" type="button" data-close-menu data-i18n-aria-label="aria.closeMenu" aria-label="Close menu">&times;</button>
</div>
<div class="menu-account-card" id="menuAccountCard">
<span class="menu-account-label" id="menuAccountLabel">Tryb goscia</span>
<strong class="menu-account-name" id="menuAccountName">Zaloguj się, aby zapisywać lampy w swojej bibliotece.</strong>
</div>
<nav class="menu-nav">
<button class="menu-item" id="menuCatalogButton" type="button" data-go-page="index.html"><span data-i18n="menu.catalogTitle">Katalog</span><small data-i18n="menu.catalogDesc">Przegladaj cala kolekcje lamp</small></button>
<button class="menu-item" id="menuAuthPrimary" type="button" data-open-auth="login"><span data-i18n="menu.loginTitle">Zaloguj się</span><small data-i18n="menu.loginDesc">Uzyskaj bezpieczny dostęp do konta</small></button>
<button class="menu-item" id="menuAuthSecondary" type="button" data-open-auth="register"><span data-i18n="menu.registerTitle">Załóż konto</span><small data-i18n="menu.registerDesc">Utwórz nowy profil</small></button>
<button class="menu-item" id="menuLibraryButton" type="button" data-open-library><span data-i18n="menu.libraryTitle">Biblioteka</span><small data-i18n="menu.libraryDesc">Zapisane lampy i ulubione</small></button>
<button class="menu-item" type="button" data-open-info="return"><span data-i18n="menu.returnTitle">Zwrot produktu</span><small data-i18n="menu.returnDesc">Wskazowki zwrotu i gwarancji</small></button>
<button class="menu-item" type="button" data-open-info="contact"><span data-i18n="menu.contactTitle">Kontakt</span><small data-i18n="menu.contactDesc">Wsparcie i komunikacja</small></button>
</nav>
</aside>
`);

main.insertAdjacentHTML("afterend", `
<section class="modal-window info-modal" id="infoModal" aria-hidden="true" role="dialog" aria-modal="true" data-i18n-aria-label="aria.infoWindow" aria-label="Information window" tabindex="-1">
<div class="modal-head">
<div><p class="modal-kicker" id="infoKicker">Zwroty</p><h3 class="modal-title" id="infoTitle">Zwrot produktu</h3></div>
<button class="modal-close" type="button" data-close-modal data-i18n-aria-label="aria.closeInfo" aria-label="Close information window">&times;</button>
</div>
<p class="info-text" id="infoText"></p>
</section>
<section class="modal-window search-modal" id="searchModal" aria-hidden="true" role="dialog" aria-modal="true" data-i18n-aria-label="aria.searchWindow" aria-label="Product search window" tabindex="-1">
<div class="modal-head">
<div><p class="modal-kicker" data-i18n="search.kicker">Wyszukiwanie</p><h3 class="modal-title" data-i18n="search.title">Znajdz lampe</h3></div>
<button class="modal-close" type="button" data-close-modal data-i18n-aria-label="aria.closeSearch" aria-label="Close product search">&times;</button>
</div>
<p class="search-text" data-i18n="search.text">Wpisz przyblizona albo dokladna nazwe produktu, a ponizej od razu pojawia sie podobne lampy.</p>
<label class="search-input-wrap" for="searchInput"><span class="search-input-label" data-i18n="search.inputLabel">Nazwa produktu</span><input class="search-input" id="searchInput" type="text" autocomplete="off" data-i18n-placeholder="search.placeholder" placeholder="Wpisz nazwe lampy"></label>
<p class="search-results-meta" id="searchResultsMeta" data-i18n="search.initialState">Zacznij wpisywac, aby zobaczyc pasujace produkty.</p>
<div class="search-results" id="searchResults" role="list"></div>
</section>
<section class="modal-window cart-modal" id="cartModal" aria-hidden="true" role="dialog" aria-modal="true" aria-label="Cart" tabindex="-1">
<div class="modal-head">
<div><p class="modal-kicker" data-i18n="cart.kicker">Cart</p><h3 class="modal-title" data-i18n="cart.title">Your cart</h3></div>
<button class="modal-close" type="button" data-close-modal aria-label="Close cart">&times;</button>
</div>
<div class="cart-list" id="cartList"></div>
<div class="cart-total"><span data-i18n="cart.total">Total</span><strong id="cartTotal">0 PLN</strong></div>
</section>
<button class="chat-button" type="button" data-toggle-chat data-i18n-aria-label="aria.openAssistant" aria-label="Open assistant">
<img src="images/botlog.png" data-i18n-alt="chat.robotAlt" alt="Assistant robot">
</button>
<div class="chat-overlay" id="chatOverlay" data-close-chat></div>
<section class="chat-modal" id="chatWindow" aria-hidden="true" data-i18n-aria-label="aria.assistantWindow" aria-label="Lamp Assistant window">
<div class="chat-head">
<div class="chat-avatar"><img src="images/botlog.png" data-i18n-alt="chat.robotAlt" alt="Assistant robot"></div>
<div><div class="chat-badge" data-i18n="chat.badge">Asystent Lamp</div><h3 class="chat-title" data-i18n="chat.title">Chat</h3></div>
</div>
<div class="chat-messages" id="chatMessages" aria-live="polite">
<div class="chat-message assistant"><span data-i18n="chat.placeholderMessage">Napisz wiadomość, a później podłączymy tutaj odpowiedzi bota.</span></div>
</div>
<form class="chat-form" data-chat-form>
<label class="sr-only" for="chatInput" data-i18n="chat.inputLabel">Message</label>
<input class="chat-input" id="chatInput" name="message" type="text" autocomplete="off" data-i18n-placeholder="chat.placeholder" placeholder="Napisz wiadomość...">
<button class="chat-send" type="submit" data-i18n="chat.send">Send</button>
</form>
</section>
<div class="toast-stack" id="toastStack" aria-live="polite" aria-atomic="true"></div>
<footer><p data-i18n="footer.copyright">&copy; 2026 Sklep Lamp</p></footer>
`);

bindUiEvents();
}

function bindUiEvents(){
document.querySelectorAll("[data-lang-option]").forEach((button) => {
button.addEventListener("click", () => window.LampI18n.setLanguage(button.dataset.langOption || window.LAMP_I18N.defaultLanguage));
});

document.addEventListener("click", (event) => {
const target = event.target;

if(target.closest("[data-toggle-menu]")) toggleMenu();
if(target.closest("[data-close-menu]")) closeMenu();
if(target.closest("[data-close-modal]")) closeActiveModal();
if(target.closest("[data-toggle-chat]")) toggleChat();
if(target.closest("[data-close-chat]")) closeChat();
if(target.closest("[data-open-search]")) window.LampSearch.openSearchModal();
if(target.closest("[data-open-cart]")) window.LampProducts.openCartModal();

const pageButton = target.closest("[data-go-page]");
if(pageButton) goToPage(pageButton.dataset.goPage);

const authButton = target.closest("[data-open-auth]");
if(authButton) openAuthModal(authButton.dataset.openAuth);

if(target.closest("[data-open-library]")) openLibraryModal();

const infoButton = target.closest("[data-open-info]");
if(infoButton) openInfoModal(infoButton.dataset.openInfo);
});

document.addEventListener("submit", (event) => {
const form = event.target.closest("[data-chat-form]");
if(!form) return;

event.preventDefault();
sendChatMessage(form);
});

document.addEventListener("keydown", (event) => {
if(event.key === "Escape"){
closeMenu();
closeChat();
closeActiveModal();
}

if(event.key === "Tab" && state.activeModal){
trapFocus(event);
}
});
}

function goToPage(path, toastPayload = null){
if(!path) return;

if(toastPayload?.message){
window.LampStorage.queueFlashToast(toastPayload.message, toastPayload.type || "success");
}

closeMenu();
closeChat();
closeActiveModal();
window.location.href = path;
}

function toggleMenu(){
const menu = document.getElementById("sideMenu");
const overlay = document.getElementById("menuOverlay");
if(!menu || !overlay) return;

const willOpen = !menu.classList.contains("active");
menu.classList.toggle("active", willOpen);
overlay.classList.toggle("active", willOpen);
document.body.classList.toggle("menu-open", willOpen);
menu.setAttribute("aria-hidden", String(!willOpen));

if(willOpen){
menu.querySelector("button")?.focus();
}
}

function closeMenu(){
const menu = document.getElementById("sideMenu");
const overlay = document.getElementById("menuOverlay");
if(!menu || !overlay) return;

menu.classList.remove("active");
overlay.classList.remove("active");
document.body.classList.remove("menu-open");
menu.setAttribute("aria-hidden", "true");
}

function toggleChat(){
const chat = document.getElementById("chatWindow");
const overlay = document.getElementById("chatOverlay");
if(!chat || !overlay) return;

const willOpen = !chat.classList.contains("active");
chat.classList.toggle("active", willOpen);
overlay.classList.toggle("active", willOpen);
document.body.classList.toggle("chat-open", willOpen);
chat.setAttribute("aria-hidden", String(!willOpen));

if(willOpen){
setTimeout(() => document.getElementById("chatInput")?.focus(), 80);
}
}

function closeChat(){
const chat = document.getElementById("chatWindow");
const overlay = document.getElementById("chatOverlay");
if(!chat || !overlay) return;

chat.classList.remove("active");
overlay.classList.remove("active");
document.body.classList.remove("chat-open");
chat.setAttribute("aria-hidden", "true");
}

function appendChatMessage(messages, text, role = "assistant"){
const message = document.createElement("div");
message.className = `chat-message ${role}`;
message.textContent = text;
messages.appendChild(message);
messages.scrollTop = messages.scrollHeight;
return message;
}

function formatChatPrice(product){
const amount = Number(product?.price || 0);
const price = Number.isFinite(amount) ? amount.toFixed(0) : "0";
return `${price} ${product?.currency || "PLN"}`;
}

function appendChatProducts(messages, products){
if(!Array.isArray(products) || products.length === 0) return;

const group = document.createElement("div");
group.className = "chat-products";
group.innerHTML = products.map((product) => {
const productId = escapeHtml(product.id || "");
const name = escapeHtml(product.name || "Lampa");
const description = escapeHtml(product.description || "");
const price = escapeHtml(formatChatPrice(product));
const image = escapeHtml(product.image_url || "images/lamp1.jpg");

return `
<article class="chat-product-card">
<img class="chat-product-image" src="${image}" alt="${name}">
<div class="chat-product-copy">
<strong>${name}</strong>
<span>${price}</span>
<p>${description}</p>
</div>
<div class="chat-product-actions">
<button class="product-action secondary" type="button" data-add-cart data-product-id="${productId}">${escapeHtml(t("cart.add"))}</button>
<button class="product-action secondary" type="button" data-add-library data-product-id="${productId}">${escapeHtml(t("buttons.addToLibrary"))}</button>
<button class="product-action" type="button" data-buy-product data-product-id="${productId}">${escapeHtml(t("buttons.buyNow"))}</button>
</div>
</article>
`;
}).join("");

messages.appendChild(group);
messages.scrollTop = messages.scrollHeight;
}

function getChatSessionId(){
return sessionStorage.getItem(CHAT_SESSION_KEY);
}

function saveChatSessionId(sessionId){
if(sessionId){
sessionStorage.setItem(CHAT_SESSION_KEY, sessionId);
}
}

async function sendChatMessage(form){
const input = form.querySelector(".chat-input");
const button = form.querySelector(".chat-send");
const messages = document.getElementById("chatMessages");
const text = input?.value.trim();
if(!input || !messages || !text) return;

appendChatMessage(messages, text, "user");
input.value = "";

input.disabled = true;
if(button) button.disabled = true;
const loadingMessage = appendChatMessage(messages, t("chat.loading"));

try{
const response = await fetch(`${CHAT_API_BASE_URL}/chat/messages`, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({
session_id: getChatSessionId(),
language: state.language || "pl",
text,
metadata: { source: "site-widget" }
})
});
const payload = await response.json().catch(() => ({}));

if(!response.ok){
throw new Error(payload.detail || payload.error || `Bot API ${response.status}`);
}

saveChatSessionId(payload.session?.id);
loadingMessage.textContent = payload.reply?.text || t("chat.emptyReply");
appendChatProducts(messages, payload.matched_products || []);
}catch(error){
loadingMessage.textContent = t("chat.connectionError");
console.warn("Chat bot unavailable.", error);
}finally{
input.disabled = false;
if(button) button.disabled = false;
input.focus();
messages.scrollTop = messages.scrollHeight;
}
}

function openModal(modalId){
const overlay = document.getElementById("modalOverlay");
const modal = document.getElementById(modalId);
if(!overlay || !modal) return;

closeMenu();
closeActiveModal();
state.lastFocusedElement = document.activeElement;
overlay.classList.add("active");
modal.classList.add("active");
document.body.classList.add("modal-open");
modal.setAttribute("aria-hidden", "false");
state.activeModal = modalId;

window.setTimeout(() => {
(modal.querySelector("input, button, [href], [tabindex]:not([tabindex='-1'])") || modal).focus();
}, 50);
}

function closeActiveModal(){
const overlay = document.getElementById("modalOverlay");
if(overlay) overlay.classList.remove("active");

document.querySelectorAll(".modal-window.active").forEach((modal) => {
modal.classList.remove("active");
modal.setAttribute("aria-hidden", "true");
});

document.body.classList.remove("modal-open");
state.activeModal = null;
state.activeInfoType = null;

if(state.lastFocusedElement?.focus){
state.lastFocusedElement.focus();
}
}

function trapFocus(event){
const modal = document.getElementById(state.activeModal);
if(!modal) return;

const focusable = [...modal.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])")];
if(!focusable.length) return;

const first = focusable[0];
const last = focusable[focusable.length - 1];

if(event.shiftKey && document.activeElement === first){
event.preventDefault();
last.focus();
}

if(!event.shiftKey && document.activeElement === last){
event.preventDefault();
first.focus();
}
}

function openAuthModal(tab = "login"){
const targetPage = tab === "register" ? "register.html" : "login.html";
if(getCurrentPageName() === targetPage) return;
goToPage(targetPage);
}

function openLibraryModal(){
if(getCurrentPageName() === "library.html"){
window.LampProducts.renderLibrary();
return;
}
goToPage("library.html");
}

function openInfoModal(type){
state.activeInfoType = type;
refreshActiveInfoModal();
openModal("infoModal");
}

function refreshActiveInfoModal(){
if(!state.activeInfoType) return;

const infoKicker = document.getElementById("infoKicker");
const infoTitle = document.getElementById("infoTitle");
const infoText = document.getElementById("infoText");
if(!infoKicker || !infoTitle || !infoText) return;

infoKicker.textContent = t(`info.${state.activeInfoType}.kicker`);
infoTitle.textContent = t(`info.${state.activeInfoType}.title`);
infoText.textContent = t(`info.${state.activeInfoType}.text`);
}

function showToast(message, type = "success"){
const stack = document.getElementById("toastStack");
if(!stack) return;

const toast = document.createElement("div");
toast.className = `toast ${type}`;
toast.textContent = message;
stack.appendChild(toast);

window.setTimeout(() => toast.remove(), 3600);
}

function setButtonBusy(button, isBusy, busyText){
if(!button) return;

if(isBusy){
button.dataset.originalText = button.textContent;
button.textContent = busyText;
button.disabled = true;
return;
}

button.textContent = button.dataset.originalText || button.textContent;
button.disabled = false;
}

function setMenuButtonContent(button, title, description, actionName){
if(!button) return;

button.querySelector("span").textContent = title;
button.querySelector("small").textContent = description;
delete button.dataset.openAuth;
delete button.dataset.openLibrary;
delete button.dataset.logout;

if(actionName === "library") button.dataset.openLibrary = "true";
if(actionName === "logout") button.dataset.logout = "true";
if(actionName === "login" || actionName === "register") button.dataset.openAuth = actionName;
}

function renderMenuAccount(){
const currentUser = window.LampStorage.state.currentUser;
const menuAccountLabel = document.getElementById("menuAccountLabel");
const menuAccountName = document.getElementById("menuAccountName");
const menuAuthPrimary = document.getElementById("menuAuthPrimary");
const menuAuthSecondary = document.getElementById("menuAuthSecondary");
if(!menuAccountLabel || !menuAccountName || !menuAuthPrimary || !menuAuthSecondary) return;

if(currentUser){
const stats = window.LampProducts.getUserStats();
menuAccountLabel.textContent = t("account.signedInLabel");
menuAccountName.textContent = t("account.signedInText", { name: currentUser.name, savedCount: stats.savedCount, purchasedCount: stats.purchasedCount });
setMenuButtonContent(menuAuthPrimary, t("account.openLibraryTitle"), t("account.openLibraryDesc"), "library");
setMenuButtonContent(menuAuthSecondary, t("account.logoutTitle"), t("account.logoutDesc"), "logout");
return;
}

menuAccountLabel.textContent = t("account.guestLabel");
menuAccountName.textContent = t("account.guestText");
setMenuButtonContent(menuAuthPrimary, t("menu.loginTitle"), t("menu.loginDesc"), "login");
setMenuButtonContent(menuAuthSecondary, t("menu.registerTitle"), t("menu.registerDesc"), "register");
}

function highlightCurrentPage(){
document.querySelectorAll(".menu-item").forEach((button) => button.classList.remove("is-current"));

if(getPageType() === "catalog") document.getElementById("menuCatalogButton")?.classList.add("is-current");
if(getPageType() === "library") document.getElementById("menuLibraryButton")?.classList.add("is-current");
if(getPageType() === "login") document.getElementById("menuAuthPrimary")?.classList.add("is-current");
if(getPageType() === "register") document.getElementById("menuAuthSecondary")?.classList.add("is-current");
if(getPageType() === "cart") document.getElementById("cartButton")?.classList.add("is-current");
}

function initScrollReveal(){
const revealItems = document.querySelectorAll(".reveal-on-scroll");
if(!revealItems.length) return;

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

function exposeLegacyGlobals(){
Object.assign(window, {
goToPage,
toggleMenu,
closeMenu,
toggleChat,
closeChat,
closeActiveModal,
openAuthModal,
openLibraryModal,
openInfoModal,
openSearchModal: () => window.LampSearch.openSearchModal(),
logoutUser: () => window.LampAuth.logoutUser()
});
}

return {
getCurrentPageName,
getPageType,
renderSharedShell,
goToPage,
openModal,
closeActiveModal,
showToast,
setButtonBusy,
renderMenuAccount,
highlightCurrentPage,
initScrollReveal,
refreshActiveInfoModal,
exposeLegacyGlobals
};
})();
