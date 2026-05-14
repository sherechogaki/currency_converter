const CONFIG = {
  API_KEY: 'f8901a525376ae8de1a967ab',
  EXCHANGE_URL: 'https://v6.exchangerate-api.com/v6',
  FRANKFURTER_URL: 'https://api.frankfurter.app',
  COINGECKO_URL: 'https://api.coingecko.com/api/v3/simple/price',
  FIAT_TTL: 60 * 60 * 1000,
  CRYPTO_TTL: 5 * 60 * 1000,
  MAX_HISTORY: 20,
  DEFAULT_FROM: 'USD',
  DEFAULT_TO: 'EUR',
  COMPARISON: ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY', 'TRY', 'BTC']
};

const CRYPTO_IDS = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple' };

const CURRENCIES = {
  USD:['ABD Doları','🇺🇸'],EUR:['Euro','🇪🇺'],GBP:['İngiliz Sterlini','🇬🇧'],JPY:['Japon Yeni','🇯🇵'],CHF:['İsviçre Frangı','🇨🇭'],CAD:['Kanada Doları','🇨🇦'],AUD:['Avustralya Doları','🇦🇺'],CNY:['Çin Yuanı','🇨🇳'],TRY:['Türk Lirası','🇹🇷'],NZD:['Yeni Zelanda Doları','🇳🇿'],SEK:['İsveç Kronu','🇸🇪'],NOK:['Norveç Kronu','🇳🇴'],DKK:['Danimarka Kronu','🇩🇰'],PLN:['Polonya Zlotisi','🇵🇱'],CZK:['Çek Korunası','🇨🇿'],HUF:['Macar Forinti','🇭🇺'],RON:['Rumen Leyi','🇷🇴'],BGN:['Bulgar Levası','🇧🇬'],ISK:['İzlanda Kronu','🇮🇸'],BRL:['Brezilya Reali','🇧🇷'],MXN:['Meksika Pesosu','🇲🇽'],INR:['Hindistan Rupisi','🇮🇳'],KRW:['Güney Kore Wonu','🇰🇷'],SGD:['Singapur Doları','🇸🇬'],HKD:['Hong Kong Doları','🇭🇰'],IDR:['Endonezya Rupisi','🇮🇩'],ILS:['İsrail Yeni Şekeli','🇮🇱'],MYR:['Malezya Ringgiti','🇲🇾'],PHP:['Filipin Pesosu','🇵🇭'],THB:['Tayland Bahtı','🇹🇭'],ZAR:['Güney Afrika Randı','🇿🇦'],AED:['BAE Dirhemi','🇦🇪'],SAR:['Suudi Arabistan Riyali','🇸🇦'],BTC:['Bitcoin','₿'],ETH:['Ethereum','◆'],SOL:['Solana','◎'],XRP:['Ripple','✕']
};

const LOCALE = 'tr-TR';

const el = {};
const state = {
  ratesCache: {}, cryptoCache: null, history: [], favourites: [], alerts: [],
  currentRate: null, comparisonRows: [], sort: { column: 'code', direction: 1 }, reverseMode: false, deferredPrompt: null
};

