window.LampSearch = (() => {
const { state, escapeHtml } = window.LampStorage;
const t = (...args) => window.LampI18n.t(...args);

function normalizeSearchValue(value){
return String(value || "")
.toLowerCase()
.normalize("NFD")
.replace(/[\u0300-\u036f]/g, "")
.replace(/[^a-z0-9\s]/g, " ")
.replace(/\s+/g, " ")
.trim();
}

function isSubsequenceMatch(query, value){
if(!query || !value) return false;

let queryIndex = 0;
for(let valueIndex = 0; valueIndex < value.length; valueIndex += 1){
if(value[valueIndex] === query[queryIndex]) queryIndex += 1;
if(queryIndex === query.length) return true;
}

return false;
}

function getSearchScoreForValues(values, query, tokens, weights){
let score = 0;

values.forEach((value) => {
const normalizedValue = normalizeSearchValue(value);
if(!normalizedValue) return;

if(normalizedValue === query) score = Math.max(score, weights.exact);
if(normalizedValue.startsWith(query)) score = Math.max(score, weights.startsWith);
if(normalizedValue.includes(query)) score = Math.max(score, weights.includes);

const tokenMatches = tokens.filter((token) => normalizedValue.includes(token)).length;
if(tokenMatches) score = Math.max(score, weights.includes + tokenMatches * weights.tokenBonus);
if(query.length >= 3 && isSubsequenceMatch(query, normalizedValue)) score = Math.max(score, weights.subsequence);
});

return score;
}

function getProductSearchScore(productId, rawQuery){
const product = window.LAMP_I18N.products[productId];
const query = normalizeSearchValue(rawQuery);
if(!product || !query) return 0;

const tokens = query.split(" ").filter((token) => token.length > 1);
const names = [product.en?.name, product.pl?.name].filter(Boolean);
const tags = [product.en?.tag, product.pl?.tag].filter(Boolean);
const descriptions = [product.en?.description, product.pl?.description].filter(Boolean);
const meta = [...(product.en?.meta || []), ...(product.pl?.meta || [])];

return Math.max(
getSearchScoreForValues(names, query, tokens, { exact: 260, startsWith: 220, includes: 180, subsequence: 118, tokenBonus: 16 }),
getSearchScoreForValues(tags, query, tokens, { exact: 180, startsWith: 150, includes: 122, subsequence: 86, tokenBonus: 12 }),
getSearchScoreForValues(descriptions, query, tokens, { exact: 122, startsWith: 106, includes: 92, subsequence: 66, tokenBonus: 8 }),
getSearchScoreForValues(meta, query, tokens, { exact: 132, startsWith: 112, includes: 96, subsequence: 72, tokenBonus: 10 })
);
}

function getSearchMatches(rawQuery){
return Object.keys(window.LAMP_I18N.products || {})
.map((productId) => ({
product: window.LampProducts.getCatalogProduct(productId),
score: getProductSearchScore(productId, rawQuery)
}))
.filter((entry) => entry.product && entry.score > 0)
.sort((left, right) => right.score - left.score || left.product.name.localeCompare(right.product.name, window.LampI18n.getLocale()));
}

function openSearchModal(){
const searchInput = document.getElementById("searchInput");
window.LampUI.openModal("searchModal");

if(searchInput){
searchInput.value = state.searchQuery;
window.setTimeout(() => {
searchInput.focus();
searchInput.select();
}, 60);
}

renderSearchResults();
}

function renderSearchResults(){
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const searchResultsMeta = document.getElementById("searchResultsMeta");
if(!searchInput || !searchResults || !searchResultsMeta) return;

const rawQuery = searchInput.value;
const normalizedQuery = normalizeSearchValue(rawQuery);
state.searchQuery = rawQuery;

if(!normalizedQuery){
searchResultsMeta.textContent = t("search.initialState");
searchResults.innerHTML = `<div class="search-empty-state"><strong>${escapeHtml(t("search.initialTitle"))}</strong><p>${escapeHtml(t("search.initialText"))}</p></div>`;
return;
}

const matches = getSearchMatches(rawQuery);
if(!matches.length){
searchResultsMeta.textContent = t("search.noResultsMeta", { query: rawQuery });
searchResults.innerHTML = `<div class="search-empty-state"><strong>${escapeHtml(t("search.noResultsTitle"))}</strong><p>${escapeHtml(t("search.noResultsText", { query: rawQuery }))}</p></div>`;
return;
}

searchResultsMeta.textContent = t("search.resultsCount", { count: matches.length });
searchResults.innerHTML = matches.map(({ product }) => {
const productState = window.LampProducts.getProductState(product.id);
const metaList = product.meta.slice(0, 3).map((item) => `<span>${escapeHtml(item)}</span>`).join("");

return `
<article class="search-result-card" role="listitem">
<img class="search-result-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.imageAlt)}">
<div class="search-result-copy">
<div class="search-result-topline"><div><h4>${escapeHtml(product.name)}</h4><p class="search-result-tag">${escapeHtml(product.tag)}</p></div><strong class="search-result-price">${escapeHtml(product.price)}</strong></div>
<p class="search-result-description">${escapeHtml(product.description)}</p>
<div class="search-result-meta-list">${metaList}</div>
<div class="product-actions search-result-actions">
<button class="product-action secondary" type="button" data-search-add-library data-product-id="${escapeHtml(product.id)}"${productState.saved ? " disabled" : ""}>${escapeHtml(productState.saved ? t("buttons.savedInLibrary") : t("buttons.addToLibrary"))}</button>
<button class="product-action secondary" type="button" data-search-add-cart data-product-id="${escapeHtml(product.id)}">${escapeHtml(t("cart.add"))}</button>
<button class="product-action" type="button" data-search-buy-product data-product-id="${escapeHtml(product.id)}"${productState.purchased ? " disabled" : ""}>${escapeHtml(productState.purchased ? t("buttons.purchased") : t("buttons.buyNow"))}</button>
</div>
</div>
</article>
`;
}).join("");
}

function bindSearch(){
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

if(searchInput){
searchInput.addEventListener("input", renderSearchResults);
}

if(searchResults){
searchResults.addEventListener("click", (event) => {
const addButton = event.target.closest("[data-search-add-library]");
const cartButton = event.target.closest("[data-search-add-cart]");
const buyButton = event.target.closest("[data-search-buy-product]");

if(addButton){
window.LampProducts.addToLibrary(window.LampProducts.buildProductPayload(addButton.dataset.productId || ""));
renderSearchResults();
}

if(cartButton){
window.LampProducts.addToCart(window.LampProducts.buildProductPayload(cartButton.dataset.productId || ""));
}

if(buyButton){
window.LampProducts.buyProduct(window.LampProducts.buildProductPayload(buyButton.dataset.productId || ""), "catalog");
}
});
}
}

return { normalizeSearchValue, getSearchMatches, openSearchModal, renderSearchResults, bindSearch };
})();
