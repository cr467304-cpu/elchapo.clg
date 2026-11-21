import { useEffect, useState } from 'react';
import {
  Bell,
  Download,
  FileSpreadsheet,
  Heart,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import type {
  AppNotification,
  Order,
  Product,
  User,
} from '../types.ts';
import { apiRequest } from '../utils/api.ts';
import { formatIDR, formatWhatsAppUrl } from '../utils/commerce.ts';
import { exportOrdersToExcel, exportOrdersToPdf } from '../utils/export.ts';
import { OrderTrackingMap } from './OrderTrackingMap.tsx';
import { ProductCard } from './ProductCard.tsx';

interface AuthViewProps {
  mode: 'login' | 'register';
  onSuccess: (user: User, token: string) => void;
  onSwitchMode: (mode: 'login' | 'register') => void;
}

export function AuthView({ mode, onSuccess, onSwitchMode }: AuthViewProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') {
        const res = await apiRequest<{ user: User; token: string }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, phone, address, password }),
        });
        onSuccess(res.user, res.token);
      } else {
        const res = await apiRequest<{ user: User; token: string }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        onSuccess(res.user, res.token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Autentikasi gagal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14 pb-24">
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-8 space-y-6">
        <div>
          <p className="text-xs font-semibold text-[#2563EB]">elchapo.clg</p>
          <h1 className="font-display text-2xl font-bold text-[#111113] mt-1">
            {mode === 'login' ? 'Masuk ke Akun Anda' : 'Daftar Akun Baru'}
          </h1>
          <p className="text-sm text-zinc-600 mt-1">
            {mode === 'login'
              ? 'Kelola pesanan, wishlist, dan pantau pengiriman secara real-time.'
              : 'Buat akun pelanggan untuk berbelanja cepat dan menyimpan wishlist.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label htmlFor="auth-name" className="block text-xs font-medium text-zinc-700 mb-1">
                  Nama Lengkap
                </label>
                <input
                  id="auth-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama lengkap Anda"
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label htmlFor="auth-phone" className="block text-xs font-medium text-zinc-700 mb-1">
                  Nomor WhatsApp / Telepon
                </label>
                <input
                  id="auth-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="085647441648"
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label htmlFor="auth-address" className="block text-xs font-medium text-zinc-700 mb-1">
                  Alamat Pengiriman Utama
                </label>
                <input
                  id="auth-address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Alamat jalan, kecamatan, kota"
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-medium text-zinc-700 mb-1">
              Alamat Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-xs font-medium text-zinc-700 mb-1">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-[#111113] text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
          >
            {loading
              ? 'Memproses...'
              : mode === 'login'
              ? 'Masuk Sekarang'
              : 'Daftar Akun'}
          </button>
        </form>

        <div className="pt-4 border-t border-zinc-200 text-center text-xs text-zinc-600">
          {mode === 'login' ? (
            <>
              Belum punya akun?{' '}
              <button
                type="button"
                onClick={() => onSwitchMode('register')}
                className="font-semibold text-[#2563EB] hover:underline cursor-pointer"
              >
                Daftar di sini
              </button>
            </>
          ) : (
            <>
              Sudah memiliki akun?{' '}
              <button
                type="button"
                onClick={() => onSwitchMode('login')}
                className="font-semibold text-[#2563EB] hover:underline cursor-pointer"
              >
                Masuk di sini
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface AccountViewProps {
  user: User;
  initialTab?: 'profile' | 'orders' | 'tracking' | 'wishlist' | 'notifications';
  initialOrderNumber?: string;
  orders: Order[];
  wishlistProducts: Product[];
  wishlistIds: number[];
  notifications: AppNotification[];
  storeWhatsApp: string;
  onUserUpdated: (u: User) => void;
  onLogout: () => void;
  onSelectProduct: (id: number) => void;
  onToggleWishlist: (id: number) => void;
  onGoToPayment: (orderNumber: string) => void;
  onMarkNotificationsRead: () => void;
  onOpenAdmin: () => void;
}

export function AccountView({
  user,
  initialTab = 'profile',
  initialOrderNumber,
  orders,
  wishlistProducts,
  wishlistIds,
  notifications,
  storeWhatsApp,
  onUserUpdated,
  onLogout,
  onSelectProduct,
  onToggleWishlist,
  onGoToPayment,
  onMarkNotificationsRead,
  onOpenAdmin,
}: AccountViewProps) {
  const [tab, setTab] = useState<'profile' | 'orders' | 'tracking' | 'wishlist' | 'notifications'>(
    initialTab
  );
  const [trackedOrderNumber, setTrackedOrderNumber] = useState<string>(
    initialOrderNumber || orders[0]?.orderNumber || ''
  );

  // Profile form
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [address, setAddress] = useState(user.address);
  const [city, setCity] = useState(user.city);
  const [postalCode, setPostalCode] = useState(user.postalCode);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');

  // Push Notification permission state
  const [pushStatus, setPushStatus] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (initialOrderNumber) {
      setTrackedOrderNumber(initialOrderNumber);
    } else if (!trackedOrderNumber && orders[0]) {
      setTrackedOrderNumber(orders[0].orderNumber);
    }
  }, [initialOrderNumber, orders, trackedOrderNumber]);

  const trackedOrder =
    orders.find((o) => o.orderNumber === trackedOrderNumber) || orders[0] || null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileErr('');
    try {
      const res = await apiRequest<{ user: User }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ name, phone, address, city, postalCode }),
      });
      onUserUpdated(res.user);
      setProfileMsg('Profil dan alamat pengiriman berhasil diperbarui.');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Gagal memperbarui profil.');
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg('');
    setPwdErr('');
    try {
      await apiRequest('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setPwdMsg('Password berhasil diubah.');
    } catch (err) {
      setPwdErr(err instanceof Error ? err.message : 'Gagal mengubah password.');
    }
  };

  const requestPushPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setPushStatus(perm);
  };

  const tabs: Array<{ id: typeof tab; label: string; icon: typeof UserIcon }> = [
    { id: 'profile', label: 'Profil & Alamat', icon: UserIcon },
    { id: 'orders', label: 'Riwayat Pesanan', icon: Package },
    { id: 'tracking', label: 'Lacak Real-Time', icon: MapPin },
    { id: 'wishlist', label: 'Wishlist', icon: Heart },
    { id: 'notifications', label: 'Notifikasi', icon: Bell },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#111113]">
            Halo, {user.name}
          </h1>
          <p className="text-sm text-zinc-600 mt-1">
            {user.email} · {user.role === 'admin' ? 'Administrator' : user.role === 'staff' ? 'Staf Toko' : 'Pelanggan Terdaftar'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {(user.role === 'admin' || user.role === 'staff') && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="px-4 py-2 bg-[#2563EB] text-white text-xs font-semibold rounded-lg hover:bg-blue-700 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Buka Dashboard Admin</span>
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="px-4 py-2 bg-white border border-zinc-300 text-zinc-700 text-xs font-semibold rounded-lg hover:bg-zinc-50 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </div>

      {/* Segmented Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                if (t.id === 'notifications') onMarkNotificationsRead();
              }}
              className={`px-4 py-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                active
                  ? 'bg-[#111113] text-white border-[#111113]'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <form
            onSubmit={handleSaveProfile}
            className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-[#111113]">
              Profil & Alamat Pengiriman
            </h2>
            <div>
              <label htmlFor="prof-name" className="block text-xs font-medium text-zinc-700 mb-1">
                Nama Lengkap
              </label>
              <input
                id="prof-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="prof-phone" className="block text-xs font-medium text-zinc-700 mb-1">
                Nomor Telepon / WhatsApp
              </label>
              <input
                id="prof-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="prof-addr" className="block text-xs font-medium text-zinc-700 mb-1">
                Alamat Lengkap
              </label>
              <textarea
                id="prof-addr"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="prof-city" className="block text-xs font-medium text-zinc-700 mb-1">
                  Kota
                </label>
                <input
                  id="prof-city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="prof-postal" className="block text-xs font-medium text-zinc-700 mb-1">
                  Kode Pos
                </label>
                <input
                  id="prof-postal"
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2 text-sm"
                />
              </div>
            </div>
            {profileErr && <p className="text-xs text-red-600">{profileErr}</p>}
            {profileMsg && <p className="text-xs text-emerald-700">{profileMsg}</p>}
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#111113] text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              Simpan Perubahan
            </button>
          </form>

          <form
            onSubmit={handleSavePassword}
            className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4 h-fit"
          >
            <h2 className="font-display text-lg font-bold text-[#111113]">
              Ubah Password
            </h2>
            <div>
              <label htmlFor="pwd-current" className="block text-xs font-medium text-zinc-700 mb-1">
                Password Saat Ini
              </label>
              <input
                id="pwd-current"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="pwd-new" className="block text-xs font-medium text-zinc-700 mb-1">
                Password Baru (minimal 6 karakter)
              </label>
              <input
                id="pwd-new"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2 text-sm"
              />
            </div>
            {pwdErr && <p className="text-xs text-red-600">{pwdErr}</p>}
            {pwdMsg && <p className="text-xs text-emerald-700">{pwdMsg}</p>}
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#111113] text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              Perbarui Password
            </button>
          </form>
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#111113]">
                Riwayat Transaksi & Pesanan
              </h2>
              <p className="text-xs text-zinc-500">
                Unduh laporan transaksi Anda kapan saja dalam format PDF atau Excel.
              </p>
            </div>
            {orders.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportOrdersToPdf(orders, 'elchapo.clg')}
                  className="px-3.5 py-2 bg-white border border-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportOrdersToExcel(orders, 'elchapo.clg')}
                  className="px-3.5 py-2 bg-white border border-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Unduh Excel</span>
                </button>
              </div>
            )}
          </div>

          {orders.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center text-sm text-zinc-500">
              Anda belum memiliki riwayat pesanan.
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3">
                    <div>
                      <span className="font-mono text-sm font-bold text-[#111113] tabular-nums">
                        {ord.orderNumber}
                      </span>
                      <span className="text-xs text-zinc-500 ml-3">
                        {new Date(ord.createdAt).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-semibold">
                      <span className="text-[#2563EB]">{ord.orderStatus}</span>
                      <span className="text-zinc-400">·</span>
                      <span className="text-[#111113] tabular-nums">
                        {formatIDR(ord.totalAmount)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {ord.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between text-xs text-zinc-700">
                        <span>
                          {it.productName} ({it.size}, {it.color}) × {it.quantity}
                        </span>
                        <span className="font-medium tabular-nums">{formatIDR(it.lineTotal)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-100 text-xs">
                    <span className="text-zinc-500">
                      Kurir: {ord.shippingService}
                      {ord.trackingNumber ? ` · Resi: ${ord.trackingNumber}` : ''}
                    </span>

                    <div className="flex items-center gap-2">
                      {(ord.paymentStatus === 'unpaid' || ord.paymentStatus === 'rejected') && (
                        <button
                          type="button"
                          onClick={() => onGoToPayment(ord.orderNumber)}
                          className="px-3 py-1.5 bg-[#2563EB] text-white font-semibold rounded-lg hover:bg-blue-700 cursor-pointer"
                        >
                          Bayar / Unggah Bukti
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setTrackedOrderNumber(ord.orderNumber);
                          setTab('tracking');
                        }}
                        className="px-3 py-1.5 bg-[#111113] text-white font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
                      >
                        Lacak Peta & Status
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'tracking' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[#111113]">
                Pelacakan Pesanan Real-Time & Peta Interaktif
              </h2>
              <p className="text-xs text-zinc-500">
                Status dan posisi kurir diperbarui langsung saat admin memproses pengiriman Anda.
              </p>
            </div>
            {orders.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="track-select" className="text-xs font-medium text-zinc-600">
                  Pilih Pesanan:
                </label>
                <select
                  id="track-select"
                  value={trackedOrder?.orderNumber || ''}
                  onChange={(e) => setTrackedOrderNumber(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-mono"
                >
                  {orders.map((o) => (
                    <option key={o.id} value={o.orderNumber}>
                      {o.orderNumber} — {o.orderStatus}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {!trackedOrder ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center text-sm text-zinc-500">
              Belum ada pesanan untuk dilacak.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
                <OrderTrackingMap order={trackedOrder} />
              </div>

              <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-[#111113]">
                      {trackedOrder.orderNumber}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {trackedOrder.shippingService}
                      {trackedOrder.trackingNumber
                        ? ` · Resi ${trackedOrder.trackingNumber}`
                        : ''}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-[#2563EB]">
                    {trackedOrder.orderStatus}
                  </span>
                </div>

                <ol className="space-y-4 border-l border-zinc-200 ml-2 pl-4">
                  {trackedOrder.trackingEvents.map((ev) => (
                    <li key={ev.id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#111113] border-2 border-white" />
                      <p className="text-xs font-semibold text-[#111113]">{ev.title}</p>
                      <p className="text-xs text-zinc-600 mt-0.5">{ev.description}</p>
                      <p className="text-[11px] text-zinc-400 mt-1 tabular-nums">
                        {ev.locationName} · {new Date(ev.createdAt).toLocaleString('id-ID')}
                      </p>
                    </li>
                  ))}
                </ol>

                <a
                  href={formatWhatsAppUrl(
                    storeWhatsApp,
                    `Halo admin elchapo.clg, saya ingin menanyakan status pesanan ${trackedOrder.orderNumber}.`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 inline-flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Hubungi CS WhatsApp ({storeWhatsApp})</span>
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'wishlist' && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-bold text-[#111113]">
            Produk Tersimpan di Wishlist
          </h2>
          {wishlistProducts.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center text-sm text-zinc-500">
              Belum ada produk di wishlist Anda.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {wishlistProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  isWishlisted={wishlistIds.includes(p.id)}
                  onToggleWishlist={onToggleWishlist}
                  onSelect={onSelectProduct}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'notifications' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-zinc-200 rounded-xl p-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#111113]">
                Pusat Notifikasi Real-Time (Push, Email & WhatsApp)
              </h2>
              <p className="text-xs text-zinc-500">
                Status push browser: <strong>{pushStatus}</strong>
              </p>
            </div>
            {pushStatus !== 'granted' && pushStatus !== 'unsupported' && (
              <button
                type="button"
                onClick={requestPushPermission}
                className="px-4 py-2 bg-[#2563EB] text-white text-xs font-semibold rounded-lg hover:bg-blue-700 cursor-pointer"
              >
                Aktifkan Push Notification
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center text-sm text-zinc-500">
              Belum ada notifikasi pesanan.
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span className="uppercase font-semibold text-[#2563EB]">{n.channel}</span>
                      <span>·</span>
                      <span className="tabular-nums">
                        {new Date(n.createdAt).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-[#111113]">{n.title}</p>
                    <p className="text-xs text-zinc-600">{n.message}</p>
                  </div>
                  {n.metadata?.whatsappUrl && (
                    <a
                      href={n.metadata.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Buka WhatsApp</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