function $(id) { return document.getElementById(id); }
function storageGet(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function storageSet(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function debounce(fn, wait = 300) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; }
function isCrypto(code) { return Object.prototype.hasOwnProperty.call(CRYPTO_IDS, code); }
function formatNumber(value, code) { return Number(value).toLocaleString(LOCALE, { maximumFractionDigits: isCrypto(code) ? 8 : 2, minimumFractionDigits: isCrypto(code) ? 2 : 2 }); }
function formatRate(value) { return Number(value).toLocaleString(LOCALE, { maximumSignificantDigits: 8 }); }

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRates(base = 'USD') {
  const cached = state.ratesCache[base];
  if (cached && Date.now() - cached.timestamp < CONFIG.FIAT_TTL) return cached;
  if (CONFIG.API_KEY) {
    try {
      const data = await fetchJson(`${CONFIG.EXCHANGE_URL}/${CONFIG.API_KEY}/latest/${base}`);
      if (data.result !== 'success') throw new Error(data['error-type'] || 'ExchangeRate-API başarısız oldu');
      return cacheRates(base, data.conversion_rates, data.time_last_update_utc, 'ExchangeRate-API');
    } catch (error) {
      showBanner('Birincil kur sağlayıcısı başarısız oldu. Uygun olduğunda yedek kurlar kullanılıyor.');
    }
  }
  try {
    const data = await fetchJson(`${CONFIG.FRANKFURTER_URL}/latest?from=${base}`);
    return cacheRates(base, { ...data.rates, [base]: 1 }, data.date, 'Frankfurter');
  } catch (error) {
    const stale = storageGet('fxc_last_rates', null);
    if (stale && stale.base === base) {
      showBanner('Ağ kullanılamıyor. Önbelleğe alınan kurlar gösteriliyor.');
      return cacheRates(base, stale.rates, stale.updated, 'Önbellek');
    }
    throw new Error('Kurlar kullanılamıyor. Bağlantınızı kontrol edip tekrar deneyin.');
  }
}

function cacheRates(base, rates, updated, provider) {
  const item = { rates, timestamp: Date.now(), updated, provider };
  state.ratesCache[base] = item;
  storageSet('fxc_last_rates', { base, rates, updated, timestamp: item.timestamp });
  return item;
}

async function fetchCryptoRates() {
  if (state.cryptoCache && Date.now() - state.cryptoCache.timestamp < CONFIG.CRYPTO_TTL) return state.cryptoCache.rates;
  try {
    const data = await fetchJson(`${CONFIG.COINGECKO_URL}?ids=${Object.values(CRYPTO_IDS).join(',')}&vs_currencies=usd`);
    const usdPerCoin = { BTC: data.bitcoin.usd, ETH: data.ethereum.usd, SOL: data.solana.usd, XRP: data.ripple.usd };
    const rates = Object.fromEntries(Object.entries(usdPerCoin).map(([code, usd]) => [code, 1 / usd]));
    state.cryptoCache = { rates, usdPerCoin, timestamp: Date.now() };
    return rates;
  } catch (error) {
    showBanner('Kripto kurları kullanılamıyor. Resmi para dönüşümü çalışmaya devam eder.');
    return {};
  }
}

async function ensureUsdRates() {
  const fiat = await fetchRates('USD');
  const crypto = await fetchCryptoRates();
  fiat.rates = { ...fiat.rates, ...crypto, USD: 1 };
  state.ratesCache.USD = fiat;
  return fiat;
}

async function getRate(from, to) {
  const cache = await ensureUsdRates();
  const fromRate = cache.rates[from];
  const toRate = cache.rates[to];
  if (!fromRate || !toRate) throw new Error('Bu para birimi mevcut sağlayıcıda kullanılamıyor.');
  return { rate: toRate / fromRate, updated: cache.updated, provider: cache.provider };
}

function validate(amount, from, to, fee) {
  if (amount === '') return 'Lütfen bir tutar girin.';
  const n = Number(amount);
  if (Number.isNaN(n)) return 'Lütfen geçerli bir sayı girin.';
  if (n <= 0) return 'Tutar sıfırdan büyük olmalıdır.';
  if (n > 1000000000) return 'Tutar dönüştürmek için çok büyük.';
  if (from === to) return 'Lütfen iki farklı para birimi seçin.';
  if (fee < 0 || fee > 20) return 'Ücret %0 ile %20 arasında olmalıdır.';
  return '';
}

async function convert({ skipHistory = false } = {}) {
  const amount = el.amountInput.value;
  const from = el.fromCurrency.value;
  const to = el.toCurrency.value;
  const fee = Number(el.feeInput.value || 0);
  const error = validate(amount, from, to, fee);
  if (error) return showError(error);
  setLoading(true);
  try {
    const { rate, updated, provider } = await getRate(from, to);
    const numeric = Number(amount);
    const result = numeric * rate;
    const afterFee = result * (1 - fee / 100);
    state.currentRate = rate;
    el.resultInput.value = trimNumber(result, to);
    el.rateLabel.textContent = `1 ${from} = ${formatRate(rate)} ${to}`;
    el.feeSummary.innerHTML = fee > 0 ? `Orta piyasa: ${formatNumber(result, to)} ${to}<br>%${fee} ücret sonrası: ${formatNumber(afterFee, to)} ${to}<br>Ücret maliyeti: yaklaşık ${formatNumber(result - afterFee, to)} ${to}` : `${formatNumber(numeric, from)} ${from} = ${formatNumber(result, to)} ${to}`;
    el.lastUpdated.textContent = `Kurlar güncellendi: ${updated || new Date().toLocaleString(LOCALE)} · ${provider}`;
    el.resultBox.classList.remove('updated'); void el.resultBox.offsetWidth; el.resultBox.classList.add('updated');
    hideError(); updateUrl(); updateFavouriteButton(); await renderComparisonTable(numeric, from); checkAlerts(rate, from, to);
    if (!skipHistory) appendHistory({ amount: numeric, from, to, result, rate, feePercent: fee, timestamp: new Date().toISOString() });
  } catch (error) {
    showError(error.message || 'Bir şeyler ters gitti. Lütfen tekrar deneyin.');
  } finally {
    setLoading(false);
  }
}

function trimNumber(value, code) { return Number(value.toFixed(isCrypto(code) ? 8 : 4)); }
function reverseConvert() { if (!state.reverseMode || !state.currentRate) return; const wanted = Number(el.resultInput.value); if (wanted > 0) el.amountInput.value = trimNumber(wanted / state.currentRate, el.fromCurrency.value); }
function setLoading(isLoading) { document.querySelectorAll('button, select').forEach(node => { if (node.id !== 'themeToggle') node.disabled = isLoading; }); el.convertSpinner.classList.toggle('d-none', !isLoading); el.convertText.textContent = isLoading ? 'Dönüştürülüyor...' : 'Dönüştür'; }
function showError(message) { el.errorBox.textContent = message; el.errorBox.classList.remove('d-none'); setTimeout(hideError, 5000); }
function hideError() { el.errorBox.classList.add('d-none'); }
function showBanner(message) { el.alertBanner.textContent = message; el.alertBanner.classList.remove('d-none'); }
function showToast(message) { el.toastBody.textContent = message; bootstrap.Toast.getOrCreateInstance(el.appToast).show(); }

function populateDropdowns() {
  const fiat = Object.keys(CURRENCIES).filter(code => !isCrypto(code)).sort();
  const codes = [...fiat, 'BTC', 'ETH', 'SOL', 'XRP'];
  const html = codes.map(code => `<option value="${code}">${code} - ${CURRENCIES[code][0]}</option>`).join('');
  [el.fromCurrency, el.toCurrency, el.alertFrom, el.alertTo].forEach(select => select.innerHTML = html);
  el.fromCurrency.value = CONFIG.DEFAULT_FROM; el.toCurrency.value = CONFIG.DEFAULT_TO; el.alertFrom.value = 'USD'; el.alertTo.value = 'EUR';
}

async function renderComparisonTable(amount, from) {
  const rows = [];
  for (const code of CONFIG.COMPARISON) {
    if (code === from) continue;
    try { const { rate } = await getRate(from, code); rows.push({ code, name: CURRENCIES[code][0], flag: CURRENCIES[code][1], amount: amount * rate }); } catch {}
  }
  state.comparisonRows = rows; drawComparisonRows();
}
function drawComparisonRows() {
  const q = el.comparisonSearch.value.toLowerCase();
  const rows = [...state.comparisonRows].filter(r => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)).sort((a,b) => a[state.sort.column] > b[state.sort.column] ? state.sort.direction : -state.sort.direction);
  el.comparisonBody.innerHTML = rows.length ? rows.map(r => `<tr><td>${r.flag}</td><td>${r.code}</td><td>${r.name}</td><td class="text-end">${formatNumber(r.amount, r.code)}</td></tr>`).join('') : '<tr><td colspan="4" class="text-center muted">Eşleşen para birimi yok.</td></tr>';
}

