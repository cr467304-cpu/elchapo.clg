import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Check,
  CreditCard,
  Download,
  FileSpreadsheet,
  Globe,
  Landmark,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Plus,
  Shield,
  ShoppingBag,
  Trash2,
  Truck,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  ALL_ADMIN_PERMISSIONS,
  type AdminOverviewData,
  type AdminPermission,
  type Category,
  type Order,
  type OrderStatus,
  type PaymentIncomingSummary,
  type PaymentMethod,
  type PaymentSettingsHistory,
  type Product,
  type PromoCode,
  type ShippingOption,
  type User,
  type WebsiteSettings,
} from '../types.ts';
import { apiRequest, uploadImageFile } from '../utils/api.ts';
import {
  ORDER_STATUS_SEQUENCE,
  formatIDR,
  hasStaffPermission,
} from '../utils/commerce.ts';
import { exportOrdersToExcel, exportOrdersToPdf } from '../utils/export.ts';
import { signInWithGoogleForAdmin, signOutFirebaseAdmin } from '../utils/firebase.ts';
import { ImageCropModal, type CropAspectPreset } from './ImageCropModal.tsx';
import { OrderTrackingMap } from './OrderTrackingMap.tsx';

type AdminTab =
  | 'overview'
  | 'products'
  | 'orders'
  | 'payments'
  | 'shipping'
  | 'customers'
  | 'staff'
  | 'settings';

const PERMISSION_LABELS: Record<AdminPermission, string> = {
  overview: 'Overview & Analitik',
  products: 'Produk & Kategori',
  orders: 'Pesanan & Verifikasi',
  payments: 'Pengaturan Pembayaran',
  shipping: 'Pengiriman & Kurir',
  customers: 'Data Pelanggan',
  staff: 'Hak Akses Staf',
  settings: 'Pengaturan Website',
};

interface AdminDashboardProps {
  user: User | null;
  settings: WebsiteSettings;
  onAuthSuccess: (user: User, token: string) => void;
  onLogout: () => void;
  onExitAdmin: () => void;
  onStorefrontRefresh: () => Promise<void>;
}

