import { Heart, Home, Package, Search, User as UserIcon } from 'lucide-react';
import type { AppRoute } from './Header.tsx';
import type { User } from '../types.ts';

interface MobileNavProps {
  route: AppRoute;
  user: User | null;
  onNavigate: (route: AppRoute) => void;
}

export function MobileNav({ route, user, onNavigate }: MobileNavProps) {
  const items: Array<{
    label: string;
    icon: typeof Home;
    active: boolean;
    target: AppRoute;
  }> = [
    { label: 'Home', icon: Home, active: route.page === 'home', target: { page: 'home' } },
    { label: 'Shop', icon: Search, active: route.page === 'shop', target: { page: 'shop' } },
    { label: 'Wishlist', icon: Heart, active: route.page === 'wishlist', target: { page: 'wishlist' } },
    {
      label: 'Lacak',
      icon: Package,
      active: route.page === 'account' && route.tab === 'tracking',
      target: user ? { page: 'account', tab: 'tracking' } : { page: 'login' },
    },
    {
      label: 'Akun',
      icon: UserIcon,
      active:
        route.page === 'login' ||
        route.page === 'register' ||
        (route.page === 'account' && route.tab !== 'tracking'),
      target: user ? { page: 'account', tab: 'profile' } : { page: 'login' },
    },
  ];

  return (
    <nav
      aria-label="Navigasi seluler"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-white/95 backdrop-blur border-t border-zinc-200 flex items-center justify-around px-2"
    >
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <button
            key={it.label}
            type="button"
            onClick={() => onNavigate(it.target)}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] h-11 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
              it.active ? 'text-[#2563EB]' : 'text-zinc-600'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