function updateUrl() { const p = new URLSearchParams({ amount: el.amountInput.value, from: el.fromCurrency.value, to: el.toCurrency.value, fee: el.feeInput.value || 0 }); history.replaceState(null, '', `?${p}`); }
function readUrlParams() { const p = new URLSearchParams(location.search); if (p.has('amount')) el.amountInput.value = p.get('amount'); if (p.has('from')) el.fromCurrency.value = p.get('from'); if (p.has('to')) el.toCurrency.value = p.get('to'); if (p.has('fee')) el.feeInput.value = p.get('fee'); }
async function shareConversion() { const url = location.href; try { await navigator.clipboard.writeText(url); showToast('Bağlantı kopyalandı!'); } catch { prompt('Bu bağlantıyı kopyalayın:', url); } }
function swapCurrencies() { [el.fromCurrency.value, el.toCurrency.value] = [el.toCurrency.value, el.fromCurrency.value]; el.swapBtn.classList.toggle('rotating'); if (el.amountInput.value) convert(); }
function setShortcut(code) { el.fromCurrency.value = code; if (el.amountInput.value) convert(); }

function updateFavouriteButton() { const hit = state.favourites.some(p => p.from === el.fromCurrency.value && p.to === el.toCurrency.value); el.favouriteBtn.textContent = hit ? '★' : '☆'; el.favouriteBtn.setAttribute('aria-label', hit ? 'Favorilerden kaldır' : 'Favorilere ekle'); }
function toggleFavourite() { const pair = { from: el.fromCurrency.value, to: el.toCurrency.value }; const idx = state.favourites.findIndex(p => p.from === pair.from && p.to === pair.to); if (idx >= 0) state.favourites.splice(idx, 1); else state.favourites.push(pair); storageSet('fxc_favourites', state.favourites); renderFavourites(); updateFavouriteButton(); }
function renderFavourites() { el.favouritesList.innerHTML = state.favourites.map(p => `<button class="badge text-bg-primary favourite-pill border-0" data-fav="${p.from}-${p.to}">${p.from} → ${p.to}</button>`).join(''); }
function appendHistory(entry) { state.history = [entry, ...state.history].slice(0, CONFIG.MAX_HISTORY); storageSet('fxc_history', state.history); renderHistory(); }
function renderHistory() { el.historyList.innerHTML = state.history.length ? state.history.map((h,i) => `<button class="stack-item history-entry" data-history="${i}"><span>${formatNumber(h.amount,h.from)} ${h.from} → ${formatNumber(h.result,h.to)} ${h.to}</span><small>${new Date(h.timestamp).toLocaleString(LOCALE)}</small></button>`).join('') : '<p class="muted mb-0">Henüz dönüşüm yok.</p>'; }
function restoreHistory(i) { const h = state.history[i]; if (!h) return; el.amountInput.value = h.amount; el.fromCurrency.value = h.from; el.toCurrency.value = h.to; el.feeInput.value = h.feePercent; convert({ skipHistory: true }); }
function clearHistory() { state.history = []; storageSet('fxc_history', state.history); renderHistory(); }