export function AdminDashboard({
  user,
  settings,
  onAuthSuccess,
  onLogout,
  onExitAdmin,
  onStorefrontRefresh,
}: AdminDashboardProps) {
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [envPasscodeConfigured, setEnvPasscodeConfigured] = useState(false);
  const [googleAdminEnabled, setGoogleAdminEnabled] = useState(true);
  const [checkingBootstrap, setCheckingBootstrap] = useState(true);

  // Admin Login / Bootstrap state
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authPasscode, setAuthPasscode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const isStaffUser = Boolean(
    user && (user.role === 'admin' || user.role === 'staff') && user.status === 'active'
  );

  const availableTabs: Array<{ id: AdminTab; label: string; icon: typeof BarChart3 }> = [
    { id: 'overview', label: 'Overview & Penjualan', icon: BarChart3 },
    { id: 'products', label: 'Produk & Promo', icon: Package },
    { id: 'orders', label: 'Pesanan & QRIS', icon: ShoppingBag },
    { id: 'payments', label: 'Pengaturan Pembayaran', icon: CreditCard },
    { id: 'shipping', label: 'Pengiriman', icon: Truck },
    { id: 'customers', label: 'Pelanggan', icon: Users },
    { id: 'staff', label: 'Manajemen Staf', icon: Shield },
    { id: 'settings', label: 'Pengaturan Website', icon: Globe },
  ].filter((t) => hasStaffPermission(user, t.id as AdminPermission)) as Array<{
    id: AdminTab;
    label: string;
    icon: typeof BarChart3;
  }>;

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [chartRange, setChartRange] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Data states
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [promotions, setPromotions] = useState<PromoCode[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [incomingSummary, setIncomingSummary] = useState<PaymentIncomingSummary[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<PaymentSettingsHistory[]>([]);
  const [newBankAccount, setNewBankAccount] = useState({
    bankName: '',
    accountNumber: '',
    accountHolder: '',
    name: '',
    instructions: '',
  });
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [customers, setCustomers] = useState<User[]>([]);
  const [staffList, setStaffList] = useState<User[]>([]);
  const [siteForm, setSiteForm] = useState<WebsiteSettings>(settings);

  // Modals & forms
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [waDispatchBanner, setWaDispatchBanner] = useState<{
    orderNumber: string;
    url: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    kind: 'product' | 'category' | 'promo' | 'shipping' | 'payment_method';
    id: number;
    label: string;
  } | null>(null);

  // Product Form Modal
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [cropSession, setCropSession] = useState<{
    file: File;
    title: string;
    defaultPreset: CropAspectPreset;
    onUploaded: (url: string) => void;
  } | null>(null);
  const [customSizeInput, setCustomSizeInput] = useState('');
  const [customColorInput, setCustomColorInput] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');
  const [promoForm, setPromoForm] = useState({
    code: '',
    title: '',
    discountType: 'percent' as 'percent' | 'fixed',
    discountValue: 10,
    minOrder: 200000,
  });

  // Order Update controls
  const [orderStatusInput, setOrderStatusInput] = useState<OrderStatus>('Diproses');
  const [orderResiInput, setOrderResiInput] = useState('');
  const [orderLocationInput, setOrderLocationInput] = useState('');
  const [orderProgressInput, setOrderProgressInput] = useState(50);
  const [rejectReason, setRejectReason] = useState('');

  // Shipping Form
  const [newShipping, setNewShipping] = useState({
    serviceName: '',
    cost: 25000,
    eta: '2–3 Hari Kerja',
    originCity: 'Jakarta Selatan',
  });

  // Staff Form
  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'staff' as 'staff' | 'admin',
    permissions: ['overview', 'orders', 'products'] as AdminPermission[],
  });

  const [statusFeedback, setStatusFeedback] = useState('');
  const [errorFeedback, setErrorFeedback] = useState('');

  useEffect(() => {
    setSiteForm(settings);
  }, [settings]);

  useEffect(() => {
    apiRequest<{
      needsBootstrap: boolean;
      envPasscodeConfigured: boolean;
      googleAdminEnabled?: boolean;
    }>('/api/admin/bootstrap-status')
      .then((res) => {
        setNeedsBootstrap(res.needsBootstrap);
        setEnvPasscodeConfigured(res.envPasscodeConfigured);
        if (typeof res.googleAdminEnabled === 'boolean') {
          setGoogleAdminEnabled(res.googleAdminEnabled);
        }
      })
      .catch(() => {})
      .finally(() => setCheckingBootstrap(false));
  }, []);

  const loadTabData = useCallback(async () => {
    if (!isStaffUser) return;
    setErrorFeedback('');
    try {
      if (activeTab === 'overview' && hasStaffPermission(user, 'overview')) {
        const res = await apiRequest<AdminOverviewData>('/api/admin/overview');
        setOverview(res);
      } else if (activeTab === 'products' && hasStaffPermission(user, 'products')) {
        const [pRes, prRes] = await Promise.all([
          apiRequest<{ products: Product[]; categories: Category[] }>('/api/admin/products'),
          apiRequest<{ promotions: PromoCode[] }>('/api/admin/promotions'),
        ]);
        setProducts(pRes.products);
        setCategories(pRes.categories);
        setPromotions(prRes.promotions);
      } else if (activeTab === 'orders' && hasStaffPermission(user, 'orders')) {
        const res = await apiRequest<{ orders: Order[] }>('/api/admin/orders');
        setOrders(res.orders);
      } else if (activeTab === 'payments' && hasStaffPermission(user, 'payments')) {
        const res = await apiRequest<{
          paymentMethods: PaymentMethod[];
          incomingSummary?: PaymentIncomingSummary[];
          history: PaymentSettingsHistory[];
        }>('/api/admin/payment-methods');
        setPaymentMethods(res.paymentMethods);
        setIncomingSummary(res.incomingSummary || []);
        setPaymentHistory(res.history);
      } else if (activeTab === 'shipping' && hasStaffPermission(user, 'shipping')) {
        const res = await apiRequest<{ shippingOptions: ShippingOption[] }>(
          '/api/admin/shipping'
        );
        setShippingOptions(res.shippingOptions);
      } else if (activeTab === 'customers' && hasStaffPermission(user, 'customers')) {
        const res = await apiRequest<{ customers: User[] }>('/api/admin/customers');
        setCustomers(res.customers);
      } else if (activeTab === 'staff' && hasStaffPermission(user, 'staff')) {
        const res = await apiRequest<{ staff: User[] }>('/api/admin/staff');
        setStaffList(res.staff);
      }
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : 'Gagal memuat data admin.');
    }
  }, [activeTab, isStaffUser, user]);

  useEffect(() => {
    if (isStaffUser && availableTabs.length > 0 && !availableTabs.some((t) => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [isStaffUser, availableTabs, activeTab]);

  useEffect(() => {
    loadTabData();
  }, [loadTabData]);

  const handleAdminBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await apiRequest<{ user: User; token: string }>('/api/admin/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          name: authName,
          email: authEmail,
          password: authPassword,
          passcode: authPasscode,
        }),
      });
      setNeedsBootstrap(false);
      onAuthSuccess(res.user, res.token);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Gagal menyiapkan admin.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await apiRequest<{ user: User; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      if (res.user.role !== 'admin' && res.user.role !== 'staff') {
        setAuthError('Akun ini terdaftar sebagai pelanggan dan tidak memiliki akses admin.');
        return;
      }
      onAuthSuccess(res.user, res.token);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login gagal.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleAdminLogin = async () => {
    setAuthError('');
    setGoogleLoading(true);
    try {
      const { idToken } = await signInWithGoogleForAdmin();
      const res = await apiRequest<{ user: User; token: string }>('/api/admin/google-login', {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      });
      setNeedsBootstrap(false);
      onAuthSuccess(res.user, res.token);
    } catch (err) {
      await signOutFirebaseAdmin();
      const msg =
        err instanceof Error ? err.message : 'Login Google Admin gagal atau dibatalkan.';
      setAuthError(
        msg.includes('popup-closed-by-user')
          ? 'Jendela login Google ditutup sebelum selesai.'
          : msg
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  if (checkingBootstrap) {
    return (
      <div className="min-h-screen bg-[#F4F4F5] flex items-center justify-center text-sm text-zinc-600">
        Memeriksa akses portal admin...
      </div>
    );
  }

  if (!isStaffUser) {
    return (
      <div className="min-h-screen bg-[#111113] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl p-8 space-y-6 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#2563EB]">elchapo.clg · Admin Portal</p>
              <h1 className="font-display text-2xl font-bold text-[#111113] mt-1">
                {needsBootstrap
                  ? 'Akses & Setup Administrator'
                  : 'Login Dashboard Admin'}
              </h1>
            </div>
            <button
              type="button"
              onClick={onExitAdmin}
              className="text-xs text-zinc-500 hover:text-[#111113] inline-flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Toko</span>
            </button>
          </div>

          {user && user.role === 'customer' && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
              Anda sedang masuk sebagai pelanggan ({user.email}). Silakan login dengan akun Administrator atau Staf.
            </div>
          )}

          {googleAdminEnabled && (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleGoogleAdminLogin}
                disabled={googleLoading || authLoading}
                className="w-full py-3 px-4 bg-white border border-zinc-300 hover:border-[#111113] hover:bg-zinc-50 text-[#111113] text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-3 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <svg
                  className="w-5 h-5 shrink-0"
                  viewBox="0 0 48 48"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                <span>
                  {googleLoading
                    ? 'Memverifikasi Akun Google...'
                    : 'Sign in with Google (Khusus Admin)'}
                </span>
              </button>
              <p className="text-[11px] text-zinc-500 text-center">
                Akses Google khusus untuk akun Admin resmi (cr467304@gmail.com) &amp; Staf terdaftar.
              </p>

              <div className="relative py-1 flex items-center">
                <div className="flex-grow border-t border-zinc-200" />
                <span className="shrink mx-3 text-[11px] text-zinc-400">
                  atau kredensial admin
                </span>
                <div className="flex-grow border-t border-zinc-200" />
              </div>
            </div>
          )}

          {needsBootstrap ? (
            <form onSubmit={handleAdminBootstrap} className="space-y-4">
              <p className="text-xs text-zinc-600 leading-relaxed">
                Belum ada akun administrator utama yang terdaftar. Buat kredensial pemilik toko untuk mengunci dan mengelola seluruh dashboard elchapo.clg.
              </p>
              <div>
                <label htmlFor="boot-name" className="block text-xs font-medium text-zinc-700 mb-1">
                  Nama Administrator
                </label>
                <input
                  id="boot-name"
                  type="text"
                  required
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="Owner elchapo.clg"
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="boot-email" className="block text-xs font-medium text-zinc-700 mb-1">
                  Email Admin
                </label>
                <input
                  id="boot-email"
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="admin@elchapo.clg"
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="boot-pass" className="block text-xs font-medium text-zinc-700 mb-1">
                  Password Admin (min. 6 karakter)
                </label>
                <input
                  id="boot-pass"
                  type="password"
                  required
                  minLength={6}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm"
                />
              </div>
              {authError && <p className="text-xs text-red-600">{authError}</p>}
              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 bg-[#111113] text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                {authLoading ? 'Menyimpan...' : 'Klaim & Buka Dashboard Admin'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              {!envPasscodeConfigured && (
                <>
                  <div>
                    <label htmlFor="adm-email" className="block text-xs font-medium text-zinc-700 mb-1">
                      Email Admin / Staf
                    </label>
                    <input
                      id="adm-email"
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="admin@elchapo.clg"
                      className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="adm-pass" className="block text-xs font-medium text-zinc-700 mb-1">
                      Password
                    </label>
                    <input
                      id="adm-pass"
                      type="password"
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm"
                    />
                  </div>
                </>
              )}

              {envPasscodeConfigured && (
                <div>
                  <label htmlFor="adm-code" className="block text-xs font-medium text-zinc-700 mb-1">
                    Passcode Admin
                  </label>
                  <input
                    id="adm-code"
                    type="password"
                    required
                    value={authPasscode}
                    onChange={(e) => setAuthPasscode(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm"
                  />
                </div>
              )}

              {authError && <p className="text-xs text-red-600">{authError}</p>}

              <button
                type="submit"
                disabled={authLoading}
                onClick={envPasscodeConfigured ? handleAdminBootstrap : undefined}
                className="w-full py-3 bg-[#111113] text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                {authLoading ? 'Memverifikasi...' : 'Masuk ke Dashboard Admin'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Handlers
  const notifyOk = (msg: string) => {
    setStatusFeedback(msg);
    setTimeout(() => setStatusFeedback(''), 3500);
  };

  const PRESET_PRODUCT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'One Size'];
  const PRESET_PRODUCT_COLORS = [
    'Obsidian Black',
    'Studio Chalk',
    'Washed Charcoal',
    'Slate Grey',
    'Sand Beige',
    'Olive Drab',
    'Broken White',
    'Navy',
  ];

  const toggleProductSize = (size: string) => {
    if (!editingProduct) return;
    const current = editingProduct.sizes || [];
    const exists = current.includes(size);
    const next = exists ? current.filter((s) => s !== size) : [...current, size];
    setEditingProduct({ ...editingProduct, sizes: next });
  };

  const addCustomProductSize = () => {
    if (!editingProduct) return;
    const val = customSizeInput.trim();
    if (!val) return;
    const current = editingProduct.sizes || [];
    if (!current.some((s) => s.toLowerCase() === val.toLowerCase())) {
      setEditingProduct({ ...editingProduct, sizes: [...current, val] });
    }
    setCustomSizeInput('');
  };

  const toggleProductColor = (color: string) => {
    if (!editingProduct) return;
    const current = editingProduct.colors || [];
    const exists = current.some((c) => c.toLowerCase() === color.toLowerCase());
    const next = exists
      ? current.filter((c) => c.toLowerCase() !== color.toLowerCase())
      : [...current, color];
    setEditingProduct({ ...editingProduct, colors: next });
  };

  const addCustomProductColor = () => {
    if (!editingProduct) return;
    const val = customColorInput.trim();
    if (!val) return;
    const current = editingProduct.colors || [];
    if (!current.some((c) => c.toLowerCase() === val.toLowerCase())) {
      setEditingProduct({ ...editingProduct, colors: [...current, val] });
    }
    setCustomColorInput('');
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    const cleanSizes = (editingProduct.sizes || []).map((s) => s.trim()).filter(Boolean);
    const cleanColors = (editingProduct.colors || []).map((c) => c.trim()).filter(Boolean);
    if (cleanSizes.length === 0) {
      setErrorFeedback('Pilih atau tambahkan minimal 1 ukuran produk sebelum menyimpan.');
      return;
    }
    if (cleanColors.length === 0) {
      setErrorFeedback('Pilih atau tambahkan minimal 1 warna produk sebelum menyimpan.');
      return;
    }
    const payload = {
      ...editingProduct,
      sizes: cleanSizes,
      colors: cleanColors,
    };
    try {
      if (editingProduct.id) {
        await apiRequest(`/api/admin/products/${editingProduct.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notifyOk('Produk berhasil diperbarui.');
      } else {
        await apiRequest('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notifyOk('Produk baru berhasil ditambahkan.');
      }
      setEditingProduct(null);
      setCustomSizeInput('');
      setCustomColorInput('');
      await loadTabData();
      await onStorefrontRefresh();
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : 'Gagal menyimpan produk.');
    }
  };

  const handleConfirmedDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.kind === 'product') {
        await apiRequest(`/api/admin/products/${confirmDelete.id}`, { method: 'DELETE' });
      } else if (confirmDelete.kind === 'category') {
        await apiRequest(`/api/admin/categories/${confirmDelete.id}`, { method: 'DELETE' });
      } else if (confirmDelete.kind === 'promo') {
        await apiRequest(`/api/admin/promotions/${confirmDelete.id}`, { method: 'DELETE' });
      } else if (confirmDelete.kind === 'shipping') {
        await apiRequest(`/api/admin/shipping/${confirmDelete.id}`, { method: 'DELETE' });
      } else if (confirmDelete.kind === 'payment_method') {
        await apiRequest(`/api/admin/payment-methods/${confirmDelete.id}`, { method: 'DELETE' });
      }
      setConfirmDelete(null);
      notifyOk(`"${confirmDelete.label}" telah dihapus.`);
      await loadTabData();
      await onStorefrontRefresh();
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : 'Gagal menghapus data.');
      setConfirmDelete(null);
    }
  };

  const handleVerifyPayment = async (orderId: number, approved: boolean) => {
    try {
      const res = await apiRequest<{ order: Order; whatsappDispatchUrl?: string }>(
        `/api/admin/orders/${orderId}/verify-payment`,
        {
          method: 'POST',
          body: JSON.stringify({ approved, reason: rejectReason }),
        }
      );
      setSelectedOrder(res.order);
      if (approved && res.whatsappDispatchUrl) {
        setWaDispatchBanner({
          orderNumber: res.order.orderNumber,
          url: res.whatsappDispatchUrl,
        });
      }
      notifyOk(
        approved
          ? `Pembayaran ${res.order.orderNumber} diverifikasi! Stok dikurangi & notifikasi WhatsApp/Email/Push dikirim.`
          : `Pembayaran ${res.order.orderNumber} ditolak.`
      );
      await loadTabData();
      await onStorefrontRefresh();
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : 'Gagal memverifikasi pembayaran.');
    }
  };

  const handleUpdateOrderTracking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      const res = await apiRequest<{ order: Order }>(`/api/admin/orders/${selectedOrder.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          orderStatus: orderStatusInput,
          trackingNumber: orderResiInput,
          locationLabel: orderLocationInput,
          routeProgress: orderProgressInput / 100,
        }),
      });
      setSelectedOrder(res.order);
      notifyOk(`Status & lokasi peta ${res.order.orderNumber} diperbarui secara real-time.`);
      await loadTabData();
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : 'Gagal memperbarui pesanan.');
    }
  };

  const activeSeries =
    chartRange === 'daily'
      ? overview?.dailySales || []
      : chartRange === 'weekly'
      ? overview?.weeklySales || []
      : overview?.monthlySales || [];
  const maxChartRev = Math.max(1, ...activeSeries.map((s) => s.revenue));

  return (
    <div className="min-h-screen bg-[#F4F4F5] flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 bg-[#111113] text-white shrink-0 flex flex-col justify-between">
        <div>
          <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <p className="font-display text-lg font-bold tracking-tight">elchapo.clg</p>
              <p className="text-[11px] text-zinc-400">Admin Console</p>
            </div>
            <button
              type="button"
              onClick={onExitAdmin}
              className="px-2.5 py-1.5 text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 rounded-md cursor-pointer"
            >
              Lihat Toko
            </button>
          </div>

          <nav aria-label="Menu Admin" className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {availableTabs.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#2563EB] text-white'
                      : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-zinc-800 hidden lg:block space-y-3">
          <div className="text-xs">
            <p className="font-semibold text-white truncate">{user?.name}</p>
            <p className="text-zinc-400 truncate">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar Admin</span>
          </button>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main className="flex-1 min-w-0 p-4 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-4">
          <div className="text-xs text-zinc-500">
            Admin <span className="mx-1.5">/</span>{' '}
            <span className="font-semibold text-[#111113]">
              {availableTabs.find((t) => t.id === activeTab)?.label || 'Dashboard'}
            </span>
          </div>
          {statusFeedback && (
            <div className="px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
              {statusFeedback}
            </div>
          )}
          {errorFeedback && (
            <div className="px-3.5 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
              {errorFeedback}
            </div>
          )}
        </div>

        {waDispatchBanner && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-emerald-900">
              <p className="font-semibold">
                Notifikasi WhatsApp Otomatis Siap untuk {waDispatchBanner.orderNumber}
              </p>
              <p className="mt-0.5">
                Log WhatsApp tersimpan di sistem. Klik untuk kirim langsung ke WhatsApp pelanggan / CS ({settings.whatsappNumber}).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={waDispatchBanner.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 inline-flex items-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Kirim via WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={() => setWaDispatchBanner(null)}
                aria-label="Tutup banner WhatsApp"
                className="p-1.5 text-emerald-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ==================== A. OVERVIEW & ANALYTICS ==================== */}
        {activeTab === 'overview' && overview && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Pendapatan', val: formatIDR(overview.totalRevenue) },
                { label: 'Total Pesanan', val: String(overview.totalOrders) },
                { label: 'Total Produk', val: String(overview.totalProducts) },
                { label: 'Total Pelanggan', val: String(overview.totalCustomers) },
                { label: 'Menunggu Pembayaran', val: String(overview.pendingPaymentOrders) },
                { label: 'Sedang Diproses/Dikirim', val: String(overview.processingOrders) },
                { label: 'Pesanan Selesai', val: String(overview.completedOrders) },
                { label: 'Produk Stok Menipis', val: String(overview.lowStockProducts.length) },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="bg-white border border-zinc-200 rounded-xl p-4 space-y-1"
                >
                  <p className="text-xs text-zinc-500">{kpi.label}</p>
                  <p className="font-display text-xl font-bold text-[#111113] tabular-nums">
                    {kpi.val}
                  </p>
                </div>
              ))}
            </div>

            {/* Sales Chart */}
            <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-bold text-[#111113]">
                    Grafik Penjualan Harian, Mingguan & Bulanan
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Berdasarkan pesanan dengan status pembayaran lunas
                  </p>
                </div>
                <div className="inline-flex bg-zinc-100 p-1 rounded-lg">
                  {(['daily', 'weekly', 'monthly'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setChartRange(r)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                        chartRange === r ? 'bg-white text-[#111113] shadow-sm' : 'text-zinc-600'
                      }`}
                    >
                      {r === 'daily' ? 'Harian' : r === 'weekly' ? 'Mingguan' : 'Bulanan'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-56 flex items-end gap-3 pt-4 border-t border-zinc-100">
                {activeSeries.map((pt) => {
                  const pct = Math.max(6, Math.round((pt.revenue / maxChartRev) * 100));
                  return (
                    <div key={pt.label} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                      <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
                        {pt.revenue > 0 ? `${Math.round(pt.revenue / 1000)}rb` : '0'}
                      </span>
                      <div className="w-full max-w-[44px] bg-zinc-100 rounded-t-md h-40 flex items-end overflow-hidden">
                        <div
                          className="w-full bg-[#2563EB] rounded-t-md transition-all duration-300"
                          style={{ height: `${pt.revenue > 0 ? pct : 4}%` }}
                          title={`${pt.label}: ${formatIDR(pt.revenue)} (${pt.orders} pesanan)`}
                        />
                      </div>
                      <span className="text-[11px] font-medium text-zinc-600 tabular-nums">
                        {pt.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Low Stock Inventory Monitor */}
            <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
              <h2 className="font-display text-base font-bold text-[#111113]">
                Monitor Inventaris & Produk Stok Menipis
              </h2>
              {overview.lowStockProducts.length === 0 ? (
                <p className="text-xs text-zinc-500">Semua stok produk aman (&gt; 10 unit).</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="border-b border-zinc-200 text-zinc-500">
                      <tr>
                        <th className="py-2 pr-4">Produk</th>
                        <th className="py-2 pr-4">Kategori</th>
                        <th className="py-2 pr-4 text-right">Harga</th>
                        <th className="py-2 text-right">Sisa Stok</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {overview.lowStockProducts.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2.5 pr-4 font-medium text-[#111113]">{p.name}</td>
                          <td className="py-2.5 pr-4 text-zinc-600">{p.categoryName}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">
                            {formatIDR(p.discountPrice || p.price)}
                          </td>
                          <td
                            className={`py-2.5 text-right font-semibold tabular-nums ${
                              p.stock <= 0 ? 'text-red-600' : 'text-amber-700'
                            }`}
                          >
                            {p.stock} pcs
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== B. PRODUCTS, CATEGORIES & PROMOS ==================== */}
        {activeTab === 'products' && (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="font-display text-xl font-bold text-[#111113]">
                Manajemen Produk ({products.length})
              </h1>
              <button
                type="button"
                onClick={() => {
                  setCustomSizeInput('');
                  setCustomColorInput('');
                  setEditingProduct({
                    name: '',
                    description: '',
                    material: '100% Heavyweight Cotton',
                    categoryId: categories[0]?.id || 1,
                    price: 299000,
                    discountPrice: null,
                    stock: 20,
                    status: 'active',
                    isNewArrival: true,
                    isBestSeller: false,
                    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
                    colors: ['Obsidian Black', 'Studio Chalk'],
                    images: ['/src/assets/images/product_tshirt_boxy_1795224764536.jpg'],
                  });
                }}
                className="px-4 py-2 bg-[#111113] text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Produk</span>
              </button>
            </div>

            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
                    <tr>
                      <th className="py-3 px-4">Produk</th>
                      <th className="py-3 px-4">Kategori</th>
                      <th className="py-3 px-4 text-right">Harga</th>
                      <th className="py-3 px-4 text-right">Stok</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {products.map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-50/60">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={p.images[0] || ''}
                              alt={p.name}
                              className="w-10 h-10 rounded-md object-cover bg-zinc-100 border border-zinc-200"
                            />
                            <div>
                              <p className="font-semibold text-[#111113]">{p.name}</p>
                              <p className="text-[11px] text-zinc-500">
                                {p.isNewArrival ? 'New Arrival' : ''}
                                {p.isNewArrival && p.isBestSeller ? ' · ' : ''}
                                {p.isBestSeller ? 'Best Seller' : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-zinc-600">{p.categoryName}</td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          {p.discountPrice ? (
                            <div>
                              <span className="font-semibold text-[#111113]">
                                {formatIDR(p.discountPrice)}
                              </span>
                              <span className="block text-[10px] text-zinc-400 line-through">
                                {formatIDR(p.price)}
                              </span>
                            </div>
                          ) : (
                            <span className="font-semibold text-[#111113]">
                              {formatIDR(p.price)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold tabular-nums">
                          {p.stock}
                        </td>
                        <td className="py-3 px-4">{p.status}</td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCustomSizeInput('');
                              setCustomColorInput('');
                              setEditingProduct(p);
                            }}
                            className="text-[#2563EB] font-semibold hover:underline cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDelete({ kind: 'product', id: p.id, label: p.name })
                            }
                            className="text-red-600 font-semibold hover:underline cursor-pointer"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Categories & Promo Codes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
                <h2 className="font-display text-base font-bold text-[#111113]">
                  Manajemen Kategori
                </h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newCategoryName.trim()) return;
                    await apiRequest('/api/admin/categories', {
                      method: 'POST',
                      body: JSON.stringify({ name: newCategoryName, description: newCategoryDesc }),
                    });
                    setNewCategoryName('');
                    setNewCategoryDesc('');
                    await loadTabData();
                    await onStorefrontRefresh();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    placeholder="Nama kategori baru"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#111113] text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Tambah
                  </button>
                </form>

                <ul className="divide-y divide-zinc-100 text-xs">
                  {categories.map((c) => (
                    <li key={c.id} className="py-2.5 flex items-center justify-between">
                      <span className="font-medium text-[#111113]">{c.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDelete({ kind: 'category', id: c.id, label: c.name })
                        }
                        className="text-red-600 hover:underline cursor-pointer"
                      >
                        Hapus
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
                <h2 className="font-display text-base font-bold text-[#111113]">
                  Kode Promo & Diskon
                </h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiRequest('/api/admin/promotions', {
                      method: 'POST',
                      body: JSON.stringify(promoForm),
                    });
                    setPromoForm({
                      code: '',
                      title: '',
                      discountType: 'percent',
                      discountValue: 10,
                      minOrder: 200000,
                    });
                    await loadTabData();
                  }}
                  className="grid grid-cols-2 gap-2"
                >
                  <input
                    type="text"
                    required
                    placeholder="Kode (cth: DROP20)"
                    value={promoForm.code}
                    onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value })}
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-xs uppercase"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Judul Promo"
                    value={promoForm.title}
                    onChange={(e) => setPromoForm({ ...promoForm, title: e.target.value })}
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                  />
                  <select
                    value={promoForm.discountType}
                    onChange={(e) =>
                      setPromoForm({
                        ...promoForm,
                        discountType: e.target.value as 'percent' | 'fixed',
                      })
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-xs bg-white"
                  >
                    <option value="percent">Persentase (%)</option>
                    <option value="fixed">Potongan Tetap (Rp)</option>
                  </select>
                  <input
                    type="number"
                    required
                    placeholder="Nilai Diskon"
                    value={promoForm.discountValue}
                    onChange={(e) =>
                      setPromoForm({ ...promoForm, discountValue: Number(e.target.value) })
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                  />
                  <button
                    type="submit"
                    className="col-span-2 py-2 bg-[#111113] text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Buat Kode Promo
                  </button>
                </form>

                <ul className="divide-y divide-zinc-100 text-xs">
                  {promotions.map((pr) => (
                    <li key={pr.id} className="py-2.5 flex items-center justify-between">
                      <span>
                        <strong className="font-mono">{pr.code}</strong> — {pr.title} (
                        {pr.discountType === 'percent'
                          ? `${pr.discountValue}%`
                          : formatIDR(pr.discountValue)}
                        )
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDelete({ kind: 'promo', id: pr.id, label: pr.code })
                        }
                        className="text-red-600 hover:underline cursor-pointer"
                      >
                        Hapus
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ==================== C. ORDERS & PAYMENT VERIFICATION ==================== */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="font-display text-xl font-bold text-[#111113]">
                Manajemen Pesanan & Verifikasi Pembayaran ({orders.length})
              </h1>
              {orders.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportOrdersToPdf(orders, settings.storeName)}
                    className="px-3 py-2 bg-white border border-zinc-300 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportOrdersToExcel(orders, settings.storeName)}
                    className="px-3 py-2 bg-white border border-zinc-300 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Export Excel</span>
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
                    <tr>
                      <th className="py-3 px-4">No. Pesanan</th>
                      <th className="py-3 px-4">Pembeli</th>
                      <th className="py-3 px-4">Pembayaran</th>
                      <th className="py-3 px-4">Status Pesanan</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-zinc-500">
                          Belum ada pesanan masuk.
                        </td>
                      </tr>
                    ) : (
                      orders.map((o) => (
                        <tr key={o.id} className="hover:bg-zinc-50">
                          <td className="py-3 px-4 font-mono font-semibold text-[#111113]">
                            {o.orderNumber}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-[#111113]">{o.recipientName}</p>
                            <p className="text-[11px] text-zinc-500">{o.recipientPhone}</p>
                          </td>
                          <td className="py-3 px-4">
                            <p>{o.paymentMethodName}</p>
                            <p className="text-[11px] text-zinc-500">{o.paymentStatus}</p>
                          </td>
                          <td className="py-3 px-4 font-semibold text-[#2563EB]">
                            {o.orderStatus}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold tabular-nums">
                            {formatIDR(o.totalAmount)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrder(o);
                                setOrderStatusInput(o.orderStatus);
                                setOrderResiInput(o.trackingNumber);
                                setOrderLocationInput(o.currentLocationLabel);
                              }}
                              className="px-3 py-1.5 bg-[#111113] text-white text-[11px] font-semibold rounded-md cursor-pointer"
                            >
                              Kelola
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== D. PAYMENT SETTINGS & ADMIN RECEIVING ACCOUNTS ==================== */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            <h1 className="font-display text-xl font-bold text-[#111113]">
              Rekening Uang Masuk Admin &amp; Metode Pembayaran
            </h1>

            {/* Ringkasan Uang Masuk */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <p className="text-xs text-zinc-500">Total Uang Masuk Terverifikasi</p>
                <p className="font-display text-2xl font-bold text-[#111113] mt-1 tabular-nums">
                  {formatIDR(
                    incomingSummary.reduce((sum, item) => sum + item.paidTotalAmount, 0)
                  )}
                </p>
                <p className="text-[11px] text-emerald-700 mt-1">
                  {incomingSummary.reduce((sum, item) => sum + item.paidOrdersCount, 0)} pesanan lunas
                </p>
              </div>
              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <p className="text-xs text-zinc-500">Menunggu Pembayaran / Verifikasi</p>
                <p className="font-display text-2xl font-bold text-[#2563EB] mt-1 tabular-nums">
                  {formatIDR(
                    incomingSummary.reduce((sum, item) => sum + item.pendingAmount, 0)
                  )}
                </p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {incomingSummary.reduce((sum, item) => sum + item.pendingCount, 0)} pesanan berjalan
                </p>
              </div>
              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <p className="text-xs text-zinc-500">Rekening Bank Admin Aktif</p>
                <p className="font-display text-2xl font-bold text-[#111113] mt-1 tabular-nums">
                  {paymentMethods.filter((m) => m.type === 'bank_transfer' && m.isActive).length}
                </p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Siap menerima transfer langsung di checkout
                </p>
              </div>
            </div>

            {/* Tabel Rekap Uang Masuk per Rekening / Metode */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-[#111113]">
                  Rekap Uang Masuk per Rekening &amp; Kanal Pembayaran
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-50 border-y border-zinc-200 text-zinc-600">
                    <tr>
                      <th className="py-2.5 px-3">Metode / Rekening Tujuan</th>
                      <th className="py-2.5 px-3">Jenis</th>
                      <th className="py-2.5 px-3 text-right">Transaksi Lunas</th>
                      <th className="py-2.5 px-3 text-right">Uang Masuk (Lunas)</th>
                      <th className="py-2.5 px-3 text-right">Dana Tertunda</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {incomingSummary.map((row) => (
                      <tr key={row.paymentMethodId}>
                        <td className="py-2.5 px-3">
                          <p className="font-semibold text-[#111113]">{row.paymentMethodName}</p>
                          {row.paymentType === 'bank_transfer' && row.accountNumber && (
                            <p className="text-[11px] text-zinc-500 font-mono">
                              {row.bankName} · {row.accountNumber} ({row.accountHolder})
                            </p>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-600">
                          {row.paymentType === 'bank_transfer'
                            ? 'Rekening Bank Admin'
                            : row.paymentType === 'qris'
                              ? 'QRIS'
                              : 'Payment Gateway'}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {row.paidOrdersCount}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-emerald-700 tabular-nums">
                          {formatIDR(row.paidTotalAmount)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-600 tabular-nums">
                          {formatIDR(row.pendingAmount)} ({row.pendingCount})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tambah Rekening Bank Admin Baru */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await apiRequest('/api/admin/payment-methods', {
                    method: 'POST',
                    body: JSON.stringify({
                      type: 'bank_transfer',
                      bankName: newBankAccount.bankName,
                      accountNumber: newBankAccount.accountNumber,
                      accountHolder: newBankAccount.accountHolder,
                      name: newBankAccount.name,
                      instructions: newBankAccount.instructions,
                      isActive: true,
                    }),
                  });
                  setNewBankAccount({
                    bankName: '',
                    accountNumber: '',
                    accountHolder: '',
                    name: '',
                    instructions: '',
                  });
                  notifyOk('Rekening bank admin baru berhasil ditambahkan dan aktif di checkout.');
                  await loadTabData();
                  await onStorefrontRefresh();
                } catch (err) {
                  setErrorFeedback(
                    err instanceof Error ? err.message : 'Gagal menambahkan rekening bank admin.'
                  );
                }
              }}
              className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
            >
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-[#111113]" />
                <h2 className="font-display text-base font-bold text-[#111113]">
                  Tambah Rekening Bank Tujuan Admin
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Nama Bank
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: BCA / Mandiri / BRI / SeaBank"
                    value={newBankAccount.bankName}
                    onChange={(e) =>
                      setNewBankAccount({ ...newBankAccount, bankName: e.target.value })
                    }
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Nomor Rekening Admin
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 8820194500"
                    value={newBankAccount.accountNumber}
                    onChange={(e) =>
                      setNewBankAccount({ ...newBankAccount, accountNumber: e.target.value })
                    }
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Atas Nama Pemilik Rekening
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: elchapo.clg Official"
                    value={newBankAccount.accountHolder}
                    onChange={(e) =>
                      setNewBankAccount({ ...newBankAccount, accountHolder: e.target.value })
                    }
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Label Metode di Checkout (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Otomatis: Transfer Bank ke Rekening Admin (Nama Bank)"
                    value={newBankAccount.name}
                    onChange={(e) =>
                      setNewBankAccount({ ...newBankAccount, name: e.target.value })
                    }
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Instruksi Transfer untuk Pembeli (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Contoh: Transfer tepat sesuai total tagihan lalu unggah bukti transfer."
                    value={newBankAccount.instructions}
                    onChange={(e) =>
                      setNewBankAccount({ ...newBankAccount, instructions: e.target.value })
                    }
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="px-4 py-2.5 bg-[#111113] text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Rekening Admin</span>
              </button>
            </form>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {paymentMethods.map((pm) => (
                <form
                  key={pm.id}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await apiRequest(`/api/admin/payment-methods/${pm.id}`, {
                        method: 'PUT',
                        body: JSON.stringify(pm),
                      });
                      notifyOk(`${pm.name} diperbarui dan langsung aktif di checkout pelanggan.`);
                      await loadTabData();
                      await onStorefrontRefresh();
                    } catch (err) {
                      setErrorFeedback(
                        err instanceof Error ? err.message : 'Gagal memperbarui metode pembayaran.'
                      );
                    }
                  }}
                  className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-base font-bold text-[#111113]">
                      {pm.type === 'qris'
                        ? 'Metode QRIS Dinamis'
                        : pm.type === 'bank_transfer'
                          ? `Rekening Bank Admin (${pm.bankName || 'Transfer'})`
                          : 'Payment Gateway Pihak Ketiga'}
                    </h2>
                    <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={pm.isActive}
                        onChange={(e) =>
                          setPaymentMethods((prev) =>
                            prev.map((m) =>
                              m.id === pm.id ? { ...m, isActive: e.target.checked } : m
                            )
                          )
                        }
                      />
                      <span>Aktif di Checkout</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Nama Metode Pembayaran
                    </label>
                    <input
                      type="text"
                      value={pm.name}
                      onChange={(e) =>
                        setPaymentMethods((prev) =>
                          prev.map((m) => (m.id === pm.id ? { ...m, name: e.target.value } : m))
                        )
                      }
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </div>

                  {pm.type === 'bank_transfer' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-50 border border-zinc-200 rounded-xl p-3.5">
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                          Nama Bank
                        </label>
                        <input
                          type="text"
                          required
                          value={pm.bankName}
                          onChange={(e) =>
                            setPaymentMethods((prev) =>
                              prev.map((m) =>
                                m.id === pm.id ? { ...m, bankName: e.target.value } : m
                              )
                            )
                          }
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                          Nomor Rekening
                        </label>
                        <input
                          type="text"
                          required
                          value={pm.accountNumber}
                          onChange={(e) =>
                            setPaymentMethods((prev) =>
                              prev.map((m) =>
                                m.id === pm.id ? { ...m, accountNumber: e.target.value } : m
                              )
                            )
                          }
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                          Atas Nama
                        </label>
                        <input
                          type="text"
                          required
                          value={pm.accountHolder}
                          onChange={(e) =>
                            setPaymentMethods((prev) =>
                              prev.map((m) =>
                                m.id === pm.id ? { ...m, accountHolder: e.target.value } : m
                              )
                            )
                          }
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {pm.type === 'qris' && (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-zinc-700">
                        Gambar QRIS Saat Ini
                      </label>
                      <div className="flex items-center gap-4">
                        {pm.qrisImageUrl && (
                          <img
                            src={pm.qrisImageUrl}
                            alt="QRIS"
                            className="w-28 h-28 object-contain border border-zinc-200 rounded-lg bg-zinc-50 p-1"
                          />
                        )}
                        <label className="px-3.5 py-2 bg-zinc-100 border border-zinc-300 rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Unggah QRIS Baru</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="sr-only"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (!file) return;
                              setCropSession({
                                file,
                                title: 'Crop Gambar QRIS',
                                defaultPreset: '1:1',
                                onUploaded: (url) => {
                                  setPaymentMethods((prev) =>
                                    prev.map((m) =>
                                      m.id === pm.id ? { ...m, qrisImageUrl: url } : m
                                    )
                                  );
                                  notifyOk('Gambar QRIS berhasil dicrop & diunggah.');
                                },
                              });
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {pm.type === 'gateway' && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1">
                        Kanal Pembayaran Aktif (pisahkan dengan koma)
                      </label>
                      <input
                        type="text"
                        value={pm.gatewayChannels.join(', ')}
                        onChange={(e) =>
                          setPaymentMethods((prev) =>
                            prev.map((m) =>
                              m.id === pm.id
                                ? {
                                    ...m,
                                    gatewayChannels: e.target.value
                                      .split(',')
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  }
                                : m
                            )
                          )
                        }
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Instruksi Pembayaran
                    </label>
                    <textarea
                      rows={3}
                      value={pm.instructions}
                      onChange={(e) =>
                        setPaymentMethods((prev) =>
                          prev.map((m) =>
                            m.id === pm.id ? { ...m, instructions: e.target.value } : m
                          )
                        )
                      }
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="submit"
                      className="px-4 py-2.5 bg-[#111113] text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
                    >
                      Simpan Pengaturan {pm.name}
                    </button>
                    {pm.type === 'bank_transfer' && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDelete({
                            kind: 'payment_method',
                            id: pm.id,
                            label: `${pm.name} (${pm.bankName} ${pm.accountNumber})`,
                          })
                        }
                        className="px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus Rekening</span>
                      </button>
                    )}
                  </div>
                </form>
              ))}
            </div>

            {/* Audit History */}
            <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-3">
              <h2 className="font-display text-base font-bold text-[#111113]">
                Riwayat Perubahan Pengaturan Pembayaran
              </h2>
              <ul className="divide-y divide-zinc-100 text-xs">
                {paymentHistory.map((h) => (
                  <li key={h.id} className="py-2.5 flex justify-between gap-4">
                    <span>
                      <strong>{h.changedBy}</strong> — {h.summary}
                    </span>
                    <span className="text-zinc-400 tabular-nums shrink-0">
                      {new Date(h.createdAt).toLocaleString('id-ID')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ==================== E. SHIPPING MANAGEMENT ==================== */}
        {activeTab === 'shipping' && (
          <div className="space-y-6">
            <h1 className="font-display text-xl font-bold text-[#111113]">
              Manajemen Jasa & Biaya Pengiriman
            </h1>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiRequest('/api/admin/shipping', {
                  method: 'POST',
                  body: JSON.stringify(newShipping),
                });
                setNewShipping({
                  serviceName: '',
                  cost: 25000,
                  eta: '2–3 Hari Kerja',
                  originCity: 'Jakarta Selatan',
                });
                notifyOk('Layanan pengiriman ditambahkan.');
                await loadTabData();
                await onStorefrontRefresh();
              }}
              className="bg-white border border-zinc-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Nama Jasa Kirim
                </label>
                <input
                  type="text"
                  required
                  value={newShipping.serviceName}
                  onChange={(e) =>
                    setNewShipping({ ...newShipping, serviceName: e.target.value })
                  }
                  placeholder="Cth: AnterAja Express"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Ongkos Kirim (Rp)
                </label>
                <input
                  type="number"
                  required
                  value={newShipping.cost}
                  onChange={(e) =>
                    setNewShipping({ ...newShipping, cost: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Estimasi Waktu
                </label>
                <input
                  type="text"
                  required
                  value={newShipping.eta}
                  onChange={(e) => setNewShipping({ ...newShipping, eta: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
              </div>
              <button
                type="submit"
                className="py-2 px-4 bg-[#111113] text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Tambah Layanan
              </button>
            </form>

            <div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-100">
              {shippingOptions.map((s) => (
                <div key={s.id} className="p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div>
                    <p className="font-semibold text-[#111113] text-sm">{s.serviceName}</p>
                    <p className="text-zinc-500">
                      Estimasi {s.eta} · Asal {s.originCity}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-sm tabular-nums">{formatIDR(s.cost)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmDelete({ kind: 'shipping', id: s.id, label: s.serviceName })
                      }
                      className="text-red-600 font-semibold hover:underline cursor-pointer"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== F. CUSTOMERS MANAGEMENT ==================== */}
        {activeTab === 'customers' && (
          <div className="space-y-4">
            <h1 className="font-display text-xl font-bold text-[#111113]">
              Daftar Pelanggan ({customers.length})
            </h1>
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
                    <tr>
                      <th className="py-3 px-4">Pelanggan</th>
                      <th className="py-3 px-4">Kontak</th>
                      <th className="py-3 px-4 text-right">Pesanan</th>
                      <th className="py-3 px-4 text-right">Total Belanja</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {customers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-zinc-500">
                          Belum ada pelanggan terdaftar.
                        </td>
                      </tr>
                    ) : (
                      customers.map((c) => (
                        <tr key={c.id}>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-[#111113]">{c.name}</p>
                            <p className="text-[11px] text-zinc-500">{c.email}</p>
                          </td>
                          <td className="py-3 px-4">{c.phone || '-'}</td>
                          <td className="py-3 px-4 text-right tabular-nums">{c.ordersCount || 0}</td>
                          <td className="py-3 px-4 text-right font-semibold tabular-nums">
                            {formatIDR(c.totalSpent || 0)}
                          </td>
                          <td className="py-3 px-4">{c.status}</td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={async () => {
                                await apiRequest(`/api/admin/customers/${c.id}/status`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({
                                    status: c.status === 'active' ? 'suspended' : 'active',
                                  }),
                                });
                                await loadTabData();
                              }}
                              className="text-[#2563EB] font-semibold hover:underline cursor-pointer"
                            >
                              {c.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== G. STAFF & FLEXIBLE RBAC MANAGEMENT ==================== */}
        {activeTab === 'staff' && (
          <div className="space-y-6">
            <h1 className="font-display text-xl font-bold text-[#111113]">
              Manajemen Staf & Hak Akses Fleksibel (RBAC)
            </h1>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiRequest('/api/admin/staff', {
                  method: 'POST',
                  body: JSON.stringify(newStaff),
                });
                setNewStaff({
                  name: '',
                  email: '',
                  phone: '',
                  password: '',
                  role: 'staff',
                  permissions: ['overview', 'orders', 'products'],
                });
                notifyOk('Akun staf baru berhasil dibuat.');
                await loadTabData();
              }}
              className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
            >
              <h2 className="font-display text-base font-bold text-[#111113]">
                Tambah Staf / Operator Baru
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Nama staf"
                  value={newStaff.name}
                  onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
                <input
                  type="email"
                  required
                  placeholder="Email staf"
                  value={newStaff.email}
                  onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Password awal"
                  value={newStaff.password}
                  onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
                <select
                  value={newStaff.role}
                  onChange={(e) =>
                    setNewStaff({ ...newStaff, role: e.target.value as 'staff' | 'admin' })
                  }
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-xs bg-white"
                >
                  <option value="staff">Staf (Izin Kustom)</option>
                  <option value="admin">Administrator Penuh</option>
                </select>
              </div>

              {newStaff.role === 'staff' && (
                <div className="flex flex-wrap gap-3 pt-1">
                  {ALL_ADMIN_PERMISSIONS.map((perm) => {
                    const checked = newStaff.permissions.includes(perm);
                    return (
                      <label key={perm} className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...newStaff.permissions, perm]
                              : newStaff.permissions.filter((p) => p !== perm);
                            setNewStaff({ ...newStaff, permissions: next });
                          }}
                        />
                        <span>{PERMISSION_LABELS[perm]}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <button
                type="submit"
                className="px-4 py-2 bg-[#111113] text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Buat Akun Staf
              </button>
            </form>

            <div className="space-y-3">
              {staffList.map((st) => (
                <div
                  key={st.id}
                  className="bg-white border border-zinc-200 rounded-xl p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#111113]">
                        {st.name} ·{' '}
                        <span className="text-[#2563EB] uppercase text-xs">{st.role}</span>
                      </p>
                      <p className="text-xs text-zinc-500">{st.email}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/admin/staff/${st.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                              role: st.role,
                              permissions: st.permissions,
                              status: st.status === 'active' ? 'suspended' : 'active',
                            }),
                          });
                          await loadTabData();
                        }}
                        className="px-3 py-1.5 border border-zinc-300 rounded-lg font-semibold cursor-pointer"
                      >
                        {st.status === 'active' ? 'Aktif (Nonaktifkan)' : 'Nonaktif (Aktifkan)'}
                      </button>
                    </div>
                  </div>

                  {st.role === 'staff' && (
                    <div className="flex flex-wrap gap-3 pt-2 border-t border-zinc-100">
                      {ALL_ADMIN_PERMISSIONS.map((perm) => {
                        const has = st.permissions.includes(perm);
                        return (
                          <label key={perm} className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={has}
                              onChange={async (e) => {
                                const nextPerms = e.target.checked
                                  ? [...st.permissions, perm]
                                  : st.permissions.filter((p) => p !== perm);
                                await apiRequest(`/api/admin/staff/${st.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({
                                    role: st.role,
                                    permissions: nextPerms,
                                    status: st.status,
                                  }),
                                });
                                notifyOk(`Hak akses ${st.name} diperbarui.`);
                                await loadTabData();
                              }}
                            />
                            <span>{PERMISSION_LABELS[perm]}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== H. WEBSITE SETTINGS ==================== */}
        {activeTab === 'settings' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiRequest('/api/admin/settings', {
                method: 'PUT',
                body: JSON.stringify(siteForm),
              });
              notifyOk('Pengaturan website berhasil disimpan dan langsung tayang.');
              await onStorefrontRefresh();
            }}
            className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5 max-w-4xl"
          >
            <h1 className="font-display text-xl font-bold text-[#111113]">
              Pengaturan Konten Website & Toko
            </h1>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Nama Toko</label>
                <input
                  type="text"
                  value={siteForm.storeName}
                  onChange={(e) => setSiteForm({ ...siteForm, storeName: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Nomor WhatsApp Resmi
                </label>
                <input
                  type="text"
                  value={siteForm.whatsappNumber}
                  onChange={(e) => setSiteForm({ ...siteForm, whatsappNumber: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Teks Pengumuman (Top Bar)
                </label>
                <input
                  type="text"
                  value={siteForm.announcementText}
                  onChange={(e) => setSiteForm({ ...siteForm, announcementText: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Judul Hero Homepage
                </label>
                <input
                  type="text"
                  value={siteForm.heroTitle}
                  onChange={(e) => setSiteForm({ ...siteForm, heroTitle: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Subjudul Hero Homepage
                </label>
                <textarea
                  rows={2}
                  value={siteForm.heroSubtitle}
                  onChange={(e) => setSiteForm({ ...siteForm, heroSubtitle: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Teks Tombol Hero (CTA)
                </label>
                <input
                  type="text"
                  value={siteForm.heroCta}
                  onChange={(e) => setSiteForm({ ...siteForm, heroCta: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2 p-4 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-[#111113]">
                      Gambar Hero Banner Utama
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Unggah foto langsung atau tempel URL gambar untuk mengganti foto utama halaman depan.
                    </p>
                  </div>
                  <label className="px-3.5 py-2 bg-white border border-zinc-300 hover:border-[#111113] rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Unggah Foto Hero</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setCropSession({
                          file,
                          title: 'Crop Foto Hero Banner Utama',
                          defaultPreset: '4:3',
                          onUploaded: (url) => {
                            setSiteForm((prev) => ({ ...prev, heroImage: url }));
                            notifyOk('Foto Hero berhasil dicrop & diunggah. Klik Simpan Pengaturan Website untuk menayangkan.');
                          },
                        });
                      }}
                    />
                  </label>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  {siteForm.heroImage && (
                    <img
                      src={siteForm.heroImage}
                      alt="Preview Hero Banner"
                      className="w-32 h-24 object-cover rounded-lg border border-zinc-200 bg-white shrink-0"
                    />
                  )}
                  <input
                    type="text"
                    value={siteForm.heroImage}
                    onChange={(e) => setSiteForm({ ...siteForm, heroImage: e.target.value })}
                    placeholder="URL atau path gambar hero (/uploads/...)"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Judul Banner Promo
                </label>
                <input
                  type="text"
                  value={siteForm.promoTitle}
                  onChange={(e) => setSiteForm({ ...siteForm, promoTitle: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Teks Tombol Promo (CTA)
                </label>
                <input
                  type="text"
                  value={siteForm.promoCta}
                  onChange={(e) => setSiteForm({ ...siteForm, promoCta: e.target.value })}
                  placeholder="Belanja Koleksi Promo"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Subjudul / Deskripsi Banner Promo
                </label>
                <textarea
                  rows={3}
                  value={siteForm.promoSubtitle}
                  onChange={(e) => setSiteForm({ ...siteForm, promoSubtitle: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2 p-4 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-[#111113]">
                      Gambar Banner Promo Capsule
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Unggah foto landscape atau tempel URL gambar untuk latar banner promo di beranda.
                    </p>
                  </div>
                  <label className="px-3.5 py-2 bg-white border border-zinc-300 hover:border-[#111113] rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Unggah Foto Promo</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setCropSession({
                          file,
                          title: 'Crop Foto Banner Promo',
                          defaultPreset: '21:9',
                          onUploaded: (url) => {
                            setSiteForm((prev) => ({ ...prev, promoImage: url }));
                            notifyOk('Foto Banner Promo berhasil dicrop & diunggah. Klik Simpan Pengaturan Website untuk menayangkan.');
                          },
                        });
                      }}
                    />
                  </label>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  {siteForm.promoImage && (
                    <img
                      src={siteForm.promoImage}
                      alt="Preview Banner Promo"
                      className="w-40 h-20 object-cover rounded-lg border border-zinc-200 bg-white shrink-0"
                    />
                  )}
                  <input
                    type="text"
                    value={siteForm.promoImage}
                    onChange={(e) => setSiteForm({ ...siteForm, promoImage: e.target.value })}
                    placeholder="URL atau path gambar promo (/uploads/...)"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Email Kontak</label>
                <input
                  type="email"
                  value={siteForm.contactEmail}
                  onChange={(e) => setSiteForm({ ...siteForm, contactEmail: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Link Instagram</label>
                <input
                  type="text"
                  value={siteForm.instagramUrl}
                  onChange={(e) => setSiteForm({ ...siteForm, instagramUrl: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Tentang Kami (About Us)
                </label>
                <textarea
                  rows={3}
                  value={siteForm.aboutStory}
                  onChange={(e) => setSiteForm({ ...siteForm, aboutStory: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Kebijakan Privasi
                </label>
                <textarea
                  rows={2}
                  value={siteForm.privacyPolicy}
                  onChange={(e) => setSiteForm({ ...siteForm, privacyPolicy: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Syarat & Ketentuan
                </label>
                <textarea
                  rows={2}
                  value={siteForm.termsConditions}
                  onChange={(e) => setSiteForm({ ...siteForm, termsConditions: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Kebijakan Pengembalian Barang
                </label>
                <textarea
                  rows={2}
                  value={siteForm.returnPolicy}
                  onChange={(e) => setSiteForm({ ...siteForm, returnPolicy: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              className="px-6 py-2.5 bg-[#111113] text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              Simpan Pengaturan Website
            </button>
          </form>
        )}
      </main>

      {/* ==================== MODAL: EDIT / ADD PRODUCT ==================== */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveProduct}
            className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <h2 className="font-display text-lg font-bold text-[#111113]">
                {editingProduct.id ? 'Edit Produk' : 'Tambah Produk Baru'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                aria-label="Tutup form produk"
                className="p-1.5 text-zinc-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 mb-1">Nama Produk</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Kategori</label>
                <select
                  value={editingProduct.categoryId || categories[0]?.id || 1}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, categoryId: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm bg-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Status</label>
                <select
                  value={editingProduct.status || 'active'}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      status: e.target.value as Product['status'],
                    })
                  }
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="active">Aktif (Tersedia)</option>
                  <option value="out_of_stock">Stok Habis</option>
                  <option value="draft">Draft (Tersembunyi)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Harga Normal (Rp)
                </label>
                <input
                  type="number"
                  required
                  value={editingProduct.price || 0}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, price: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Harga Diskon (Opsional)
                </label>
                <input
                  type="number"
                  value={editingProduct.discountPrice ?? ''}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      discountPrice: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  placeholder="Kosongkan jika tidak diskon"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Stok Barang</label>
                <input
                  type="number"
                  required
                  value={editingProduct.stock ?? 0}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Material</label>
                <input
                  type="text"
                  value={editingProduct.material || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, material: e.target.value })
                  }
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 mb-1">Deskripsi</label>
                <textarea
                  rows={3}
                  value={editingProduct.description || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, description: e.target.value })
                  }
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="sm:col-span-2 flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingProduct.isNewArrival)}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, isNewArrival: e.target.checked })
                    }
                  />
                  <span>Tandai New Arrival</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingProduct.isBestSeller)}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, isBestSeller: e.target.checked })
                    }
                  />
                  <span>Tandai Best Seller</span>
                </label>
              </div>

              {/* Editor Varian Ukuran & Warna Sebelum Upload */}
              <div className="sm:col-span-2 p-4 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-[#111113]">
                      Edit Pilihan Ukuran ({(editingProduct.sizes || []).length} dipilih)
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      Klik ukuran untuk mengaktifkan / menonaktifkan
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_PRODUCT_SIZES.map((sz) => {
                      const active = (editingProduct.sizes || []).includes(sz);
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => toggleProductSize(sz)}
                          className={`min-w-[44px] h-9 px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#111113] text-white border-[#111113]'
                              : 'bg-white text-zinc-700 border-zinc-300 hover:border-[#111113]'
                          }`}
                        >
                          {sz}
                        </button>
                      );
                    })}
                    {(editingProduct.sizes || [])
                      .filter((sz) => !PRESET_PRODUCT_SIZES.includes(sz))
                      .map((customSz) => (
                        <span
                          key={customSz}
                          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-[#111113] text-white border border-[#111113]"
                        >
                          <span>{customSz}</span>
                          <button
                            type="button"
                            onClick={() => toggleProductSize(customSz)}
                            aria-label={`Hapus ukuran ${customSz}`}
                            className="text-zinc-300 hover:text-white cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={customSizeInput}
                      onChange={(e) => setCustomSizeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomProductSize();
                        }
                      }}
                      placeholder="Tambah ukuran kustom (mis. 28, 30, 32, All Size)"
                      className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={addCustomProductSize}
                      className="px-3 py-1.5 rounded-lg bg-white border border-zinc-300 hover:border-[#111113] text-xs font-semibold text-[#111113] cursor-pointer shrink-0"
                    >
                      + Tambah Ukuran
                    </button>
                  </div>
                </div>

                <div className="border-t border-zinc-200 pt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-[#111113]">
                      Edit Pilihan Warna ({(editingProduct.colors || []).length} dipilih)
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      Pilih warna cepat atau tambah nama warna baru
                    </span>
                  </div>
                  {(editingProduct.colors || []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {(editingProduct.colors || []).map((clr) => (
                        <span
                          key={clr}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#2563EB] text-[#2563EB]"
                        >
                          <span>{clr}</span>
                          <button
                            type="button"
                            onClick={() => toggleProductColor(clr)}
                            aria-label={`Hapus warna ${clr}`}
                            className="text-[#2563EB] hover:text-red-600 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_PRODUCT_COLORS.map((clr) => {
                      const active = (editingProduct.colors || []).some(
                        (c) => c.toLowerCase() === clr.toLowerCase()
                      );
                      return (
                        <button
                          key={clr}
                          type="button"
                          onClick={() => toggleProductColor(clr)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#111113] text-white border-[#111113]'
                              : 'bg-white text-zinc-600 border-zinc-300 hover:border-[#111113]'
                          }`}
                        >
                          {active ? `✓ ${clr}` : `+ ${clr}`}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={customColorInput}
                      onChange={(e) => setCustomColorInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomProductColor();
                        }
                      }}
                      placeholder="Tambah warna kustom (mis. Mocha Brown, Ash Grey)"
                      className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={addCustomProductColor}
                      className="px-3 py-1.5 rounded-lg bg-white border border-zinc-300 hover:border-[#111113] text-xs font-semibold text-[#111113] cursor-pointer shrink-0"
                    >
                      + Tambah Warna
                    </button>
                  </div>
                </div>
              </div>

              <div className="sm:col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-700">Foto Produk</label>
                  <label className="px-3 py-1.5 bg-zinc-100 border border-zinc-300 rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Unggah Foto</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setCropSession({
                          file,
                          title: 'Crop Foto Produk',
                          defaultPreset: '4:3',
                          onUploaded: (url) => {
                            setEditingProduct((prev) =>
                              prev
                                ? { ...prev, images: [...(prev.images || []), url] }
                                : prev
                            );
                            notifyOk('Foto produk berhasil dicrop & ditambahkan.');
                          },
                        });
                      }}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(editingProduct.images || []).map((img, idx) => (
                    <div key={`${img}-${idx}`} className="relative w-20 h-16 rounded-lg overflow-hidden border border-zinc-200">
                      <img src={img} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() =>
                          setEditingProduct({
                            ...editingProduct,
                            images: (editingProduct.images || []).filter((_, i) => i !== idx),
                          })
                        }
                        aria-label="Hapus foto produk"
                        className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2 border border-zinc-300 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#111113] text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Simpan Produk
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== MODAL: ORDER DETAIL & QRIS VERIFICATION ==================== */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 space-y-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div>
                <h2 className="font-display text-lg font-bold text-[#111113]">
                  Detail Pesanan {selectedOrder.orderNumber}
                </h2>
                <p className="text-xs text-zinc-500">
                  {selectedOrder.recipientName} · {selectedOrder.recipientPhone} ·{' '}
                  {selectedOrder.shippingAddress}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                aria-label="Tutup detail pesanan"
                className="p-1.5 text-zinc-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Payment Proof & Verification */}
              <div className="space-y-4 border border-zinc-200 rounded-xl p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#111113]">
                    {selectedOrder.paymentMethodName} ({selectedOrder.paymentStatus})
                  </span>
                  <span className="font-bold text-sm tabular-nums">
                    {formatIDR(selectedOrder.totalAmount)}
                  </span>
                </div>

                {selectedOrder.paymentProofUrl ? (
                  <img
                    src={selectedOrder.paymentProofUrl}
                    alt="Bukti pembayaran pelanggan"
                    className="w-full max-h-56 object-contain rounded-lg border border-zinc-200 bg-zinc-50"
                  />
                ) : (
                  <div className="p-6 text-center text-xs text-zinc-500 bg-zinc-50 rounded-lg border border-zinc-200">
                    Pelanggan belum mengunggah bukti transfer.
                  </div>
                )}

                {selectedOrder.paymentStatus !== 'paid' && (
                  <div className="space-y-2 pt-2">
                    <input
                      type="text"
                      placeholder="Alasan jika menolak pembayaran (opsional)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleVerifyPayment(selectedOrder.id, true)}
                        className="flex-1 py-2.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>Terima & Verifikasi Pembayaran</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVerifyPayment(selectedOrder.id, false)}
                        className="py-2.5 px-4 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 cursor-pointer"
                      >
                        Tolak
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Shipping Status & Live Map Position Update */}
              <form
                onSubmit={handleUpdateOrderTracking}
                className="space-y-3 border border-zinc-200 rounded-xl p-4"
              >
                <h3 className="text-sm font-bold text-[#111113] flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[#2563EB]" />
                  <span>Update Status, Resi & Lokasi Kurir Live</span>
                </h3>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Status Pesanan
                  </label>
                  <select
                    value={orderStatusInput}
                    onChange={(e) => setOrderStatusInput(e.target.value as OrderStatus)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs bg-white"
                  >
                    {ORDER_STATUS_SEQUENCE.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Nomor Resi Pengiriman
                  </label>
                  <input
                    type="text"
                    value={orderResiInput}
                    onChange={(e) => setOrderResiInput(e.target.value)}
                    placeholder="Cth: JNE882910291"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Label Lokasi Kurir Saat Ini
                  </label>
                  <input
                    type="text"
                    value={orderLocationInput}
                    onChange={(e) => setOrderLocationInput(e.target.value)}
                    placeholder="Cth: Hub Sortir Jakarta Pusat"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-zinc-700 mb-1">
                    <span>Progres Rute di Peta</span>
                    <span className="font-mono tabular-nums">{orderProgressInput}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={10}
                    value={orderProgressInput}
                    onChange={(e) => setOrderProgressInput(Number(e.target.value))}
                    className="w-full accent-[#2563EB]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#111113] text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
                >
                  Simpan & Kirim Update Real-Time
                </button>
              </form>
            </div>

            <OrderTrackingMap order={selectedOrder} />
          </div>
        </div>
      )}

      {/* ==================== MODAL: CONFIRM DELETE ==================== */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              <h2 className="font-display text-base font-bold text-[#111113]">
                Konfirmasi Penghapusan
              </h2>
            </div>
            <p className="text-xs text-zinc-600">
              Apakah Anda yakin ingin menghapus <strong>{confirmDelete.label}</strong>? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 border border-zinc-300 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmedDelete}
                className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {cropSession && (
        <ImageCropModal
          file={cropSession.file}
          title={cropSession.title}
          defaultPreset={cropSession.defaultPreset}
          onCancel={() => setCropSession(null)}
          onConfirm={async (processedFile) => {
            const url = await uploadImageFile(processedFile);
            cropSession.onUploaded(url);
            setCropSession(null);
          }}
        />
      )}
    </div>
  );
}
