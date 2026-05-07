async function bootstrap(){
window.LampStorage.state.language = window.LampI18n.getLanguage();
window.LampStorage.loadSession();
window.LampUI.renderSharedShell();
window.LampUI.exposeLegacyGlobals();

await window.LampProducts.loadCatalogProducts();
await window.LampProducts.loadUserData();

window.LampSearch.bindSearch();
window.LampAuth.bindForms();
window.LampProducts.bindProductActions();
window.LampI18n.applyTranslations();
window.LampProducts.syncUi();
window.LampUI.initScrollReveal();
window.LampStorage.flushFlashToast();
}

document.addEventListener("DOMContentLoaded", () => {
bootstrap().catch((error) => {
console.error("Bootstrap failed.", error);
window.LampUI?.showToast?.("Bootstrap failed. Check console for details.", "error");
});
});
