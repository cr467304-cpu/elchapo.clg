import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, MessageCircle, X } from 'lucide-react';
import type {
  AppNotification,
  Category,
  Order,
  PaymentMethod,
  Product,
  PromoCode,
  ShippingOption,
  User,
  WebsiteSettings,
} from './types.ts';
import type { CartItem } from './types.ts';
import { apiRequest, setAuthToken } from './utils/api.ts';
import { formatWhatsAppUrl, hasStaffPermission } from './utils/commerce.ts';
import { signOutFirebaseAdmin } from './utils/firebase.ts';
import { Header, type AppRoute } from './components/Header.tsx';
import { MobileNav } from './components/MobileNav.tsx';
import { CartDrawer, CartItemsList } from './components/CartDrawer.tsx';
import { ProductDetailView } from './components/ProductDetailView.tsx';
import {
  CheckoutView,
  PaymentConfirmationView,
} from './components/CheckoutAndPaymentViews.tsx';
import { AccountView, AuthView } from './components/AccountView.tsx';
import {
  CategoriesView,
  Footer,
  HomeView,
  ShopView,
  StaticInfoView,
  WishlistView,
} from './components/StorefrontCatalogViews.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';

const DEFAULT_SETTINGS: WebsiteSettings = {
  storeName: 'elchapo.clg',
  announcementText:
    'Rilisan Kapsul Terbaru Tersedia — Gunakan kode ELCHAPO10 untuk potongan 10%',
  heroTitle: 'Minimalist Streetwear Built for Daily Movement.',
  heroSubtitle:
    'Siluet boxy heavyweight cotton, konstruksi workwear presisi, dan detail fungsional untuk gaya urban sehari-hari.',
  heroCta: 'Belanja Sekarang',
  heroImage: '/src/assets/images/hero_streetwear_campaign_1795224764469.jpg',
  promoTitle: 'Monochrome Studio Capsule',
  promoSubtitle:
    'Nikmati potongan langsung Rp50.000 dengan kode NEWDROP50K untuk minimal belanja Rp500.000.',
  promoCta: 'Belanja Koleksi Promo',
  promoImage: '/src/assets/images/promo_banner_capsule_1795224764816.jpg',
  contactEmail: 'hello@elchapo.clg',
  contactPhone: '085647441648',
  whatsappNumber: '085647441648',
  instagramUrl: 'https://instagram.com/elchapo.clg',
  tiktokUrl: 'https://tiktok.com/@elchapo.clg',
  footerAbout:
    'Label streetwear minimalis independen dengan fokus pada material heavyweight cotton, siluet clean, dan kenyamanan penggunaan harian.',
  privacyPolicy: '',
  termsConditions: '',
  returnPolicy: '',
  aboutStory: '',
};

const GUEST_WISHLIST_KEY = 'elchapo_guest_wishlist_v1';
const GUEST_CART_KEY = 'elchapo_guest_cart_v1';
const RECENT_VIEWED_KEY = 'elchapo_recent_viewed_v1';