function renderAlerts() { el.alertsList.innerHTML = state.alerts.length ? state.alerts.map((a,i) => `<div class="stack-item"><span>${a.from}/${a.to} ${a.direction === 'above' ? 'üstüne çıkınca' : 'altına inince'} ${a.targetRate}${a.fired ? ' · tetiklendi' : ''}</span><button class="btn btn-sm btn-outline-danger" data-alert-remove="${i}">Kaldır</button></div>`).join('') : '<p class="muted mb-0">Aktif uyarı yok.</p>'; }
async function addAlert(event) { event.preventDefault(); const target = Number(el.alertTarget.value); if (target <= 0) return showError('Hedef kur sıfırdan büyük olmalıdır.'); if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); state.alerts.push({ from: el.alertFrom.value, to: el.alertTo.value, targetRate: target, direction: el.alertDirection.value, createdAt: new Date().toISOString(), fired: false }); storageSet('fxc_alerts', state.alerts); el.alertTarget.value = ''; renderAlerts(); }
function checkAlerts(rate, from, to) { let changed = false; state.alerts.forEach(alert => { if (alert.fired || alert.from !== from || alert.to !== to) return; const hit = alert.direction === 'above' ? rate >= alert.targetRate : rate <= alert.targetRate; if (hit) { alert.fired = true; changed = true; fireNotification(alert, rate); } }); if (changed) { storageSet('fxc_alerts', state.alerts); renderAlerts(); } }
function fireNotification(alert, rate) { const msg = `${alert.from}/${alert.to} kuru ${formatRate(rate)}; hedef ${alert.direction === 'above' ? 'üstünde' : 'altında'}: ${alert.targetRate}.`; if ('Notification' in window && Notification.permission === 'granted') new Notification('FXConvert kur uyarısı', { body: msg }); else showBanner(msg); }

