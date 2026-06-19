async function bootstrap(){
window.LampStorage.state.language = window.LampI18n.getLanguage();
window.LampStorage.loadSession();
window.LampUI.renderSharedShell();
window.LampUI.exposeLegacyGlobals();

window.LampSearch.bindSearch();
window.LampAuth.bindForms();
window.LampProducts.bindProductActions();
window.LampI18n.applyTranslations();
window.LampProducts.syncUi();
window.LampUI.initScrollReveal();
window.LampStorage.flushFlashToast();

const catalogPromise = window.LampProducts.loadCatalogProducts();
const userDataPromise = window.LampProducts.loadUserData();
await Promise.allSettled([catalogPromise, userDataPromise]);
window.LampI18n.applyTranslations();
window.LampProducts.syncUi();
}

document.addEventListener("DOMContentLoaded", () => {
bootstrap().catch((error) => {
console.error("Bootstrap failed.", error);
window.LampUI?.showToast?.("Bootstrap failed. Check console for details.", "error");
});
});