function readNumberList(key: string): number[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function readGuestCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

function parseRouteFromLocation(): AppRoute {
  const pathname = window.location.pathname || '/';
  const params = new URLSearchParams(window.location.search);

  if (pathname === '/admin') return { page: 'admin' };
  if (pathname === '/shop') {
    return {
      page: 'shop',
      category: params.get('category') || undefined,
      search: params.get('search') || undefined,
    };
  }
  if (pathname === '/categories') return { page: 'categories' };
  if (pathname.startsWith('/product/')) {
    const id = Number(pathname.replace('/product/', ''));
    if (Number.isFinite(id) && id > 0) return { page: 'product', productId: id };
  }
  if (pathname === '/wishlist') return { page: 'wishlist' };
  if (pathname === '/cart') return { page: 'cart' };
  if (pathname === '/checkout') return { page: 'checkout' };
  if (pathname.startsWith('/payment-confirmation/')) {
    const orderNumber = decodeURIComponent(pathname.replace('/payment-confirmation/', ''));
    if (orderNumber) return { page: 'payment-confirmation', orderNumber };
  }
  if (pathname === '/login') return { page: 'login' };
  if (pathname === '/register') return { page: 'register' };
  if (pathname === '/account') {
    const tab = (params.get('tab') || 'profile') as
      | 'profile'
      | 'orders'
      | 'tracking'
      | 'wishlist'
      | 'notifications';
    return {
      page: 'account',
      tab,
      orderNumber: params.get('order') || undefined,
    };
  }
  if (pathname === '/contact') return { page: 'contact' };
  if (pathname === '/about') return { page: 'about' };
  if (pathname === '/privacy') return { page: 'policy', kind: 'privacy' };
  if (pathname === '/terms') return { page: 'policy', kind: 'terms' };
  if (pathname === '/returns') return { page: 'policy', kind: 'returns' };
  return { page: 'home' };
}

function buildUrlFromRoute(route: AppRoute): string {
  switch (route.page) {
    case 'home':
      return '/';
    case 'shop': {
      const sp = new URLSearchParams();
      if (route.category) sp.set('category', route.category);
      if (route.search) sp.set('search', route.search);
      const qs = sp.toString();
      return qs ? `/shop?${qs}` : '/shop';
    }
    case 'categories':
      return '/categories';
    case 'product':
      return `/product/${route.productId}`;
    case 'wishlist':
      return '/wishlist';
    case 'cart':
      return '/cart';
    case 'checkout':
      return '/checkout';
    case 'payment-confirmation':
      return `/payment-confirmation/${encodeURIComponent(route.orderNumber)}`;
    case 'login':
      return '/login';
    case 'register':
      return '/register';
    case 'account': {
      const sp = new URLSearchParams();
      if (route.tab) sp.set('tab', route.tab);
      if (route.orderNumber) sp.set('order', route.orderNumber);
      const qs = sp.toString();
      return qs ? `/account?${qs}` : '/account';
    }
    case 'contact':
      return '/contact';
    case 'about':
      return '/about';
    case 'policy':
      return `/${route.kind}`;
    case 'admin':
      return '/admin';
  }
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseRouteFromLocation());
  const [settings, setSettings] = useState<WebsiteSettings>(DEFAULT_SETTINGS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [_promotions, setPromotions] = useState<PromoCode[]>([]);
  const [storeLoading, setStoreLoading] = useState(true);

  const [user, setUser] = useState<User | null>(null);
  const [wishlistIds, setWishlistIds] = useState<number[]>(() =>
    readNumberList(GUEST_WISHLIST_KEY)
  );
  const [cartItems, setCartItems] = useState<CartItem[]>(() => readGuestCart());
  const [orders, setOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<number[]>(() =>
    readNumberList(RECENT_VIEWED_KEY)
  );

  // UI controls
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [redirectAfterLogin, setRedirectAfterLogin] = useState<AppRoute | null>(null);

  const showToast = useCallback((title: string, message: string) => {
    setToast({ title, message });
    setTimeout(() => {
      setToast((curr) => (curr?.title === title && curr?.message === message ? null : curr));
    }, 4500);
  }, []);

  const navigate = useCallback((nextRoute: AppRoute) => {
    const nextUrl = buildUrlFromRoute(nextRoute);
    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history.pushState(null, '', nextUrl);
    }
    setRoute(nextRoute);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Browser back/forward sync
  useEffect(() => {
    const onPopState = () => {
      setRoute(parseRouteFromLocation());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Google Maps quota / auth failure banner listener
  useEffect(() => {
    const handleQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  // Track recently viewed products
  useEffect(() => {
    if (route.page === 'product') {
      setRecentlyViewedIds((prev) => {
        const next = [route.productId, ...prev.filter((id) => id !== route.productId)].slice(0, 8);
        try {
          localStorage.setItem(RECENT_VIEWED_KEY, JSON.stringify(next));
        } catch {
          // ignore storage quota errors
        }
        return next;
      });
    }
  }, [route]);

  const loadStorefront = useCallback(async () => {
    try {
      const res = await apiRequest<{
        settings: WebsiteSettings;
        categories: Category[];
        products: Product[];
        paymentMethods: PaymentMethod[];
        shippingOptions: ShippingOption[];
        promotions: PromoCode[];
      }>('/api/storefront');
      setSettings(res.settings);
      setCategories(res.categories);
      setProducts(res.products);
      setPaymentMethods(res.paymentMethods);
      setShippingOptions(res.shippingOptions);
      setPromotions(res.promotions);
    } catch {
      // Fallback stays on default settings
    } finally {
      setStoreLoading(false);
    }
  }, []);

  const loadUserWorkspace = useCallback(async (activeUser: User | null) => {
    if (!activeUser) {
      setWishlistIds(readNumberList(GUEST_WISHLIST_KEY));
      setCartItems(readGuestCart());
      setOrders([]);
      setNotifications([]);
      return;
    }

    const [wlRes, cartRes, ordRes, notifRes] = await Promise.all([
      apiRequest<{ productIds: number[] }>('/api/wishlist').catch(() => ({ productIds: [] })),
      apiRequest<{ items: CartItem[] }>('/api/cart').catch(() => ({ items: [] })),
      apiRequest<{ orders: Order[] }>('/api/orders').catch(() => ({ orders: [] })),
      apiRequest<{ notifications: AppNotification[] }>('/api/notifications').catch(() => ({
        notifications: [],
      })),
    ]);

    setWishlistIds(wlRes.productIds);
    setCartItems(cartRes.items);
    setOrders(ordRes.orders);
    setNotifications(notifRes.notifications);
  }, []);

  // Initial bootstrap: storefront + session check
  useEffect(() => {
    loadStorefront();
    apiRequest<{ user: User | null }>('/api/auth/me')
      .then((res) => {
        setUser(res.user);
        return loadUserWorkspace(res.user);
      })
      .catch(() => {
        setUser(null);
      });
  }, [loadStorefront, loadUserWorkspace]);

  // Real-Time SSE stream when authenticated
  useEffect(() => {
    if (!user) return;
    const es = new EventSource('/api/events');

    const handleNotification = (ev: MessageEvent) => {
      try {
        const notif = JSON.parse(ev.data) as AppNotification;
        setNotifications((prev) => {
          if (prev.some((n) => n.id === notif.id)) return prev;
          return [notif, ...prev];
        });
        showToast(notif.title, notif.message);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(notif.title, { body: notif.message });
        }
      } catch {
        // ignore parse errors
      }
    };

    const handleOrderUpdated = (ev: MessageEvent) => {
      try {
        const updated = JSON.parse(ev.data) as Order;
        setOrders((prev) => {
          const idx = prev.findIndex((o) => o.id === updated.id);
          if (idx === -1) return [updated, ...prev];
          const copy = [...prev];
          copy[idx] = updated;
          return copy;
        });
      } catch {
        // ignore parse errors
      }
    };

    es.addEventListener('notification', handleNotification);
    es.addEventListener('order_updated', handleOrderUpdated);

    return () => {
      es.removeEventListener('notification', handleNotification);
      es.removeEventListener('order_updated', handleOrderUpdated);
      es.close();
    };
  }, [user, showToast]);

  const handleAuthSuccess = useCallback(
    async (loggedInUser: User, token: string, targetRoute?: AppRoute) => {
      setAuthToken(token);
      setUser(loggedInUser);

      // Sync any guest cart items into authenticated user cart
      const guestCart = readGuestCart();
      if (guestCart.length > 0) {
        for (const item of guestCart) {
          await apiRequest('/api/cart', {
            method: 'POST',
            body: JSON.stringify({
              productId: item.productId,
              size: item.size,
              color: item.color,
              quantity: item.quantity,
            }),
          }).catch(() => {});
        }
        try {
          localStorage.removeItem(GUEST_CART_KEY);
        } catch {
          // ignore
        }
      }

      // Sync guest wishlist items
      const guestWl = readNumberList(GUEST_WISHLIST_KEY);
      if (guestWl.length > 0) {
        const currentWl = await apiRequest<{ productIds: number[] }>('/api/wishlist')
          .then((r) => r.productIds)
          .catch((): number[] => []);
        for (const pid of guestWl) {
          if (!currentWl.includes(pid)) {
            await apiRequest('/api/wishlist/toggle', {
              method: 'POST',
              body: JSON.stringify({ productId: pid }),
            }).catch(() => {});
          }
        }
        try {
          localStorage.removeItem(GUEST_WISHLIST_KEY);
        } catch {
          // ignore
        }
      }

      await loadUserWorkspace(loggedInUser);

      if (targetRoute) {
        navigate(targetRoute);
      } else if (redirectAfterLogin) {
        const next = redirectAfterLogin;
        setRedirectAfterLogin(null);
        navigate(next);
      } else if (loggedInUser.role === 'admin' || loggedInUser.role === 'staff') {
        if (route.page !== 'admin') {
          navigate({ page: 'account', tab: 'profile' });
        }
      } else {
        navigate({ page: 'account', tab: 'profile' });
      }
    },
    [loadUserWorkspace, navigate, redirectAfterLogin, route.page]
  );

  const handleLogout = useCallback(async () => {
    await Promise.all([
      apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {}),
      signOutFirebaseAdmin(),
    ]);
    setAuthToken(null);
    setUser(null);
    await loadUserWorkspace(null);
    if (route.page === 'admin' || route.page === 'account' || route.page === 'checkout') {
      navigate({ page: 'home' });
    }
  }, [loadUserWorkspace, navigate, route.page]);

  const handleToggleWishlist = useCallback(
    async (productId: number) => {
      if (user) {
        try {
          const res = await apiRequest<{ productIds: number[] }>('/api/wishlist/toggle', {
            method: 'POST',
            body: JSON.stringify({ productId }),
          });
          setWishlistIds(res.productIds);
        } catch (err) {
          showToast('Wishlist', err instanceof Error ? err.message : 'Gagal memperbarui wishlist.');
        }
        return;
      }

      setWishlistIds((prev) => {
        const exists = prev.includes(productId);
        const next = exists ? prev.filter((id) => id !== productId) : [productId, ...prev];
        try {
          localStorage.setItem(GUEST_WISHLIST_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [user, showToast]
  );

  const handleAddToCart = useCallback(
    async (params: { product: Product; size: string; color: string; quantity: number }) => {
      if (user) {
        try {
          const res = await apiRequest<{ items: CartItem[] }>('/api/cart', {
            method: 'POST',
            body: JSON.stringify({
              productId: params.product.id,
              size: params.size,
              color: params.color,
              quantity: params.quantity,
            }),
          });
          setCartItems(res.items);
          setCartDrawerOpen(true);
        } catch (err) {
          showToast('Keranjang', err instanceof Error ? err.message : 'Gagal menambahkan produk.');
        }
        return;
      }

      // Guest local cart (persisted cleanly and synced to DB upon login)
      setCartItems((prev) => {
        const existingIdx = prev.findIndex(
          (it) =>
            it.productId === params.product.id &&
            it.size === params.size &&
            it.color === params.color
        );
        const effectivePrice =
          params.product.discountPrice &&
          params.product.discountPrice > 0 &&
          params.product.discountPrice < params.product.price
            ? params.product.discountPrice
            : params.product.price;

        let next: CartItem[];
        if (existingIdx >= 0) {
          next = prev.map((it, idx) =>
            idx === existingIdx
              ? {
                  ...it,
                  quantity: Math.min(params.product.stock, it.quantity + params.quantity),
                }
              : it
          );
        } else {
          const tempId = Date.now() + Math.floor(Math.random() * 1000);
          next = [
            {
              id: tempId,
              productId: params.product.id,
              productName: params.product.name,
              productImage: params.product.images[0] || '',
              size: params.size,
              color: params.color,
              quantity: Math.min(params.product.stock, params.quantity),
              unitPrice: effectivePrice,
              stock: params.product.stock,
              status: params.product.status,
            },
            ...prev,
          ];
        }
        try {
          localStorage.setItem(GUEST_CART_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      setCartDrawerOpen(true);
    },
    [user, showToast]
  );

  const handleUpdateCartQty = useCallback(
    async (itemId: number, qty: number) => {
      if (user) {
        try {
          const res = await apiRequest<{ items: CartItem[] }>(`/api/cart/${itemId}`, {
            method: 'PUT',
            body: JSON.stringify({ quantity: qty }),
          });
          setCartItems(res.items);
        } catch (err) {
          showToast('Keranjang', err instanceof Error ? err.message : 'Gagal mengubah jumlah.');
        }
        return;
      }

      setCartItems((prev) => {
        const next =
          qty <= 0
            ? prev.filter((it) => it.id !== itemId)
            : prev.map((it) =>
                it.id === itemId ? { ...it, quantity: Math.min(it.stock, qty) } : it
              );
        try {
          localStorage.setItem(GUEST_CART_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [user, showToast]
  );

  const handleRemoveCartItem = useCallback(
    async (itemId: number) => {
      if (user) {
        try {
          const res = await apiRequest<{ items: CartItem[] }>(`/api/cart/${itemId}`, {
            method: 'DELETE',
          });
          setCartItems(res.items);
        } catch (err) {
          showToast('Keranjang', err instanceof Error ? err.message : 'Gagal menghapus item.');
        }
        return;
      }

      setCartItems((prev) => {
        const next = prev.filter((it) => it.id !== itemId);
        try {
          localStorage.setItem(GUEST_CART_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [user, showToast]
  );

  const handleMarkNotificationsRead = useCallback(async () => {
    if (!user) return;
    await apiRequest('/api/notifications/read-all', { method: 'POST' }).catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, [user]);

  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const wishlistProducts = useMemo(
    () => products.filter((p) => wishlistIds.includes(p.id)),
    [products, wishlistIds]
  );

  // Separated Admin Portal Layout
  if (route.page === 'admin') {
    return (
      <>
        {quotaExceeded && (
          <div
            role="alert"
            className="sticky top-0 z-50 bg-amber-50 border-b border-amber-300 px-4 py-2.5 text-xs text-amber-950 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                Google Maps API quota/billing exceeded — tampilan peta mungkin terbatas.{' '}
                <a
                  href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold"
                >
                  Pelajari info kuota
                </a>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setQuotaExceeded(false)}
              aria-label="Tutup peringatan peta"
              className="p-1 text-amber-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <AdminDashboard
          user={user}
          settings={settings}
          onAuthSuccess={(u, token) => handleAuthSuccess(u, token, { page: 'admin' })}
          onLogout={handleLogout}
          onExitAdmin={() => navigate({ page: 'home' })}
          onStorefrontRefresh={loadStorefront}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] text-[#111113]">
      {quotaExceeded && (
        <div
          role="alert"
          className="sticky top-0 z-50 bg-amber-50 border-b border-amber-300 px-4 py-2.5 text-xs text-amber-950 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Google Maps API quota/billing exceeded — peta pelacakan mungkin terbatas.{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold"
              >
                Info Kuota Maps
              </a>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setQuotaExceeded(false)}
            aria-label="Tutup peringatan kuota"
            className="p-1 text-amber-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <Header
        settings={settings}
        route={route}
        onNavigate={navigate}
        cartCount={cartCount}
        unreadNotifications={unreadNotifications}
        user={user}
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        onToggleSearch={() => setSearchOpen((o) => !o)}
        onSearchChange={setSearchQuery}
        onSearchSubmit={() => navigate({ page: 'shop', search: searchQuery.trim() || undefined })}
        onOpenCartDrawer={() => setCartDrawerOpen(true)}
        announcementDismissed={announcementDismissed}
        onDismissAnnouncement={() => setAnnouncementDismissed(true)}
      />

      {/* Live Notification Toast */}
      {toast && (
        <div
          role="status"
          className="fixed top-20 right-4 z-50 max-w-sm bg-[#111113] text-white rounded-xl p-4 shadow-xl border border-zinc-800 flex items-start gap-3"
        >
          <CheckCircle2 className="w-5 h-5 text-[#2563EB] shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5 flex-1">
            <p className="font-semibold">{toast.title}</p>
            <p className="text-zinc-300 leading-relaxed">{toast.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Tutup notifikasi"
            className="text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <main className="flex-1">
        {storeLoading && route.page === 'home' ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-8 animate-pulse">
            <div className="h-[420px] bg-zinc-200 rounded-2xl" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-72 bg-zinc-200 rounded-xl" />
              ))}
            </div>
          </div>
        ) : route.page === 'home' ? (
          <HomeView
            settings={settings}
            categories={categories}
            products={products}
            wishlistIds={wishlistIds}
            canEditPromo={Boolean(user && hasStaffPermission(user, 'settings'))}
            onSavePromoContent={async (patch) => {
              const res = await apiRequest<{ settings: WebsiteSettings }>('/api/admin/settings', {
                method: 'PUT',
                body: JSON.stringify(patch),
              });
              setSettings(res.settings);
              showToast('Banner Promo', 'Teks banner promo berhasil diperbarui.');
            }}
            onNavigate={navigate}
            onSelectProduct={(id) => navigate({ page: 'product', productId: id })}
            onToggleWishlist={handleToggleWishlist}
          />
        ) : route.page === 'shop' ? (
          <ShopView
            key={`${route.category || 'all'}-${route.search || ''}`}
            products={products}
            categories={categories}
            wishlistIds={wishlistIds}
            initialCategory={route.category || 'all'}
            initialSearch={route.search || ''}
            onSelectProduct={(id) => navigate({ page: 'product', productId: id })}
            onToggleWishlist={handleToggleWishlist}
          />
        ) : route.page === 'categories' ? (
          <CategoriesView
            categories={categories}
            onSelectCategory={(slug) => navigate({ page: 'shop', category: slug })}
          />
        ) : route.page === 'product' ? (
          <ProductDetailView
            productId={route.productId}
            allProducts={products}
            recentlyViewedIds={recentlyViewedIds}
            wishlistIds={wishlistIds}
            user={user}
            onBack={() => navigate({ page: 'shop' })}
            onSelectProduct={(id) => navigate({ page: 'product', productId: id })}
            onToggleWishlist={handleToggleWishlist}
            onAddToCart={handleAddToCart}
            onRequireLogin={() => {
              setRedirectAfterLogin({ page: 'product', productId: route.productId });
              navigate({ page: 'login' });
            }}
          />
        ) : route.page === 'wishlist' ? (
          <WishlistView
            products={products}
            wishlistIds={wishlistIds}
            onSelectProduct={(id) => navigate({ page: 'product', productId: id })}
            onToggleWishlist={handleToggleWishlist}
            onGoShop={() => navigate({ page: 'shop' })}
          />
        ) : route.page === 'cart' ? (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 pb-24 space-y-6">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#111113]">
                Keranjang Belanja
              </h1>
              <p className="text-sm text-zinc-600 mt-1">
                Periksa ukuran, warna, dan ketersediaan stok sebelum menuju checkout.
              </p>
            </div>
            <div className="bg-white border border-zinc-200 rounded-2xl p-6">
              <CartItemsList
                items={cartItems}
                onUpdateQty={handleUpdateCartQty}
                onRemoveItem={handleRemoveCartItem}
                onCheckout={() => {
                  if (!user) {
                    setRedirectAfterLogin({ page: 'checkout' });
                    navigate({ page: 'login' });
                    return;
                  }
                  navigate({ page: 'checkout' });
                }}
                onContinueShopping={() => navigate({ page: 'shop' })}
              />
            </div>
          </div>
        ) : route.page === 'checkout' ? (
          <CheckoutView
            user={user}
            cartItems={cartItems}
            paymentMethods={paymentMethods}
            shippingOptions={shippingOptions}
            onOrderCreated={(newOrder) => {
              setCartItems([]);
              setOrders((prev) => [newOrder, ...prev]);
              navigate({ page: 'payment-confirmation', orderNumber: newOrder.orderNumber });
            }}
            onRequireLogin={() => {
              setRedirectAfterLogin({ page: 'checkout' });
              navigate({ page: 'login' });
            }}
            onBackToCart={() => navigate({ page: 'cart' })}
          />
        ) : route.page === 'payment-confirmation' ? (
          <PaymentConfirmationView
            orderNumber={route.orderNumber}
            paymentMethods={paymentMethods}
            onTrackOrder={(ordNum) =>
              navigate({ page: 'account', tab: 'tracking', orderNumber: ordNum })
            }
            onOrderUpdated={(updated) => {
              setOrders((prev) => {
                const idx = prev.findIndex((o) => o.id === updated.id);
                if (idx === -1) return [updated, ...prev];
                const copy = [...prev];
                copy[idx] = updated;
                return copy;
              });
            }}
          />
        ) : route.page === 'login' || route.page === 'register' ? (
          <AuthView
            mode={route.page}
            onSuccess={(u, token) => handleAuthSuccess(u, token)}
            onSwitchMode={(m) => navigate({ page: m })}
          />
        ) : route.page === 'account' ? (
          user ? (
            <AccountView
              user={user}
              initialTab={route.tab}
              initialOrderNumber={route.orderNumber}
              orders={orders}
              wishlistProducts={wishlistProducts}
              wishlistIds={wishlistIds}
              notifications={notifications}
              storeWhatsApp={settings.whatsappNumber || '085647441648'}
              onUserUpdated={(u) => setUser(u)}
              onLogout={handleLogout}
              onSelectProduct={(id) => navigate({ page: 'product', productId: id })}
              onToggleWishlist={handleToggleWishlist}
              onGoToPayment={(ordNum) =>
                navigate({ page: 'payment-confirmation', orderNumber: ordNum })
              }
              onMarkNotificationsRead={handleMarkNotificationsRead}
              onOpenAdmin={() => navigate({ page: 'admin' })}
            />
          ) : (
            <AuthView
              mode="login"
              onSuccess={(u, token) => handleAuthSuccess(u, token, { page: 'account', tab: 'profile' })}
              onSwitchMode={(m) => navigate({ page: m })}
            />
          )
        ) : route.page === 'contact' ? (
          <StaticInfoView kind="contact" settings={settings} />
        ) : route.page === 'about' ? (
          <StaticInfoView kind="about" settings={settings} />
        ) : route.page === 'policy' ? (
          <StaticInfoView kind={route.kind} settings={settings} />
        ) : null}
      </main>

      <Footer settings={settings} onNavigate={navigate} />

      <MobileNav route={route} user={user} onNavigate={navigate} />

      <CartDrawer
        open={cartDrawerOpen}
        onClose={() => setCartDrawerOpen(false)}
        onOpenFullCart={() => navigate({ page: 'cart' })}
        items={cartItems}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onCheckout={() => {
          if (!user) {
            setRedirectAfterLogin({ page: 'checkout' });
            navigate({ page: 'login' });
            return;
          }
          navigate({ page: 'checkout' });
        }}
        onContinueShopping={() => navigate({ page: 'shop' })}
      />

      {/* Floating WhatsApp Official Store Support Button */}
      <a
        href={formatWhatsAppUrl(
          settings.whatsappNumber || '085647441648',
          'Halo admin elchapo.clg, saya ingin bertanya tentang produk atau pesanan saya.'
        )}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Hubungi WhatsApp resmi elchapo.clg (${settings.whatsappNumber || '085647441648'})`}
        className="fixed bottom-16 md:bottom-6 right-4 z-30 h-11 px-4 rounded-xl bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 transition-colors inline-flex items-center gap-2 text-xs font-semibold"
      >
        <MessageCircle className="w-4 h-4" />
        <span className="hidden sm:inline">CS WhatsApp</span>
      </a>
    </div>
  );
}
