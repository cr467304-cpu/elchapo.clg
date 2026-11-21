import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Heart,
  Instagram,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { Category, Product, WebsiteSettings } from '../types.ts';
import { formatWhatsAppUrl, getEffectivePrice } from '../utils/commerce.ts';
import type { AppRoute } from './Header.tsx';
import { ProductCard } from './ProductCard.tsx';

interface HomeViewProps {
  settings: WebsiteSettings;
  categories: Category[];
  products: Product[];
  wishlistIds: number[];
  canEditPromo?: boolean;
  onSavePromoContent?: (patch: {
    promoTitle: string;
    promoSubtitle: string;
    promoCta: string;
  }) => Promise<void>;
  onNavigate: (route: AppRoute) => void;
  onSelectProduct: (id: number) => void;
  onToggleWishlist: (id: number) => void;
}

export function HomeView({
  settings,
  categories,
  products,
  wishlistIds,
  canEditPromo = false,
  onSavePromoContent,
  onNavigate,
  onSelectProduct,
  onToggleWishlist,
}: HomeViewProps) {
  const [editingPromo, setEditingPromo] = useState(false);
  const [promoTitleDraft, setPromoTitleDraft] = useState(settings.promoTitle);
  const [promoSubtitleDraft, setPromoSubtitleDraft] = useState(settings.promoSubtitle);
  const [promoCtaDraft, setPromoCtaDraft] = useState(settings.promoCta || 'Belanja Koleksi Promo');
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoError, setPromoError] = useState('');

  const newArrivals = products.filter((p) => p.isNewArrival).slice(0, 4);
  const bestSellers = products.filter((p) => p.isBestSeller).slice(0, 4);
  const allPreview = products.slice(0, 8);

  const openPromoEditor = () => {
    setPromoTitleDraft(settings.promoTitle);
    setPromoSubtitleDraft(settings.promoSubtitle);
    setPromoCtaDraft(settings.promoCta || 'Belanja Koleksi Promo');
    setPromoError('');
    setEditingPromo(true);
  };

  const handleSavePromoInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSavePromoContent) return;
    if (!promoTitleDraft.trim()) {
      setPromoError('Judul promo tidak boleh kosong.');
      return;
    }
    setPromoSaving(true);
    setPromoError('');
    try {
      await onSavePromoContent({
        promoTitle: promoTitleDraft.trim(),
        promoSubtitle: promoSubtitleDraft.trim(),
        promoCta: promoCtaDraft.trim() || 'Belanja Koleksi Promo',
      });
      setEditingPromo(false);
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : 'Gagal menyimpan teks promo.');
    } finally {
      setPromoSaving(false);
    }
  };

  return (
    <div className="space-y-16 pb-20">
      {/* Hero Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 rounded-2xl overflow-hidden border border-zinc-200 bg-white items-stretch">
          <div className="lg:col-span-5 p-8 sm:p-12 flex flex-col justify-between gap-8">
            <div className="space-y-4">
              <p className="text-xs font-semibold tracking-wider uppercase text-[#2563EB]">
                Koleksi Musim Terbaru · {settings.storeName}
              </p>
              <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-[#111113] leading-[1.08] text-balance">
                {settings.heroTitle}
              </h1>
              <p className="text-sm sm:text-base text-zinc-600 leading-relaxed max-w-md">
                {settings.heroSubtitle}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate({ page: 'shop' })}
                className="px-6 py-3 bg-[#111113] text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                <span>{settings.heroCta || 'Jelajahi Koleksi'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'categories' })}
                className="px-5 py-3 bg-white border border-zinc-300 text-[#111113] text-sm font-semibold rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                Lihat Kategori
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 min-h-[300px] lg:min-h-[480px] bg-zinc-100">
            <img
              src={settings.heroImage}
              alt="Kampanye streetwear terbaru elchapo.clg"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Categories Strip */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#111113]">
              Kategori Pilihan
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
              Jelajahi koleksi berdasarkan siluet dan kebutuhan harian Anda.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'categories' })}
            className="text-xs font-semibold text-[#2563EB] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            Semua Kategori
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onNavigate({ page: 'shop', category: cat.slug })}
              className="p-4 bg-white border border-zinc-200 rounded-xl text-left hover:border-[#111113] transition-colors cursor-pointer"
            >
              <p className="font-display text-sm font-semibold text-[#111113]">
                {cat.name}
              </p>
              <p className="text-xs text-zinc-500 mt-1 tabular-nums">
                {cat.productCount ?? 0} produk
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* New Arrivals */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#111113]">
              New Arrivals
            </h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              Rilisan terbaru dengan material katun dan nilon teknis pilihan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'shop' })}
            className="text-xs font-semibold text-[#111113] hover:text-[#2563EB] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Lihat Semua</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {newArrivals.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isWishlisted={wishlistIds.includes(p.id)}
              onToggleWishlist={onToggleWishlist}
              onSelect={onSelectProduct}
            />
          ))}
        </div>
      </section>

      {/* Editorial Promo Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="relative rounded-2xl overflow-hidden bg-[#111113] text-white min-h-[280px] flex items-end">
          <img
            src={settings.promoImage}
            alt={settings.promoTitle}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
          {canEditPromo && onSavePromoContent && (
            <button
              type="button"
              onClick={openPromoEditor}
              className="absolute top-4 right-4 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-[#111113] text-xs font-semibold hover:bg-white transition-colors shadow-sm cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit Teks Promo</span>
            </button>
          )}
          <div className="relative z-10 p-8 sm:p-12 max-w-2xl space-y-3">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-balance">
              {settings.promoTitle}
            </h2>
            <p className="text-sm text-zinc-200 leading-relaxed">
              {settings.promoSubtitle}
            </p>
            <button
              type="button"
              onClick={() => onNavigate({ page: 'shop' })}
              className="mt-2 px-5 py-2.5 bg-white text-[#111113] text-xs font-semibold rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              {settings.promoCta || 'Belanja Koleksi Promo'}
            </button>
          </div>
        </div>
      </section>

      {editingPromo && (
        <div
          className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-promo-text-title"
        >
          <form
            onSubmit={handleSavePromoInline}
            className="w-full max-w-lg bg-white rounded-2xl p-6 space-y-4 shadow-2xl border border-zinc-200"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div>
                <h3
                  id="edit-promo-text-title"
                  className="font-display text-lg font-bold text-[#111113]"
                >
                  Edit Teks Banner Promo
                </h3>
                <p className="text-xs text-zinc-500">
                  Perubahan langsung diperbarui di halaman beranda toko.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPromo(false)}
                aria-label="Tutup editor teks promo"
                className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-[#111113] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="inline-promo-title"
                  className="block text-xs font-medium text-zinc-700 mb-1"
                >
                  Judul Promo
                </label>
                <input
                  id="inline-promo-title"
                  type="text"
                  required
                  value={promoTitleDraft}
                  onChange={(e) => setPromoTitleDraft(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-[#111113] focus:outline-none focus:border-[#111113]"
                />
              </div>

              <div>
                <label
                  htmlFor="inline-promo-subtitle"
                  className="block text-xs font-medium text-zinc-700 mb-1"
                >
                  Subjudul / Deskripsi Promo
                </label>
                <textarea
                  id="inline-promo-subtitle"
                  rows={3}
                  value={promoSubtitleDraft}
                  onChange={(e) => setPromoSubtitleDraft(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-[#111113] focus:outline-none focus:border-[#111113]"
                />
              </div>

              <div>
                <label
                  htmlFor="inline-promo-cta"
                  className="block text-xs font-medium text-zinc-700 mb-1"
                >
                  Teks Tombol Promo
                </label>
                <input
                  id="inline-promo-cta"
                  type="text"
                  value={promoCtaDraft}
                  onChange={(e) => setPromoCtaDraft(e.target.value)}
                  placeholder="Belanja Koleksi Promo"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-[#111113] focus:outline-none focus:border-[#111113]"
                />
              </div>
            </div>

            {promoError && <p className="text-xs text-red-600">{promoError}</p>}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingPromo(false)}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={promoSaving}
                className="px-5 py-2 rounded-lg bg-[#111113] text-white text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
              >
                {promoSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Best Sellers */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#111113]">
              Best Sellers
            </h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              Produk paling diminati oleh komunitas streetwear elchapo.clg.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'shop' })}
            className="text-xs font-semibold text-[#111113] hover:text-[#2563EB] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Lihat Semua</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {bestSellers.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isWishlisted={wishlistIds.includes(p.id)}
              onToggleWishlist={onToggleWishlist}
              onSelect={onSelectProduct}
            />
          ))}
        </div>
      </section>

      {/* All Products Preview */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#111113]">
              All Products
            </h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              Seluruh katalog siap kirim dari studio kami.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'shop' })}
            className="px-4 py-2 bg-[#111113] text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Filter & Cari Produk
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {allPreview.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isWishlisted={wishlistIds.includes(p.id)}
              onToggleWishlist={onToggleWishlist}
              onSelect={onSelectProduct}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

interface ShopViewProps {
  products: Product[];
  categories: Category[];
  wishlistIds: number[];
  initialCategory?: string;
  initialSearch?: string;
  onSelectProduct: (id: number) => void;
  onToggleWishlist: (id: number) => void;
}

export function ShopView({
  products,
  categories,
  wishlistIds,
  initialCategory = 'all',
  initialSearch = '',
  onSelectProduct,
  onToggleWishlist,
}: ShopViewProps) {
  const [search, setSearch] = useState(initialSearch);
  const [categorySlug, setCategorySlug] = useState(initialCategory);
  const [sizeFilter, setSizeFilter] = useState('all');
  const [colorFilter, setColorFilter] = useState('all');
  const [maxPrice, setMaxPrice] = useState<number>(1500000);
  const [sortBy, setSortBy] = useState<'newest' | 'lowest' | 'highest' | 'bestseller'>('newest');

  const allColors = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      for (const c of p.colors) set.add(c);
    }
    return Array.from(set);
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) {
        return false;
      }
      if (categorySlug !== 'all') {
        const cat = categories.find((c) => c.slug === categorySlug);
        if (cat && p.categoryId !== cat.id) return false;
      }
      if (sizeFilter !== 'all' && !p.sizes.includes(sizeFilter)) {
        return false;
      }
      if (colorFilter !== 'all' && !p.colors.includes(colorFilter)) {
        return false;
      }
      if (getEffectivePrice(p) > maxPrice) {
        return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'lowest') return getEffectivePrice(a) - getEffectivePrice(b);
      if (sortBy === 'highest') return getEffectivePrice(b) - getEffectivePrice(a);
      if (sortBy === 'bestseller') return b.salesCount - a.salesCount;
      return b.id - a.id;
    });

    return list;
  }, [products, categories, search, categorySlug, sizeFilter, colorFilter, maxPrice, sortBy]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#111113]">
            Shop All Collections
          </h1>
          <p className="text-sm text-zinc-500 mt-1 tabular-nums">
            Menampilkan {filtered.length} dari {products.length} produk tersedia
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="shop-sort" className="text-xs font-medium text-zinc-600">
            Urutkan:
          </label>
          <select
            id="shop-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-[#111113]"
          >
            <option value="newest">Terbaru</option>
            <option value="lowest">Harga Terendah</option>
            <option value="highest">Harga Tertinggi</option>
            <option value="bestseller">Terlaris</option>
          </select>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <div>
          <label htmlFor="shop-search" className="block text-xs font-medium text-zinc-700 mb-1">
            Cari Nama Produk
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
            <input
              id="shop-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Hoodie, Cargo, Tee..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-zinc-300 focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="shop-cat" className="block text-xs font-medium text-zinc-700 mb-1">
            Kategori
          </label>
          <select
            id="shop-cat"
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 bg-white"
          >
            <option value="all">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="shop-size" className="block text-xs font-medium text-zinc-700 mb-1">
            Ukuran
          </label>
          <select
            id="shop-size"
            value={sizeFilter}
            onChange={(e) => setSizeFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 bg-white"
          >
            <option value="all">Semua Ukuran</option>
            {['S', 'M', 'L', 'XL', 'XXL', 'All Size'].map((sz) => (
              <option key={sz} value={sz}>
                {sz}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="shop-color" className="block text-xs font-medium text-zinc-700 mb-1">
            Warna
          </label>
          <select
            id="shop-color"
            value={colorFilter}
            onChange={(e) => setColorFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 bg-white"
          >
            <option value="all">Semua Warna</option>
            {allColors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex justify-between text-xs font-medium text-zinc-700 mb-1">
            <label htmlFor="shop-price">Maks. Harga</label>
            <span className="tabular-nums">Rp {(maxPrice / 1000).toFixed(0)}rb</span>
          </div>
          <input
            id="shop-price"
            type="range"
            min={200000}
            max={1500000}
            step={50000}
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            className="w-full accent-[#111113]"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center space-y-3">
          <SlidersHorizontal className="w-8 h-8 text-zinc-300 mx-auto" />
          <p className="font-display text-lg font-semibold text-[#111113]">
            Tidak ada produk yang cocok
          </p>
          <p className="text-sm text-zinc-500">
            Coba ubah kata kunci pencarian atau reset filter Anda.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCategorySlug('all');
              setSizeFilter('all');
              setColorFilter('all');
              setMaxPrice(1500000);
            }}
            className="px-4 py-2 bg-[#111113] text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            Reset Semua Filter
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {filtered.map((p) => (
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
  );
}

export function CategoriesView({
  categories,
  onSelectCategory,
}: {
  categories: Category[];
  onSelectCategory: (slug: string) => void;
}) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 pb-24 space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#111113]">
          Kategori Koleksi
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          Pilih kategori pakaian atau aksesoris elchapo.clg untuk mulai berbelanja.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelectCategory(cat.slug)}
            className="bg-white border border-zinc-200 rounded-2xl p-6 text-left hover:border-[#111113] transition-colors flex flex-col justify-between gap-6 cursor-pointer"
          >
            <div>
              <p className="text-xs font-medium text-[#2563EB] tabular-nums">
                {cat.productCount ?? 0} produk tersedia
              </p>
              <h2 className="font-display text-xl font-bold text-[#111113] mt-1">
                {cat.name}
              </h2>
              <p className="text-sm text-zinc-600 mt-2">{cat.description}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#111113]">
              <span>Lihat Produk</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function WishlistView({
  products,
  wishlistIds,
  onSelectProduct,
  onToggleWishlist,
  onGoShop,
}: {
  products: Product[];
  wishlistIds: number[];
  onSelectProduct: (id: number) => void;
  onToggleWishlist: (id: number) => void;
  onGoShop: () => void;
}) {
  const saved = products.filter((p) => wishlistIds.includes(p.id));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 pb-24 space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#111113]">
          Wishlist Anda
        </h1>
        <p className="text-sm text-zinc-600 mt-1 tabular-nums">
          {saved.length} produk tersimpan untuk nanti
        </p>
      </div>

      {saved.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-3">
          <Heart className="w-9 h-9 text-zinc-300 mx-auto" />
          <p className="font-display text-lg font-semibold text-[#111113]">
            Wishlist Anda masih kosong
          </p>
          <p className="text-sm text-zinc-500 max-w-sm mx-auto">
            Tekan ikon hati pada produk favorit Anda untuk menyimpannya di sini.
          </p>
          <button
            type="button"
            onClick={onGoShop}
            className="px-5 py-2.5 bg-[#111113] text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            Mulai Jelajahi Produk
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {saved.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isWishlisted={true}
              onToggleWishlist={onToggleWishlist}
              onSelect={onSelectProduct}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function StaticInfoView({
  kind,
  settings,
}: {
  kind: 'contact' | 'about' | 'privacy' | 'terms' | 'returns';
  settings: WebsiteSettings;
}) {
  if (kind === 'contact') {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 pb-24 space-y-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#111113]">
            Hubungi {settings.storeName}
          </h1>
          <p className="text-sm text-zinc-600 mt-2">
            Tim layanan pelanggan kami siap membantu pertanyaan ukuran, stok, maupun konfirmasi pengiriman.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            href={formatWhatsAppUrl(
              settings.whatsappNumber || '085647441648',
              'Halo admin elchapo.clg, saya ingin berkonsultasi mengenai produk.'
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white border border-zinc-200 rounded-xl p-6 hover:border-emerald-600 transition-colors space-y-2"
          >
            <MessageCircle className="w-6 h-6 text-emerald-600" />
            <h2 className="font-display text-base font-bold text-[#111113]">
              WhatsApp Resmi
            </h2>
            <p className="text-sm font-mono text-zinc-700 tabular-nums">
              {settings.whatsappNumber || '085647441648'}
            </p>
            <span className="inline-block text-xs font-semibold text-emerald-700">
              Chat Langsung via WhatsApp
            </span>
          </a>

          <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-2">
            <Mail className="w-6 h-6 text-[#2563EB]" />
            <h2 className="font-display text-base font-bold text-[#111113]">Email Toko</h2>
            <p className="text-sm text-zinc-700">{settings.contactEmail}</p>
            <p className="text-xs text-zinc-500">Senin – Minggu · 09:00 – 21:00 WIB</p>
          </div>
        </div>
      </div>
    );
  }

  const titleMap = {
    about: `Tentang ${settings.storeName}`,
    privacy: 'Kebijakan Privasi',
    terms: 'Syarat & Ketentuan',
    returns: 'Kebijakan Pengembalian Barang',
  };

  const bodyMap = {
    about: settings.aboutStory,
    privacy: settings.privacyPolicy,
    terms: settings.termsConditions,
    returns: settings.returnPolicy,
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 pb-24 space-y-6">
      <h1 className="font-display text-3xl font-bold text-[#111113]">{titleMap[kind]}</h1>
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-8 text-sm text-zinc-700 leading-relaxed whitespace-pre-line">
        {bodyMap[kind]}
      </div>
    </div>
  );
}

export function Footer({
  settings,
  onNavigate,
}: {
  settings: WebsiteSettings;
  onNavigate: (route: AppRoute) => void;
}) {
  return (
    <footer className="bg-[#111113] text-zinc-300 border-t border-zinc-800 pb-20 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 grid grid-cols-1 md:grid-cols-12 gap-10">
        <div className="md:col-span-5 space-y-3">
          <p className="font-display text-xl font-bold text-white">
            {settings.storeName || 'elchapo.clg'}
          </p>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
            {settings.footerAbout}
          </p>
          <div className="flex items-center gap-4 pt-2 text-xs">
            <a
              href={settings.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-zinc-300 hover:text-white"
            >
              <Instagram className="w-4 h-4" />
              <span>Instagram</span>
            </a>
            <a
              href={formatWhatsAppUrl(
                settings.whatsappNumber || '085647441648',
                'Halo elchapo.clg!'
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-zinc-300 hover:text-white"
            >
              <Phone className="w-4 h-4" />
              <span className="tabular-nums">{settings.whatsappNumber || '085647441648'}</span>
            </a>
          </div>
        </div>

        <div className="md:col-span-2 space-y-2.5 text-xs">
          <p className="font-semibold text-white">Belanja</p>
          <ul className="space-y-2 text-zinc-400">
            <li>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'shop' })}
                className="hover:text-white cursor-pointer"
              >
                All Products
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'categories' })}
                className="hover:text-white cursor-pointer"
              >
                Categories
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'wishlist' })}
                className="hover:text-white cursor-pointer"
              >
                Wishlist
              </button>
            </li>
          </ul>
        </div>

        <div className="md:col-span-3 space-y-2.5 text-xs">
          <p className="font-semibold text-white">Informasi & Kebijakan</p>
          <ul className="space-y-2 text-zinc-400">
            <li>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'about' })}
                className="hover:text-white cursor-pointer"
              >
                Tentang Kami
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'contact' })}
                className="hover:text-white cursor-pointer"
              >
                Kontak & WhatsApp
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'policy', kind: 'privacy' })}
                className="hover:text-white cursor-pointer"
              >
                Kebijakan Privasi
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'policy', kind: 'terms' })}
                className="hover:text-white cursor-pointer"
              >
                Syarat & Ketentuan
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'policy', kind: 'returns' })}
                className="hover:text-white cursor-pointer"
              >
                Pengembalian Barang
              </button>
            </li>
          </ul>
        </div>

        <div className="md:col-span-2 space-y-2.5 text-xs">
          <p className="font-semibold text-white">Portal Pengelola</p>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'admin' })}
            className="text-zinc-400 hover:text-white underline cursor-pointer"
          >
            Dashboard Admin
          </button>
        </div>
      </div>

      <div className="border-t border-zinc-800 py-4 px-4 sm:px-6 text-center text-[11px] text-zinc-500">
        © {new Date().getFullYear()} {settings.storeName || 'elchapo.clg'}. Seluruh hak cipta dilindungi.
      </div>
    </footer>
  );
}
