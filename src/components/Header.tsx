import { Bell, Search, ShoppingBag, User as UserIcon, X } from 'lucide-react';
import type { User, WebsiteSettings } from '../types.ts';

export type AppRoute =
  | { page: 'home' }
  | { page: 'shop'; category?: string; search?: string }
  | { page: 'categories' }
  | { page: 'product'; productId: number }
  | { page: 'wishlist' }
  | { page: 'cart' }
  | { page: 'checkout' }
  | { page: 'payment-confirmation'; orderNumber: string }
  | { page: 'login' }
  | { page: 'register' }
  | { page: 'account'; tab?: 'profile' | 'orders' | 'tracking' | 'wishlist' | 'notifications'; orderNumber?: string }
  | { page: 'contact' }
  | { page: 'about' }
  | { page: 'policy'; kind: 'privacy' | 'terms' | 'returns' }
  | { page: 'admin'; tab?: string };

interface HeaderProps {
  settings: WebsiteSettings;
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  cartCount: number;
  unreadNotifications: number;
  user: User | null;
  searchOpen: boolean;
  searchQuery: string;
  onToggleSearch: () => void;
  onSearchChange: (q: string) => void;
  onSearchSubmit: () => void;
  onOpenCartDrawer: () => void;
  announcementDismissed: boolean;
  onDismissAnnouncement: () => void;
}

export function Header({
  settings,
  route,
  onNavigate,
  cartCount,
  unreadNotifications,
  user,
  searchOpen,
  searchQuery,
  onToggleSearch,
  onSearchChange,
  onSearchSubmit,
  onOpenCartDrawer,
  announcementDismissed,
  onDismissAnnouncement,
}: HeaderProps) {
  const navItems: Array<{ label: string; active: boolean; target: AppRoute }> = [
    { label: 'Home', active: route.page === 'home', target: { page: 'home' } },
    { label: 'Shop', active: route.page === 'shop', target: { page: 'shop' } },
    { label: 'Categories', active: route.page === 'categories', target: { page: 'categories' } },
    { label: 'Wishlist', active: route.page === 'wishlist', target: { page: 'wishlist' } },
    {
      label: 'Account',
      active: route.page === 'account' || route.page === 'login' || route.page === 'register',
      target: user ? { page: 'account', tab: 'profile' } : { page: 'login' },
    },
  ];

  return (
    <div className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-zinc-200">
      {!announcementDismissed && settings.announcementText && (
        <div className="bg-[#111113] text-white text-xs py-2 px-4 flex items-center justify-center relative">
          <p className="truncate max-w-3xl text-center px-8">{settings.announcementText}</p>
          <button
            type="button"
            onClick={onDismissAnnouncement}
            aria-label="Tutup pengumuman"
            className="absolute right-3 p-1 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (5 single-line links) — Zone 3 (Icon Actions) */}
      <header className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => onNavigate({ page: 'home' })}
          className="font-display text-xl font-bold tracking-tight text-[#111113] whitespace-nowrap shrink-0 cursor-pointer"
        >
          {settings.storeName || 'elchapo.clg'}
        </button>

        <nav
          aria-label="Navigasi utama"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600"
        >
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => onNavigate(item.target)}
              className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer border-b-2 ${
                item.active
                  ? 'text-[#111113] border-[#2563EB]'
                  : 'border-transparent hover:text-[#111113] hover:border-zinc-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleSearch}
            aria-label="Cari produk"
            className="p-2.5 rounded-lg text-zinc-700 hover:text-[#111113] hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <Search className="w-5 h-5" />
          </button>

          {user && (
            <button
              type="button"
              onClick={() => onNavigate({ page: 'account', tab: 'notifications' })}
              aria-label={`Notifikasi (${unreadNotifications} belum dibaca)`}
              className="relative p-2.5 rounded-lg text-zinc-700 hover:text-[#111113] hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <Bell className="w-5 h-5" />
              {unreadNotifications > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#2563EB] text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                  {unreadNotifications}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onOpenCartDrawer}
            aria-label={`Keranjang belanja (${cartCount} item)`}
            className="relative p-2.5 rounded-lg text-zinc-700 hover:text-[#111113] hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span
                data-testid="cart-badge"
                className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#111113] text-white text-[10px] font-semibold flex items-center justify-center tabular-nums"
              >
                {cartCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              onNavigate(user ? { page: 'account', tab: 'profile' } : { page: 'login' })
            }
            aria-label={user ? `Akun ${user.name}` : 'Masuk ke akun'}
            className="p-2.5 rounded-lg text-zinc-700 hover:text-[#111113] hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <UserIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="border-t border-zinc-200 bg-[#FAFAFA] px-4 sm:px-6 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSearchSubmit();
            }}
            className="max-w-3xl mx-auto flex items-center gap-2"
          >
            <label htmlFor="header-search-input" className="sr-only">
              Cari produk elchapo.clg
            </label>
            <input
              id="header-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Cari kaos boxy, hoodie 480gsm, jaket, celana kargo..."
              autoFocus
              className="flex-1 bg-white border border-zinc-300 rounded-lg px-4 py-2 text-sm text-[#111113] focus:outline-none focus:border-[#2563EB]"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#111113] text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cari
            </button>
            <button
              type="button"
              onClick={onToggleSearch}
              aria-label="Tutup pencarian"
              className="p-2 text-zinc-500 hover:text-zinc-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
