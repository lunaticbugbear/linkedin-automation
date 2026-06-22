import { useEffect, useMemo, useRef, useState } from 'react';
import { shopApi } from './lib/api';
import { t as tDict, normalizeLang, formatMoney, formatMoneyFinal } from './i18n';

function formatIdr(v) {
  return Number(v || 0).toLocaleString('id-ID');
}

function formatOrderCode(orderId, shortName) {
  const safe = String(shortName || 'INV').toUpperCase();
  return `${safe}${String(Number(orderId) || 0).padStart(3, '0')}`;
}

function formatCountdown(seconds) {
  const safe = Math.max(0, seconds);
  const m = String(Math.floor(safe / 60)).padStart(2, '0');
  const s = String(safe % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function formatRelative(iso, lang = 'id') {
  if (!iso) return '-';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return String(iso);
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return tDict(lang, 'rel_just_now');
  const min = Math.floor(sec / 60);
  if (min < 60) return tDict(lang, 'rel_minutes', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return tDict(lang, 'rel_hours', { n: hr });
  const d = Math.floor(hr / 24);
  if (d < 7) return tDict(lang, 'rel_days', { n: d });
  return new Date(t).toISOString().slice(0, 10);
}

function isLikelyUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function isLikely2faToken(value) {
  const source = String(value || '').trim();
  if (!source) return false;
  if (/\b2fa\b/i.test(source)) return true;
  return /^[A-Z0-9-]{6,}$/i.test(source);
}

function getUserTier(totalSpent) {
  const spent = Number(totalSpent || 0);
  if (spent >= 1_000_000) return { name: 'VIP', color: '#fbbf24' };
  if (spent >= 500_000) return { name: 'Gold', color: '#f59e0b' };
  if (spent >= 100_000) return { name: 'Silver', color: '#94a3b8' };
  if (spent > 0) return { name: 'Bronze', color: '#a16207' };
  return { name: 'New', color: '#60a5fa' };
}

function tgHaptic(type = 'light') {
  try {
    const tg = window.Telegram?.WebApp;
    if (!tg?.HapticFeedback) return;
    if (type === 'success' || type === 'warning' || type === 'error') {
      tg.HapticFeedback.notificationOccurred(type);
    } else if (type === 'change') {
      tg.HapticFeedback.selectionChanged();
    } else {
      tg.HapticFeedback.impactOccurred(type);
    }
  } catch {
    // Telegram WebApp API not available, silent fallback.
  }
}

function Icon({ name }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'sparkle': return <svg {...common}><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z" /><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" /></svg>;
    case 'cart': return <svg {...common}><circle cx="9" cy="20" r="1" /><circle cx="17" cy="20" r="1" /><path d="M3 4h2l2.2 10.5a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 7H7" /></svg>;
    case 'clock': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>;
    case 'shield': return <svg {...common}><path d="M12 3l7 3v5c0 5-3.3 8-7 10-3.7-2-7-5-7-10V6z" /></svg>;
    case 'store': return <svg {...common}><path d="M3 9l2-5h14l2 5" /><path d="M4 9h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M9 13h6" /></svg>;
    case 'history': return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></svg>;
    case 'user': return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></svg>;
    case 'search': return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case 'check': return <svg {...common}><path d="M5 12l5 5 9-11" /></svg>;
    case 'plus': return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case 'minus': return <svg {...common}><path d="M5 12h14" /></svg>;
    case 'arrow-right': return <svg {...common}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>;
    case 'copy': return <svg {...common}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>;
    case 'open': return <svg {...common}><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>;
    case 'logo': return <svg {...common}><path d="M12 3l8 4-8 4-8-4z" /><path d="M4 11l8 4 8-4" /><path d="M4 15l8 4 8-4" /></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [publicGate, setPublicGate] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState('');
  const [activeTab, setActiveTab] = useState('store');
  const [products, setProducts] = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [cart, setCart] = useState({});
  const [checkout, setCheckout] = useState(null);
  const [checkoutState, setCheckoutState] = useState('idle');
  const [successOrderId, setSuccessOrderId] = useState(null);
  const [deliveryData, setDeliveryData] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const [deliveryLoadingId, setDeliveryLoadingId] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [copiedItemKey, setCopiedItemKey] = useState(null);
  const [branding, setBranding] = useState({
    name: '',
    shortName: 'INV',
    tagline: '',
    supportTelegramUrl: '',
    supportWhatsappUrl: '',
    payments: { crypto: true, qris: false },
    usdRate: 16000,
    intlMultiplier: 1.5,
  });
  const [lang, setLang] = useState('en');

  const tgRef = useRef(null);

  const tt = (key, vars) => tDict(lang, key, vars);
  const money = (idr) => formatMoney(idr, lang, branding.usdRate, branding.intlMultiplier);
  const moneyFinal = (idr) => formatMoneyFinal(idr, lang, branding.usdRate);

  const cartItems = useMemo(() => {
    return products
      .map((p) => ({ ...p, qty: cart[p.id] || 0 }))
      .filter((item) => item.qty > 0);
  }, [products, cart]);

  const subtotal = useMemo(() => cartItems.reduce((sum, item) => sum + Number(item.price) * item.qty, 0), [cartItems]);
  const cartCount = useMemo(() => cartItems.reduce((sum, item) => sum + item.qty, 0), [cartItems]);

  const categories = useMemo(() => {
    const set = new Set();
    for (const p of products) {
      if (p.category) set.add(p.category);
    }
    return ['all', ...Array.from(set).sort()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== 'all' && (p.category || 'Umum') !== categoryFilter) return false;
      if (!q) return true;
      const hay = `${p.name} ${p.description || ''} ${p.category || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [products, searchQuery, categoryFilter]);

  const productsPerPage = 6;
  const totalProductPages = useMemo(
    () => Math.max(1, Math.ceil(filteredProducts.length / productsPerPage)),
    [filteredProducts.length],
  );
  const pagedProducts = useMemo(() => {
    const start = (productPage - 1) * productsPerPage;
    return filteredProducts.slice(start, start + productsPerPage);
  }, [filteredProducts, productPage]);

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'all') return orderHistory.filter((o) => o.status !== 'cancelled');
    if (historyFilter === 'paid') return orderHistory.filter((o) => o.status === 'paid' || o.status === 'delivered');
    if (historyFilter === 'pending') return orderHistory.filter((o) => o.status === 'pending');
    return orderHistory.filter((o) => o.status === 'expired' || o.status === 'failed' || o.status === 'cancelled');
  }, [orderHistory, historyFilter]);

  const profileSummary = useMemo(() => {
    const paidStatuses = new Set(['paid', 'delivered']);
    const paidOrders = orderHistory.filter((o) => paidStatuses.has(o.status));
    const totalSpent = paidOrders.reduce((sum, o) => sum + Number(o.price || 0), 0);
    return {
      totalOrders: orderHistory.length,
      paidOrders: paidOrders.length,
      totalSpent,
      tier: getUserTier(totalSpent),
    };
  }, [orderHistory]);

  const telegramEntryUrl = useMemo(() => {
    // Tidak ada hardcode lagi: semua dari branding (set via admin panel).
    // Prioritas: support Telegram → support WhatsApp → kosongkan.
    const tg = String(branding.supportTelegramUrl || '').trim();
    if (tg) return tg;
    const wa = String(branding.supportWhatsappUrl || '').trim();
    if (wa) return wa;
    return '';
  }, [branding.supportTelegramUrl, branding.supportWhatsappUrl]);

  const supportUrl = telegramEntryUrl;

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        const tg = window.Telegram?.WebApp;
        tgRef.current = tg;
        tg?.ready();
        tg?.expand();
        // Bahasa awal dari hint Telegram; nanti di-override dari auth.user.lang (pilihan bot).
        try {
          const tgLang = tg?.initDataUnsafe?.user?.language_code;
          if (tgLang) setLang(normalizeLang(tgLang));
        } catch { /* ignore */ }
        // Pakai theme color Telegram untuk header/background biar nyatu sama Telegram user.
        try {
          tg?.setHeaderColor?.('secondary_bg_color');
          tg?.setBackgroundColor?.('#061124');
        } catch {
          // Some TG versions don't support these calls; ignore.
        }

        // Fetch branding dulu (public endpoint) supaya UI tidak flicker dari placeholder.
        try {
          const brand = await shopApi.branding();
          if (mounted && brand) {
            setBranding(brand);
            if (brand.name && typeof document !== 'undefined') {
              document.title = brand.name;
            }
          }
        } catch {
          // Fallback ke default state, jangan bikin app crash.
        }

        const initData = tg?.initData || '';
        if (!initData) {
          setPublicGate(true);
          setError('');
          return;
        }

        const auth = await shopApi.auth(initData);
        if (!mounted) return;

        setToken(auth.token);
        setUser(auth.user);
        if (auth.user?.lang) setLang(normalizeLang(auth.user.lang));

        const list = await shopApi.products();
        if (!mounted) return;
        setProducts(list);

        const history = await shopApi.orderHistory(auth.token, 30);
        if (!mounted) return;
        setOrderHistory(history);
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    bootstrap();
    return () => { mounted = false; };
  }, []);

  // Reset productPage saat search/filter berubah agar tidak stuck di page kosong.
  useEffect(() => {
    setProductPage(1);
  }, [searchQuery, categoryFilter]);

  useEffect(() => {
    if (productPage > totalProductPages) {
      setProductPage(totalProductPages);
    }
  }, [productPage, totalProductPages]);

  useEffect(() => {
    if (!successOrderId) return undefined;
    const id = setTimeout(() => setSuccessOrderId(null), 7000);
    return () => clearTimeout(id);
  }, [successOrderId]);

  // Sembunyikan pesan copied feedback setelah 1.5 detik.
  useEffect(() => {
    if (!copiedItemKey) return undefined;
    const id = setTimeout(() => setCopiedItemKey(null), 1500);
    return () => clearTimeout(id);
  }, [copiedItemKey]);

  async function syncProductsSilently() {
    if (!token) return;
    try {
      const latest = await shopApi.products();
      setProducts(latest);

      // Clamp cart quantities to the latest stock so UI never overstates availability.
      setCart((prev) => {
        const next = {};
        for (const p of latest) {
          const requested = Number(prev[p.id] || 0);
          if (requested <= 0) continue;
          const maxAllowed = Math.max(0, Math.min(Number(p.stock_count || 0), 10));
          if (maxAllowed > 0) {
            next[p.id] = Math.min(requested, maxAllowed);
          }
        }
        return next;
      });
    } catch {
      // Silent background sync.
    }
  }

  async function syncOrderStatus(orderId, silent = false) {
    if (!token || !orderId) return null;
    try {
      const status = await shopApi.orderStatus(token, orderId);
      setCheckoutState(status.status);

      if (status.status === 'paid' || status.status === 'delivered') {
        const history = await shopApi.orderHistory(token, 30);
        setOrderHistory(history);
        setStatusMessage(tt('msg_payment_confirmed'));
        setSuccessOrderId(orderId);
        setCart({});
        setCheckout(null);
        setCheckoutState('idle');
        setActiveTab('history');
        tgHaptic('success');
        try {
          const delivery = await shopApi.orderDelivery(token, orderId);
          setDeliveryData(delivery);
        } catch {
          // Delivery can be slightly delayed; user can open it from history list.
        }
      } else if (status.status === 'expired') {
        setStatusMessage(tt('msg_invoice_expired'));
        tgHaptic('warning');
      } else if (status.status === 'cancelled' || status.status === 'failed') {
        setStatusMessage(tt('msg_order_status_retry', { status: status.status.toUpperCase() }));
        tgHaptic('error');
      } else {
        setStatusMessage(tt('msg_status_latest', { status: status.status.toUpperCase() }));
      }

      return status;
    } catch (err) {
      if (!silent) setError(err.message);
      return null;
    }
  }

  useEffect(() => {
    if (!checkout?.expiresAt) return;
    const end = new Date(checkout.expiresAt).getTime();

    const timer = setInterval(() => {
      const diff = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff <= 0) {
        setCheckoutState('expired');
        setStatusMessage(tt('msg_timer_expired'));
        tgHaptic('warning');
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [checkout?.expiresAt]);

  useEffect(() => {
    if (!checkout?.orderId || !token) return;
    const interval = setInterval(async () => {
      const status = await syncOrderStatus(checkout.orderId, true);
      if (status && ['paid', 'delivered', 'expired', 'cancelled', 'failed'].includes(status.status)) {
        clearInterval(interval);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [checkout?.orderId, token]);

  useEffect(() => {
    if (!token) return undefined;

    const runSyncIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      syncProductsSilently();
    };

    const intervalMs = activeTab === 'store' ? 5000 : 10000;
    const timer = setInterval(runSyncIfVisible, intervalMs);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', runSyncIfVisible);
    }

    runSyncIfVisible();

    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', runSyncIfVisible);
      }
    };
  }, [token, activeTab]);

  // Telegram BackButton: kalau ada checkout aktif, BackButton kembalikan ke katalog.
  useEffect(() => {
    const tg = tgRef.current;
    if (!tg?.BackButton) return undefined;
    const handler = () => {
      if (checkout) {
        setCheckout(null);
        setCheckoutState('idle');
        setStatusMessage('');
        tgHaptic('light');
      } else if (deliveryData) {
        setDeliveryData(null);
      } else if (activeTab !== 'store') {
        setActiveTab('store');
      } else {
        tg.close?.();
      }
    };

    if (checkout || deliveryData || activeTab !== 'store') {
      tg.BackButton.show();
      tg.BackButton.onClick(handler);
    } else {
      tg.BackButton.hide();
    }

    return () => {
      try {
        tg.BackButton.offClick(handler);
      } catch {
        // ignore
      }
    };
  }, [checkout, deliveryData, activeTab]);

  function setQty(productId, nextQty, maxStock) {
    const safe = Math.max(0, Math.min(nextQty, Number(maxStock || 0), 10));
    if (safe !== Number(cart[productId] || 0)) tgHaptic('change');
    setCart((prev) => ({ ...prev, [productId]: safe }));
  }

  async function handleCheckout(provider) {
    if (!token) return;
    if (cartItems.length === 0) {
      setError(tt('err_select_product_first'));
      return;
    }
    if (cartItems.length !== 1) {
      setError(tt('err_single_item_only'));
      return;
    }

    setError('');
    const item = cartItems[0];

    try {
      const latest = await shopApi.products();
      setProducts(latest);
      const selected = latest.find((p) => Number(p.id) === Number(item.id));
      const latestStock = Number(selected?.stock_count || 0);
      if (!selected || latestStock <= 0) {
        setQty(item.id, 0, 0);
        setError('Stok produk sudah habis. Silakan pilih produk lain.');
        return;
      }
      if (item.qty > latestStock) {
        setQty(item.id, latestStock, latestStock);
        setError(`Stok terbaru hanya tersisa ${latestStock}. Jumlah checkout sudah disesuaikan.`);
        return;
      }

      tgHaptic('medium');
      const result = await shopApi.checkout(token, {
        productId: item.id,
        quantity: item.qty,
        provider,
      });

      setCheckout(result);
      setCheckoutState('pending');
      setSuccessOrderId(null);
      setDeliveryData(null);
      setSecondsLeft(Math.max(0, Math.floor((new Date(result.expiresAt).getTime() - Date.now()) / 1000)));
      setStatusMessage(tt('msg_awaiting_payment'));
    } catch (err) {
      setError(err.message);
      tgHaptic('error');
    }
  }

  async function openDelivery(orderId) {
    if (!token) return;
    setDeliveryLoadingId(orderId);
    setError('');
    try {
      const delivery = await shopApi.orderDelivery(token, orderId);
      setDeliveryData(delivery);
      tgHaptic('light');
    } catch (err) {
      setError(err.message);
      tgHaptic('error');
    } finally {
      setDeliveryLoadingId(null);
    }
  }

  async function copyToClipboard(text, key) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(text || ''));
      } else {
        // Fallback: use textarea trick for older browsers / WebView.
        const ta = document.createElement('textarea');
        ta.value = String(text || '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedItemKey(key);
      tgHaptic('success');
    } catch {
      tgHaptic('error');
    }
  }

  function renderDeliveryData(raw) {
    const source = String(raw || '').trim();
    const parts = source.split('|').map((x) => x.trim()).filter(Boolean);
    const isMailHint = (value) => /^(mail|email|link\s*akses\s*mail|akses\s*mail)$/i.test(String(value || '').trim());
    const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

    if (parts.length === 1 && isLikelyUrl(parts[0])) {
      return (
        <div className="dlv-row">
          <span className="dlv-label">Download</span>
          <a className="dlv-link" href={parts[0]} target="_blank" rel="noreferrer">
            <Icon name="open" /> Open Link
          </a>
        </div>
      );
    }

    if (parts.length === 2 && isLikelyUrl(parts[1])) {
      return (
        <>
          <div className="dlv-row">
            <span className="dlv-label">{isEmail(parts[0]) ? 'Email' : 'Username'}</span>
            <strong className="dlv-value">{parts[0]}</strong>
          </div>
          <div className="dlv-row">
            <span className="dlv-label">Mail Access</span>
            <a className="dlv-link" href={parts[1]} target="_blank" rel="noreferrer">
              <Icon name="open" /> Open Link
            </a>
          </div>
        </>
      );
    }

    if (parts.length >= 2) {
      const extras = parts.slice(2);
      const has2fa = extras.some((extra) => isLikely2faToken(extra));
      return (
        <>
          <div className="dlv-row">
            <span className="dlv-label">{isEmail(parts[0]) ? 'Email' : 'Username'}</span>
            <strong className="dlv-value">{parts[0]}</strong>
          </div>
          <div className="dlv-row">
            <span className="dlv-label">Password</span>
            <strong className="dlv-value mono">{parts[1]}</strong>
          </div>
          {extras.map((extra, idx) => {
            if (idx > 0 && isMailHint(extras[idx - 1]) && isLikelyUrl(extra)) {
              return null;
            }

            let label = 'Info';
            let content = <strong className="dlv-value">{extra}</strong>;

            if (isMailHint(extra) && isLikelyUrl(extras[idx + 1])) {
              label = 'Mail Access';
              content = (
                <a className="dlv-link" href={extras[idx + 1]} target="_blank" rel="noreferrer">
                  <Icon name="open" /> Open Link
                </a>
              );
            } else if (isLikelyUrl(extra)) {
              label = idx === 0 ? 'Mail Access' : 'Access Link';
              content = (
                <a className="dlv-link" href={extra} target="_blank" rel="noreferrer">
                  <Icon name="open" /> Open Link
                </a>
              );
            } else if (isLikely2faToken(extra)) {
              label = '2FA Code';
              content = <strong className="dlv-value mono">{extra}</strong>;
            }

            return (
              <div className="dlv-row" key={`${label}-${idx}`}>
                <span className="dlv-label">{label}</span>
                {content}
              </div>
            );
          })}
          {has2fa ? (
            <p className="dlv-note">
              💡 2FA: login seperti biasa, saat diminta OTP buka <strong>2fa.live</strong>, masukkan 2FA Code,
              lalu pakai 6 digit OTP yang muncul.
            </p>
          ) : null}
        </>
      );
    }
    return (
      <div className="dlv-row">
        <span className="dlv-label">Data</span>
        <strong className="dlv-value">{source}</strong>
      </div>
    );
  }

  if (loading) {
    return (
      <main className="mini-shell mini-shell-loading">
        <section className="lux-skeleton" role="status" aria-live="polite" aria-label="Loading store">
          <div className="lux-skeleton-brand">
            <div className="brand-mark">
              <span className="brand-dot" />
              <span className="brand-dot brand-dot-2" />
            </div>
            <div className="brand-lines">
              <span className="sk-line sk-line-sm" />
              <span className="sk-line sk-line-xs" />
            </div>
          </div>

          <div className="sk-hero">
            <span className="sk-pill" />
            <span className="sk-line sk-line-lg" />
            <span className="sk-line sk-line-md" />
          </div>

          <div className="sk-grid">
            {[0, 1, 2, 3].map((i) => (
              <div className="sk-card" key={i}>
                <span className="sk-thumb" />
                <span className="sk-line sk-line-md" />
                <span className="sk-line sk-line-sm" />
                <div className="sk-card-foot">
                  <span className="sk-line sk-line-price" />
                  <span className="sk-chip" />
                </div>
              </div>
            ))}
          </div>

          <div className="sk-bottom-nav">
            <span className="sk-nav-item" />
            <span className="sk-nav-item" />
            <span className="sk-nav-item" />
          </div>

          <span className="sr-only">{tt('loading_store')}</span>
        </section>
      </main>
    );
  }

  if (error && !user) {
    return <main className="mini-shell"><div className="error-box">{error}</div></main>;
  }

  if (publicGate) {
    return (
      <main className="mini-shell public-shell">
        <section className="public-gate" role="region" aria-label="Open Telegram">
          <p className="public-eyebrow">{branding.name ? branding.name.toUpperCase() : tt('gate_eyebrow')}</p>
          <h1>{tt('gate_title')}</h1>
          <p className="public-copy">
            {tt('gate_copy')}
          </p>
          <div className="public-actions">
            <a className="cta-telegram" href={telegramEntryUrl} target="_blank" rel="noreferrer">
              {tt('gate_open_telegram')}
            </a>
            <button className="outline-btn" onClick={() => window.location.reload()}>
              {tt('gate_retry')}
            </button>
          </div>
          <p className="public-note">
            {tt('gate_note')}
          </p>
        </section>
      </main>
    );
  }

  const statusLabel = {
    pending: tt('status_pending'),
    paid: tt('status_paid'),
    delivered: tt('status_delivered'),
    cancelled: tt('status_cancelled'),
    expired: tt('status_expired'),
    failed: tt('status_failed'),
  };

  return (
    <main className="mini-shell">
      {activeTab === 'store' && !checkout ? (
        <>
        <div className="brand-bar">
          <div className="brand-logo-sm">{(branding.shortName || 'L').slice(0, 1)}</div>
          <div className="brand-name-glitch" data-t={branding.name || 'Store'}>{branding.name || 'Store'}</div>
        </div>
        <section className="hero">
          <span className="hero-badge"><Icon name="sparkle" /> {tt('hero_verified_store')}</span>
          <h1 className="hero-title">
            {user?.first_name ? tt('hero_greeting_named', { name: user.first_name }) : tt('hero_greeting_anon')} <span className="hero-wave">👋</span>
          </h1>
          <p className="hero-sub">{tt('hero_sub')}</p>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-n">{branding.stats?.totalProducts ?? 0}</span>
              <span className="hero-stat-l">{tt('stat_products')}</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-n">{(branding.stats?.totalSales ?? 0).toLocaleString('id-ID')}</span>
              <span className="hero-stat-l">{tt('stat_transactions')}</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-n">{(branding.stats?.totalUsers ?? 0).toLocaleString('id-ID')}</span>
              <span className="hero-stat-l">{tt('stat_users')}</span>
            </div>
          </div>
        </section>
        </>
      ) : null}

      {activeTab === 'history' ? (
        <header className="page-header">
          <h2>{tt('page_history_title')}</h2>
          <p>{tt('page_history_sub')}</p>
        </header>
      ) : null}

      {activeTab === 'profile' ? (
        <header className="page-header">
          <h2>{tt('page_profile_title')}</h2>
          <p>{tt('page_profile_sub')}</p>
        </header>
      ) : null}

      {successOrderId ? (
        <div className="toast toast-success">
          <Icon name="check" />
          <span>{tt('toast_payment_success', { code: formatOrderCode(successOrderId, branding.shortName) })}</span>
        </div>
      ) : null}

      {error ? <div className="toast toast-error">{error}</div> : null}

      {activeTab === 'store' ? (
        <>
          {checkout ? (
            <section className="invoice-card">
              <header className="invoice-head">
                <div>
                  <span className="invoice-eyebrow">{tt('invoice_eyebrow')}</span>
                  <h2 className="invoice-id">{formatOrderCode(checkout.orderId, branding.shortName)}</h2>
                </div>
                <span className={`invoice-status invoice-status-${checkoutState}`}>
                  {statusLabel[checkoutState] || checkoutState.toUpperCase()}
                </span>
              </header>

              <div className="invoice-amount">
                <span className="invoice-amount-label">{tt('label_total')}</span>
                <strong className="invoice-amount-value">{moneyFinal(checkout.amount)}</strong>
              </div>

              {checkoutState === 'pending' ? (
                <>
                  <div className="invoice-timer">
                    <Icon name="clock" />
                    <div>
                      <span>{tt('invoice_pay_before')}</span>
                      <strong>{formatCountdown(secondsLeft)}</strong>
                    </div>
                  </div>

                  {checkout.paymentProvider === 'coinremitter' ? (
                    <div className="crypto-pay">
                      {checkout.cryptoAmount && checkout.coin ? (
                        <div className="crypto-amount">
                          <span>{tt('crypto_pay')}</span>
                          <strong>{checkout.cryptoAmount} {checkout.coin}</strong>
                        </div>
                      ) : null}
                      {checkout.address ? (
                        <div className="crypto-address">
                          <span>{tt('crypto_address', { coin: checkout.coin || 'crypto' })}</span>
                          <code>{checkout.address}</code>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => { navigator.clipboard?.writeText(checkout.address); tgHaptic('light'); }}
                          >
                            {tt('crypto_copy_address')}
                          </button>
                        </div>
                      ) : null}
                      {checkout.paymentUrl ? (
                        <a
                          className="btn-primary"
                          href={checkout.paymentUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => tgHaptic('medium')}
                        >
                          {tt('crypto_open_payment_page')}
                        </a>
                      ) : null}
                      <p className="invoice-note">
                        {tt('crypto_note', { amount: `${checkout.cryptoAmount} ${checkout.coin}`, coin: checkout.coin })}
                      </p>
                    </div>
                  ) : checkout.qrImageUrl ? (
                    <>
                      <div className="qr-wrap">
                        <img src={checkout.qrImageUrl} alt="QRIS" className="qr" />
                      </div>
                      <p className="invoice-note">
                        {tt('qris_note', { amount: `Rp ${formatIdr(checkout.amount)}` })}
                      </p>
                    </>
                  ) : (
                    <p className="invoice-note">
                      {tt('invoice_preparing')}
                    </p>
                  )}
                </>
              ) : null}

              <p className="invoice-status-text">{statusMessage}</p>

              <div className="invoice-actions">
                <button className="btn-secondary" onClick={() => syncOrderStatus(checkout.orderId, false)}>
                  {tt('btn_check_status_now')}
                </button>
                <button
                  className="btn-danger"
                  onClick={async () => {
                    if (!confirm(tt('confirm_cancel_order'))) return;
                    try {
                      await shopApi.cancelOrder(token, checkout.orderId);
                      tgHaptic('medium');
                      setCheckout(null);
                      setCheckoutState('idle');
                      setStatusMessage(tt('msg_order_cancelled'));
                    } catch (e) {
                      setError(e.message || tt('err_cancel_failed'));
                    }
                  }}
                >
                  {tt('btn_cancel_order')}
                </button>
                <button
                  className="btn-tertiary"
                  onClick={() => {
                    setCheckout(null);
                    setCheckoutState('idle');
                    setStatusMessage('');
                    tgHaptic('light');
                  }}
                >
                  {tt('btn_back_to_store')}
                </button>
              </div>

              <div className="security-pill">
                <Icon name="shield" /> {tt('security_pill')}
              </div>
            </section>
          ) : (
            <>
              <section className="search-bar">
                <span className="search-bar-icon" aria-hidden="true"><Icon name="search" /></span>
                <input
                  type="search"
                  placeholder={tt('search_placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery ? (
                  <button
                    type="button"
                    className="search-bar-clear"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                ) : null}
              </section>

              {categories.length > 1 ? (
                <section className="cat-strip" role="tablist" aria-label={tt('aria_product_categories')}>
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="tab"
                      aria-selected={categoryFilter === c}
                      className={`cat-chip ${categoryFilter === c ? 'active' : ''}`}
                      onClick={() => {
                        setCategoryFilter(c);
                        tgHaptic('change');
                      }}
                    >
                      {c === 'all' ? tt('cat_all') : c}
                    </button>
                  ))}
                </section>
              ) : null}

              {filteredProducts.length === 0 ? (
                <section className="empty-state">
                  <span className="empty-icon">🔍</span>
                  <strong>{tt('empty_no_match_title')}</strong>
                  <p>{tt('empty_no_match_sub')}</p>
                </section>
              ) : (
                <section className="products-grid">
                  {pagedProducts.map((p) => {
                    const qty = cart[p.id] || 0;
                    const isUnlimited = Number(p.is_unlimited_stock) === 1;
                    const stockCount = Number(p.stock_count || 0);
                    const isOutOfStock = !isUnlimited && stockCount <= 0;
                    const isLowStock = !isUnlimited && stockCount > 0 && stockCount <= 3;
                    return (
                      <article className={`product-card ${isOutOfStock ? 'sold-out' : ''}`} key={p.id}>
                        <span className="br tl" aria-hidden="true"></span>
                        <span className="br tr" aria-hidden="true"></span>
                        <span className="br bl" aria-hidden="true"></span>
                        <span className="br brr" aria-hidden="true"></span>
                        <div className="product-media">
                          {p.product_image_url ? (
                            <img src={p.product_image_url} alt={p.name} loading="lazy" />
                          ) : (
                            <div className="product-media-placeholder">
                              {(p.name || '?').slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          {isUnlimited ? (
                            <span className="stock-pill unlimited">∞ Unlimited</span>
                          ) : isOutOfStock ? (
                            <span className="stock-pill out">Habis</span>
                          ) : isLowStock ? (
                            <span className="stock-pill low">Sisa {stockCount}</span>
                          ) : (
                            <span className="stock-pill ok">Stok {stockCount}</span>
                          )}
                        </div>

                        <div className="product-body">
                          <span className="product-cat">{p.category || tt('cat_general')}</span>
                          <h3 className="product-name">{p.name}</h3>
                          {p.description ? <p className="product-desc">{p.description}</p> : null}
                          <strong className="product-price">{money(p.price)}</strong>
                        </div>

                        <div className="product-foot">
                          {qty === 0 ? (
                            <button
                              type="button"
                              className="add-btn"
                              disabled={isOutOfStock}
                              onClick={() => setQty(p.id, 1, p.stock_count)}
                            >
                              {isOutOfStock ? tt('btn_out_of_stock') : tt('btn_add')}
                            </button>
                          ) : (
                            <div className="qty-stepper">
                              <button
                                type="button"
                                aria-label={tt('aria_decrease_qty')}
                                onClick={() => setQty(p.id, qty - 1, p.stock_count)}
                              >
                                <Icon name="minus" />
                              </button>
                              <span>{qty}</span>
                              <button
                                type="button"
                                aria-label={tt('aria_increase_qty')}
                                onClick={() => setQty(p.id, qty + 1, p.stock_count)}
                                disabled={!isUnlimited && qty >= stockCount}
                              >
                                <Icon name="plus" />
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </section>
              )}

              {totalProductPages > 1 ? (
                <section className="pager-card">
                  <button
                    type="button"
                    className="btn-tertiary"
                    disabled={productPage <= 1}
                    onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span>{productPage} / {totalProductPages}</span>
                  <button
                    type="button"
                    className="btn-tertiary"
                    disabled={productPage >= totalProductPages}
                    onClick={() => setProductPage((p) => Math.min(totalProductPages, p + 1))}
                  >
                    Next
                  </button>
                </section>
              ) : null}
            </>
          )}
        </>
      ) : activeTab === 'history' ? (
        <>
          <section className="filter-strip" role="tablist">
            {[
              { key: 'all', label: tt('filter_all', { n: orderHistory.length }) },
              { key: 'paid', label: tt('filter_paid') },
              { key: 'pending', label: tt('filter_pending') },
              { key: 'failed', label: tt('filter_other') },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={historyFilter === f.key}
                className={`cat-chip ${historyFilter === f.key ? 'active' : ''}`}
                onClick={() => {
                  setHistoryFilter(f.key);
                  tgHaptic('change');
                }}
              >
                {f.label}
              </button>
            ))}
          </section>

          {filteredHistory.length === 0 ? (
            <section className="empty-state">
              <span className="empty-icon">🛍️</span>
              <strong>{tt('empty_no_order_title')}</strong>
              <p>{tt('empty_no_order_sub')}</p>
              <button type="button" className="btn-primary" onClick={() => setActiveTab('store')}>
                {tt('btn_open_store')} <Icon name="arrow-right" />
              </button>
            </section>
          ) : (
            <section className="history-list">
              {filteredHistory.map((o) => {
                const isPaid = o.status === 'paid' || o.status === 'delivered';
                return (
                  <article
                    className={`order-item order-${o.status} order-clickable`}
                    key={o.id}
                    onClick={() => isPaid ? openDelivery(o.id) : setDetailOrder(o)}
                    role="button"
                    tabIndex={0}
                  >
                    <header className="order-item-head">
                      <div>
                        <strong className="order-code">{formatOrderCode(o.id, branding.shortName)}</strong>
                        <span className="order-time">{formatRelative(o.created_at, lang)}</span>
                      </div>
                      <span className={`status-badge ${o.status}`}>
                        {statusLabel[o.status] || o.status.toUpperCase()}
                      </span>
                    </header>

                    <div className="order-product-line">
                      <span className="order-product-name">{o.product_name}</span>
                      <span className="order-product-meta">{tt('label_qty', { n: o.quantity })}</span>
                    </div>

                    <footer className="order-item-foot">
                      <span className="order-amount">{moneyFinal(o.price)}</span>
                      {isPaid ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={(e) => { e.stopPropagation(); openDelivery(o.id); }}
                          disabled={deliveryLoadingId === o.id}
                        >
                          {deliveryLoadingId === o.id ? tt('btn_loading') : tt('btn_view_account')}
                        </button>
                      ) : (
                        <span className="order-detail-hint">{tt('hint_detail')}</span>
                      )}
                    </footer>
                  </article>
                );
              })}
            </section>
          )}

          {deliveryData?.delivery?.items?.length ? (
            <section className="delivery-card">
              <header className="delivery-head">
                <div>
                  <span className="invoice-eyebrow">{tt('delivery_eyebrow')}</span>
                  <h3>{formatOrderCode(deliveryData.id, branding.shortName)}</h3>
                </div>
                <span className="history-total">{tt('label_item_count', { n: deliveryData.delivery.items.length })}</span>
              </header>

              <div className="delivery-grid">
                {deliveryData.delivery.items.map((item) => {
                  const key = `delivery-${deliveryData.id}-${item.itemNo}`;
                  return (
                    <article className="delivery-item" key={key}>
                      <header className="delivery-item-head">
                        <strong>{tt('delivery_item_no', { n: item.itemNo })}</strong>
                        <button
                          type="button"
                          className="copy-btn"
                          onClick={() => copyToClipboard(item.data, key)}
                        >
                          {copiedItemKey === key ? <Icon name="check" /> : <Icon name="copy" />}
                          <span>{copiedItemKey === key ? tt('btn_copied') : tt('btn_copy')}</span>
                        </button>
                      </header>
                      <div className="delivery-content">
                        {renderDeliveryData(item.data)}
                      </div>
                    </article>
                  );
                })}
              </div>

              {deliveryData.delivery.deliveryNote ? (
                <div className="delivery-note">
                  <strong className="delivery-note-title">{tt('delivery_note_title')}</strong>
                  <p className="delivery-note-body">{deliveryData.delivery.deliveryNote}</p>
                </div>
              ) : null}

              {deliveryData.delivery.termsUrl ? (
                <a
                  className="btn-secondary delivery-terms"
                  href={deliveryData.delivery.termsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="open" /> {tt('btn_view_terms')}
                </a>
              ) : null}

              <button
                type="button"
                className="btn-tertiary delivery-close"
                onClick={() => setDeliveryData(null)}
              >
                {tt('btn_close_detail')}
              </button>
            </section>
          ) : null}

          {detailOrder ? (
            <section className="delivery-card">
              <header className="delivery-head">
                <div>
                  <span className="invoice-eyebrow">{tt('detail_order_eyebrow')}</span>
                  <h3>{formatOrderCode(detailOrder.id, branding.shortName)}</h3>
                </div>
                <span className={`status-badge ${detailOrder.status}`}>
                  {statusLabel[detailOrder.status] || detailOrder.status.toUpperCase()}
                </span>
              </header>

              <div className="detail-rows">
                <div className="detail-row"><span>{tt('label_product')}</span><strong>{detailOrder.product_name}</strong></div>
                <div className="detail-row"><span>{tt('label_quantity')}</span><strong>{tt('label_qty', { n: detailOrder.quantity })}</strong></div>
                <div className="detail-row"><span>{tt('label_total')}</span><strong>{moneyFinal(detailOrder.price)}</strong></div>
                <div className="detail-row"><span>{tt('label_date')}</span><strong>{formatRelative(detailOrder.created_at, lang)}</strong></div>
                <div className="detail-row"><span>{tt('label_method')}</span><strong>{(detailOrder.payment_provider || '-').toUpperCase()}</strong></div>
              </div>

              <p className="invoice-status-text">
                {detailOrder.status === 'pending' ? tt('detail_status_pending')
                  : detailOrder.status === 'cancelled' ? tt('detail_status_cancelled')
                  : detailOrder.status === 'expired' ? tt('detail_status_expired')
                  : detailOrder.status === 'failed' ? tt('detail_status_failed')
                  : tt('detail_status_default')}
              </p>

              <button
                type="button"
                className="btn-tertiary delivery-close"
                onClick={() => setDetailOrder(null)}
              >
                {tt('btn_close_detail')}
              </button>
            </section>
          ) : null}
        </>
      ) : (
        <section className="profile-shell">
          <section className="profile-card">
            <div className="profile-avatar" aria-hidden="true">
              {(user?.first_name || user?.username || '?').charAt(0).toUpperCase()}
            </div>
            <div className="profile-meta">
              <strong>{user?.first_name || tt('profile_user_fallback')}</strong>
              {user?.username ? <span>@{user.username}</span> : <span>ID {user?.id}</span>}
              <span
                className="profile-tier"
                style={{ background: profileSummary.tier.color }}
              >
                {tt('profile_member_suffix', { tier: profileSummary.tier.name })}
              </span>
            </div>
          </section>

          <section className="profile-stats">
            <div className="profile-stat">
              <span>{tt('profile_total_spent')}</span>
              <strong>{moneyFinal(profileSummary.totalSpent)}</strong>
            </div>
            <div className="profile-stat">
              <span>{tt('profile_paid_orders')}</span>
              <strong>{profileSummary.paidOrders}</strong>
            </div>
            <div className="profile-stat">
              <span>{tt('profile_total_orders')}</span>
              <strong>{profileSummary.totalOrders}</strong>
            </div>
          </section>

          <section className="profile-actions">
            <button type="button" className="profile-action" onClick={() => setActiveTab('history')}>
              <span>{tt('profile_action_history')}</span>
              <Icon name="arrow-right" />
            </button>
            <a className="profile-action" href={supportUrl} target="_blank" rel="noreferrer">
              <span>{tt('profile_action_support')}</span>
              <Icon name="arrow-right" />
            </a>
          </section>

          <p className="profile-note">
            Bot ini mendukung produk akun premium, source code, dan file digital lainnya. Semua pengiriman
            otomatis lewat Telegram.
          </p>
        </section>
      )}

      {/* Sticky checkout bar di Store: hanya muncul kalau ada item di cart & tidak sedang checkout. */}
      {activeTab === 'store' && !checkout && cartCount > 0 ? (
        <div className="sticky-cart">
          <div className="sticky-cart-info">
            <span className="sticky-cart-count">{tt('label_item_count', { n: cartCount })}</span>
            <strong className="sticky-cart-total">{money(subtotal)}</strong>
          </div>
          <div className="sticky-cart-actions">
            {branding.payments?.crypto !== false ? (
              <button type="button" className="btn-primary sticky-cart-btn" onClick={() => handleCheckout('coinremitter')}>
                {tt('sticky_pay_crypto')}
              </button>
            ) : null}
            {branding.payments?.qris ? (
              <button type="button" className="btn-secondary sticky-cart-btn" onClick={() => handleCheckout('violet')}>
                {tt('sticky_pay_qris')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <nav className="mini-nav" role="tablist" aria-label="Bottom navigation">
        <button
          role="tab"
          aria-selected={activeTab === 'store'}
          className={activeTab === 'store' ? 'active' : ''}
          onClick={() => { setActiveTab('store'); tgHaptic('change'); }}
        >
          <Icon name="store" />
          <span>{tt('nav_store')}</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'history'}
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => { setActiveTab('history'); tgHaptic('change'); }}
        >
          <Icon name="history" />
          <span>{tt('nav_history')}</span>
          {orderHistory.some((o) => o.status === 'pending') ? <span className="nav-dot" aria-hidden="true" /> : null}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'profile'}
          className={activeTab === 'profile' ? 'active' : ''}
          onClick={() => { setActiveTab('profile'); tgHaptic('change'); }}
        >
          <Icon name="user" />
          <span>{tt('nav_profile')}</span>
        </button>
      </nav>
    </main>
  );
}
