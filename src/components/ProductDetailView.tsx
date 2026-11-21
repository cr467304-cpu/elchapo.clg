import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Heart, Minus, Plus, ShieldCheck, Star } from 'lucide-react';
import type { Product, Review, User } from '../types.ts';
import { apiRequest } from '../utils/api.ts';
import { calculateDiscountPercent, formatIDR, getEffectivePrice } from '../utils/commerce.ts';
import { ProductCard } from './ProductCard.tsx';

interface ProductDetailViewProps {
  productId: number;
  allProducts: Product[];
  recentlyViewedIds: number[];
  wishlistIds: number[];
  user: User | null;
  onBack: () => void;
  onSelectProduct: (id: number) => void;
  onToggleWishlist: (id: number) => void;
  onAddToCart: (params: {
    product: Product;
    size: string;
    color: string;
    quantity: number;
  }) => Promise<void>;
  onRequireLogin: () => void;
}

export function ProductDetailView({
  productId,
  allProducts,
  recentlyViewedIds,
  wishlistIds,
  user,
  onBack,
  onSelectProduct,
  onToggleWishlist,
  onAddToCart,
  onRequireLogin,
}: ProductDetailViewProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [selectedSize, setSelectedSize] = useState('M');
  const [selectedColor, setSelectedColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);

  // Review state
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setActiveImageIdx(0);
    setQuantity(1);
    setReviewError('');
    setReviewSuccess('');

    apiRequest<{ product: Product; reviews: Review[] }>(`/api/products/${productId}`)
      .then((res) => {
        if (!active) return;
        setProduct(res.product);
        setReviews(res.reviews);
        setSelectedSize(res.product.sizes[0] || 'M');
        setSelectedColor(res.product.colors[0] || 'Black');
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat produk.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [productId]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 animate-pulse">
          <div className="aspect-[4/3] bg-zinc-200 rounded-2xl" />
          <div className="space-y-4">
            <div className="h-5 w-32 bg-zinc-200 rounded" />
            <div className="h-9 w-3/4 bg-zinc-200 rounded" />
            <div className="h-7 w-40 bg-zinc-200 rounded" />
            <div className="h-24 w-full bg-zinc-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-base font-medium text-red-600">{error || 'Produk tidak ditemukan.'}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-[#111113] text-white text-sm rounded-lg cursor-pointer"
        >
          Kembali ke Katalog
        </button>
      </div>
    );
  }

  const effectivePrice = getEffectivePrice(product);
  const discountPct = calculateDiscountPercent(product.price, product.discountPrice);
  const isWishlisted = wishlistIds.includes(product.id);
  const related = allProducts
    .filter((p) => p.id !== product.id && p.categoryId === product.categoryId)
    .slice(0, 4);
  const recentlyViewed = recentlyViewedIds
    .filter((id) => id !== product.id)
    .map((id) => allProducts.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p))
    .slice(0, 4);

  const handleAdd = async () => {
    setAdding(true);
    try {
      await onAddToCart({
        product,
        size: selectedSize,
        color: selectedColor,
        quantity,
      });
      setAddedFeedback(true);
      setTimeout(() => setAddedFeedback(false), 1800);
    } finally {
      setAdding(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireLogin();
      return;
    }
    setSubmittingReview(true);
    setReviewError('');
    setReviewSuccess('');
    try {
      const res = await apiRequest<{ review: Review }>(`/api/products/${product.id}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment }),
      });
      setReviews((prev) => [res.review, ...prev]);
      setComment('');
      setReviewSuccess('Terima kasih! Ulasan terverifikasi Anda telah diterbitkan.');
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Gagal mengirim ulasan.');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-16">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-[#111113] cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Kembali ke Katalog</span>
      </button>

      {/* Main Contiguous Purchase Module */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Gallery Left */}
        <div className="lg:col-span-7 space-y-4">
          <div className="aspect-[4/3] bg-[#F4F4F5] rounded-2xl overflow-hidden border border-zinc-200">
            {product.images[activeImageIdx] ? (
              <img
                src={product.images[activeImageIdx]}
                alt={`${product.name} tampilan ${activeImageIdx + 1}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">
                Foto tidak tersedia
              </div>
            )}
          </div>

          {product.images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {product.images.map((img, idx) => (
                <button
                  key={`${img}-${idx}`}
                  type="button"
                  onClick={() => setActiveImageIdx(idx)}
                  className={`w-24 aspect-[4/3] rounded-lg overflow-hidden border-2 shrink-0 cursor-pointer transition-colors ${
                    activeImageIdx === idx ? 'border-[#2563EB]' : 'border-zinc-200 opacity-75 hover:opacity-100'
                  }`}
                >
                  <img
                    src={img}
                    alt={`${product.name} thumbnail ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sticky Purchase Panel Right */}
        <div className="lg:col-span-5 lg:sticky lg:top-24 bg-white border border-zinc-200 rounded-2xl p-6 space-y-6">
          <div>
            <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
              <span>
                {product.categoryName || 'Streetwear'}
                {product.isNewArrival ? ' · New Arrival' : ''}
                {product.isBestSeller ? ' · Best Seller' : ''}
              </span>
              {reviews.length > 0 && (
                <span className="inline-flex items-center gap-1 text-zinc-700 font-medium tabular-nums">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {(
                    reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
                  ).toFixed(1)}{' '}
                  ({reviews.length} ulasan)
                </span>
              )}
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#111113] mt-1.5">
              {product.name}
            </h1>

            <div className="mt-3 flex items-baseline gap-3 tabular-nums">
              <span className="text-2xl font-bold text-[#111113]">
                {formatIDR(effectivePrice)}
              </span>
              {discountPct > 0 && (
                <>
                  <span className="text-sm text-zinc-400 line-through">
                    {formatIDR(product.price)}
                  </span>
                  <span className="text-xs font-semibold text-[#2563EB]">
                    Hemat {discountPct}%
                  </span>
                </>
              )}
            </div>
          </div>

          <p className="text-sm text-zinc-600 leading-relaxed">{product.description}</p>

          {/* Stock indicator */}
          <div className="flex items-center justify-between text-xs py-2.5 px-3 rounded-lg bg-[#FAFAFA] border border-zinc-200">
            <span className="text-zinc-600">Ketersediaan Stok</span>
            <span
              className={`font-semibold tabular-nums ${
                product.stock <= 0
                  ? 'text-red-600'
                  : product.stock <= 5
                  ? 'text-amber-700'
                  : 'text-emerald-700'
              }`}
            >
              {product.stock <= 0
                ? 'Stok Habis'
                : product.stock <= 5
                ? `Stok menipis — tersisa ${product.stock} pcs`
                : `Tersedia (${product.stock} pcs)`}
            </span>
          </div>

          {/* Size Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#111113]">
              Pilih Ukuran
            </label>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setSelectedSize(sz)}
                  className={`min-w-[46px] h-10 px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    selectedSize === sz
                      ? 'bg-[#111113] text-white border-[#111113]'
                      : 'bg-white text-zinc-700 border-zinc-300 hover:border-[#111113]'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          {/* Color Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#111113]">
              Pilih Warna: <span className="font-normal text-zinc-600">{selectedColor}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {product.colors.map((clr) => (
                <button
                  key={clr}
                  type="button"
                  onClick={() => setSelectedColor(clr)}
                  className={`px-3.5 h-9 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    selectedColor === clr
                      ? 'bg-[#EFF6FF] text-[#2563EB] border-[#2563EB]'
                      : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  {clr}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity & Actions */}
          <div className="flex items-center gap-3 pt-2">
            <div className="inline-flex items-center border border-zinc-300 rounded-lg h-11">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Kurangi jumlah"
                className="px-3 h-full text-zinc-600 hover:text-[#111113] cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center text-sm font-semibold tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(Math.max(1, product.stock), q + 1))}
                aria-label="Tambah jumlah"
                className="px-3 h-full text-zinc-600 hover:text-[#111113] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleAdd}
              disabled={product.stock <= 0 || adding}
              className="flex-1 h-11 px-5 bg-[#111113] text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {addedFeedback ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Ditambahkan</span>
                </>
              ) : (
                <span>
                  {product.stock <= 0 ? 'Stok Habis' : adding ? 'Menambahkan...' : 'Tambah ke Keranjang'}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onToggleWishlist(product.id)}
              aria-label={isWishlisted ? 'Hapus dari wishlist' : 'Tambah ke wishlist'}
              className={`h-11 w-11 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                isWishlisted
                  ? 'bg-[#111113] text-white border-[#111113]'
                  : 'bg-white text-zinc-700 border-zinc-300 hover:border-[#111113]'
              }`}
            >
              <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-current' : ''}`} />
            </button>
          </div>

          <div className="pt-4 border-t border-zinc-200 space-y-2 text-xs text-zinc-600">
            <div className="flex justify-between gap-4">
              <span className="font-medium text-[#111113]">Material</span>
              <span className="text-right">{product.material || 'Heavyweight Cotton'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-medium text-[#111113]">Garansi Kualitas</span>
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <ShieldCheck className="w-3.5 h-3.5" /> 7 Hari Penukaran Ukuran
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Product Reviews & Ratings */}
      <section className="border-t border-zinc-200 pt-12 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5 space-y-4">
          <h2 className="font-display text-xl font-bold text-[#111113]">
            Ulasan & Rating Pelanggan
          </h2>
          <p className="text-sm text-zinc-600">
            Ulasan berasal dari pelanggan terverifikasi yang telah menyelesaikan pembelian produk ini di elchapo.clg.
          </p>

          <form
            onSubmit={handleReviewSubmit}
            className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold text-[#111113]">Tulis Ulasan Anda</h3>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                Rating Bintang
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    aria-label={`Beri ${star} bintang`}
                    className="p-1 cursor-pointer"
                  >
                    <Star
                      className={`w-5 h-5 ${
                        star <= rating
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-zinc-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="review-comment" className="block text-xs font-medium text-zinc-700 mb-1">
                Pengalaman Produk
              </label>
              <textarea
                id="review-comment"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Bagaimana kualitas bahan, potongan, dan ukurannya?"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            {reviewError && <p className="text-xs text-red-600">{reviewError}</p>}
            {reviewSuccess && <p className="text-xs text-emerald-700">{reviewSuccess}</p>}

            <button
              type="submit"
              disabled={submittingReview}
              className="px-4 py-2 bg-[#111113] text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
            >
              {submittingReview ? 'Mengirim...' : user ? 'Kirim Ulasan' : 'Login untuk Mengulas'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 space-y-4">
          {reviews.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center">
              <p className="text-sm font-medium text-zinc-700">
                Belum ada ulasan untuk produk ini.
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Jadilah pembeli terverifikasi pertama yang membagikan ulasan.
              </p>
            </div>
          ) : (
            reviews.map((rev) => (
              <div
                key={rev.id}
                className="bg-white border border-zinc-200 rounded-xl p-5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#111113]">
                    <span>{rev.userName}</span>
                    {rev.verifiedPurchase && (
                      <span className="text-xs font-normal text-emerald-700">
                        · Pembeli Terverifikasi
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-400 tabular-nums">
                    {new Date(rev.createdAt).toLocaleDateString('id-ID')}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-3.5 h-3.5 ${
                        s <= rev.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-200'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-sm text-zinc-700 leading-relaxed">{rev.comment}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Related Products */}
      {related.length > 0 && (
        <section className="border-t border-zinc-200 pt-12 space-y-6">
          <h2 className="font-display text-xl font-bold text-[#111113]">
            Produk Serupa
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {related.map((p) => (
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
      )}

      {/* Recently Viewed */}
      {recentlyViewed.length > 0 && (
        <section className="border-t border-zinc-200 pt-12 space-y-6">
          <h2 className="font-display text-xl font-bold text-[#111113]">
            Terakhir Dilihat
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {recentlyViewed.map((p) => (
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
      )}
    </div>
  );
}
