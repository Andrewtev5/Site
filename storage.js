window.LampStorage = (() => {
const STORAGE_KEYS = {
users: "lamp_store_users_v1",
session: "lamp_store_session_v2",
language: "lamp_store_language_v1",
flashToast: "lamp_store_flash_toast_v1",
cart: "lamp_store_cart_v1"
};

const state = {
activeModal: null,
lastFocusedElement: null,
currentUser: null,
apiToken: null,
language: window.LAMP_I18N?.defaultLanguage || "pl",
activeInfoType: null,
searchQuery: "",
catalogSource: "local"
};

function escapeHtml(value){
return String(value)
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;")
.replace(/"/g, "&quot;")
.replace(/'/g, "&#39;");
}

function normalizeEmail(email){
return String(email || "").trim().toLowerCase();
}

function escapeText(value){
return String(value || "").replace(/\s+/g, " ").trim();
}

function formatDate(value){
return new Date(value).toLocaleDateString(window.LampI18n.getLocale());
}

function loadSession(){
try{
const payload = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.session) || "null");
state.currentUser = payload?.user || null;
state.apiToken = payload?.token || null;
}catch(error){
state.currentUser = null;
state.apiToken = null;
}
}

function saveSession(user, token = state.apiToken){
state.currentUser = user || null;
state.apiToken = user ? token : null;

if(user){
sessionStorage.setItem(STORAGE_KEYS.session, JSON.stringify({ user, token }));
return;
}

sessionStorage.removeItem(STORAGE_KEYS.session);
}

function authHeaders(){
return state.apiToken ? { Authorization: `Bearer ${state.apiToken}` } : {};
}

async function apiFetch(path, options = {}){
let response;

try{
response = await fetch(path, {
...options,
headers: {
"Content-Type": "application/json",
...authHeaders(),
...(options.headers || {})
}
});
}catch(error){
error.isNetworkError = true;
throw error;
}

const payload = await response.json().catch(() => ({}));

if(!response.ok){
const error = new Error(payload.error || payload.message || `API ${response.status}`);
error.status = response.status;
error.payload = payload;
throw error;
}

return payload;
}

async function apiAvailable(){
try{
await apiFetch("/api/health", { method: "GET" });
return true;
}catch(error){
return false;
}
}

function getUsersFallback(){
try{
const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || "[]");
return Array.isArray(users) ? users : [];
}catch(error){
return [];
}
}

function saveUsersFallback(users){
localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
}

function getLocalCart(){
try{
const items = JSON.parse(localStorage.getItem(STORAGE_KEYS.cart) || "[]");
return Array.isArray(items) ? items : [];
}catch(error){
return [];
}
}

function saveLocalCart(items){
localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(items));
}

function queueFlashToast(message, type = "success"){
sessionStorage.setItem(STORAGE_KEYS.flashToast, JSON.stringify({ message, type }));
}

function flushFlashToast(){
try{
const payload = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.flashToast) || "null");

if(payload?.message){
window.LampUI.showToast(payload.message, payload.type || "success");
}
}catch(error){
}

sessionStorage.removeItem(STORAGE_KEYS.flashToast);
}

return {
STORAGE_KEYS,
state,
escapeHtml,
normalizeEmail,
escapeText,
formatDate,
loadSession,
saveSession,
apiFetch,
apiAvailable,
getUsersFallback,
saveUsersFallback,
getLocalCart,
saveLocalCart,
queueFlashToast,
flushFlashToast
};
})();