function toggleDarkMode() { const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('fxc_theme', dark ? 'dark' : 'light'); el.themeToggle.textContent = dark ? '☀' : '☾'; }
function toggleFeeRow() { const open = el.feeRow.classList.toggle('open'); el.feeRow.setAttribute('aria-hidden', String(!open)); el.feeToggle.textContent = open ? 'Banka / kart ücretini gizle' : 'Banka / kart ücretini göster'; }
function registerServiceWorker() { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {}); window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.deferredPrompt = e; el.installBanner.className = 'install-banner alert alert-primary'; el.installBanner.innerHTML = '<button id="installBtn" class="btn btn-sm btn-primary me-2">Uygulamayı Yükle</button>FXConvert uygulamasını çevrimdışı erişim için yükleyin.'; }); }

function attachEvents() {
  const auto = debounce(() => el.amountInput.value && convert(), 300);
  el.convertBtn.addEventListener('click', () => convert()); el.swapBtn.addEventListener('click', swapCurrencies); el.themeToggle.addEventListener('click', toggleDarkMode); el.feeToggle.addEventListener('click', toggleFeeRow); el.favouriteBtn.addEventListener('click', toggleFavourite); el.shareBtn.addEventListener('click', shareConversion);
  [el.amountInput, el.fromCurrency, el.toCurrency, el.feeInput].forEach(node => node.addEventListener('input', auto));
  el.resultInput.addEventListener('input', debounce(reverseConvert, 300)); el.reverseToggle.addEventListener('click', () => { state.reverseMode = !state.reverseMode; el.resultInput.readOnly = !state.reverseMode; el.reverseToggle.textContent = state.reverseMode ? 'Tutar alanını kullan' : 'Sonuç alanına yaz'; });
  document.querySelectorAll('[data-shortcut]').forEach(btn => btn.addEventListener('click', () => setShortcut(btn.dataset.shortcut)));
  document.querySelectorAll('.table-sort').forEach(btn => btn.addEventListener('click', () => { state.sort.direction = state.sort.column === btn.dataset.sort ? -state.sort.direction : 1; state.sort.column = btn.dataset.sort; drawComparisonRows(); }));
  el.comparisonSearch.addEventListener('input', drawComparisonRows); el.alertForm.addEventListener('submit', addAlert); el.clearHistoryBtn.addEventListener('click', clearHistory);
  document.addEventListener('click', event => { const fav = event.target.closest('[data-fav]'); if (fav) { const [from,to] = fav.dataset.fav.split('-'); el.fromCurrency.value = from; el.toCurrency.value = to; if (el.amountInput.value) convert(); } const h = event.target.closest('[data-history]'); if (h) restoreHistory(Number(h.dataset.history)); const r = event.target.closest('[data-alert-remove]'); if (r) { state.alerts.splice(Number(r.dataset.alertRemove), 1); storageSet('fxc_alerts', state.alerts); renderAlerts(); } if (event.target.id === 'installBtn' && state.deferredPrompt) state.deferredPrompt.prompt(); });
  document.addEventListener('keydown', event => { if (event.target.matches('input,select') && event.key.length === 1) return; if (event.key === 'Enter') convert(); if (event.key.toLowerCase() === 's') swapCurrencies(); if (event.key.toLowerCase() === 'd') toggleDarkMode(); if (event.key.toLowerCase() === 'f') toggleFeeRow(); if (event.key === 'Escape') { hideError(); el.alertBanner.classList.add('d-none'); } });
}

async function init() {
  ['themeToggle','installBanner','alertBanner','errorBox','amountInput','fromCurrency','toCurrency','swapBtn','feeToggle','feeRow','feeInput','convertBtn','convertSpinner','convertText','resultBox','rateLabel','resultInput','feeSummary','reverseToggle','lastUpdated','shareBtn','favouriteBtn','favouritesList','comparisonSearch','comparisonBody','alertForm','alertFrom','alertTo','alertTarget','alertDirection','alertsList','clearHistoryBtn','historyList','appToast','toastBody'].forEach(id => el[id] = $(id));
  state.history = storageGet('fxc_history', []); state.favourites = storageGet('fxc_favourites', []); state.alerts = storageGet('fxc_alerts', []);
  populateDropdowns(); readUrlParams(); attachEvents(); renderHistory(); renderFavourites(); renderAlerts(); updateFavouriteButton(); registerServiceWorker();
  el.themeToggle.textContent = document.documentElement.dataset.theme === 'dark' ? '☀' : '☾';
  try { await ensureUsdRates(); if (el.amountInput.value) convert(); } catch (error) { showError(error.message); }
}

document.addEventListener('DOMContentLoaded', init);
