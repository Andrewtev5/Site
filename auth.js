window.LampAuth = (() => {
const storage = window.LampStorage;
const { state, normalizeEmail, escapeText } = storage;
const t = (...args) => window.LampI18n.t(...args);

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

function createFallbackUser(name, email, password){
const users = storage.getUsersFallback();

if(users.some((user) => user.email === email)){
throw new Error(t("toasts.accountExists"));
}

const user = {
id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `user-${Date.now()}`,
name,
email,
password,
createdAt: new Date().toISOString()
};

storage.saveUsersFallback([...users, user]);
return user;
}

function loginFallback(email, password){
const user = storage.getUsersFallback().find((entry) => entry.email === email);

if(!user){
throw new Error(t("toasts.accountNotFound"));
}

if(user.password !== password){
throw new Error(t("toasts.incorrectPassword"));
}

return user;
}

async function handleRegister(event){
event.preventDefault();

const submitButton = document.getElementById("registerSubmit");
const name = escapeText(document.getElementById("registerName")?.value);
const email = normalizeEmail(document.getElementById("registerEmail")?.value || "");
const password = document.getElementById("registerPassword")?.value || "";
const passwordRepeat = document.getElementById("registerPasswordRepeat")?.value || "";

if(name.length < 2){
window.LampUI.showToast(t("toasts.enterFullName"), "error");
return;
}

if(!validateEmail(email)){
window.LampUI.showToast(t("toasts.invalidEmail"), "error");
return;
}

if(!validatePassword(password)){
window.LampUI.showToast(t("toasts.weakPassword"), "error");
return;
}

if(password !== passwordRepeat){
window.LampUI.showToast(t("toasts.passwordsMismatch"), "error");
return;
}

window.LampUI.setButtonBusy(submitButton, true, t("busy.creating"));

try{
const payload = await storage.apiFetch("/api/register", {
method: "POST",
body: JSON.stringify({ name, email, password })
});

storage.saveSession(payload.user, payload.token);
await window.LampProducts.loadUserData();
event.target.reset();
window.LampUI.goToPage("library.html", { message: t("toasts.accountCreated"), type: "success" });
}catch(error){
try{
const user = createFallbackUser(name, email, password);
storage.saveSession(user, null);
event.target.reset();
window.LampUI.goToPage("library.html", { message: t("toasts.accountCreated"), type: "success" });
}catch(fallbackError){
window.LampUI.showToast(fallbackError.message || error.message || t("toasts.createFailed"), "error");
}
}finally{
window.LampUI.setButtonBusy(submitButton, false, t("busy.creating"));
}
}

async function handleLogin(event){
event.preventDefault();

const submitButton = document.getElementById("loginSubmit");
const email = normalizeEmail(document.getElementById("loginEmail")?.value || "");
const password = document.getElementById("loginPassword")?.value || "";

if(!validateEmail(email)){
window.LampUI.showToast(t("toasts.invalidEmail"), "error");
return;
}

if(!password){
window.LampUI.showToast(t("toasts.incorrectPassword"), "error");
return;
}

window.LampUI.setButtonBusy(submitButton, true, t("busy.checking"));

try{
const payload = await storage.apiFetch("/api/login", {
method: "POST",
body: JSON.stringify({ email, password })
});

storage.saveSession(payload.user, payload.token);
await window.LampProducts.loadUserData();
event.target.reset();
window.LampUI.goToPage("library.html", { message: t("toasts.welcomeBack", { name: payload.user.name }), type: "success" });
}catch(error){
try{
const user = loginFallback(email, password);
storage.saveSession(user, null);
event.target.reset();
window.LampUI.goToPage("library.html", { message: t("toasts.welcomeBack", { name: user.name }), type: "success" });
}catch(fallbackError){
window.LampUI.showToast(fallbackError.message || error.message || t("toasts.loginFailed"), "error");
}
}finally{
window.LampUI.setButtonBusy(submitButton, false, t("busy.checking"));
}
}

function logoutUser(){
storage.saveSession(null);
window.LampProducts.loadUserData().finally(() => {
window.LampProducts.syncUi();
window.LampUI.showToast(t("toasts.loggedOut"));
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

document.addEventListener("click", (event) => {
if(event.target.closest("[data-logout]")){
logoutUser();
}
});
}

return { handleRegister, handleLogin, logoutUser, bindForms };
})();
