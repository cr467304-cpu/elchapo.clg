import { Heart, Package, Star } from 'lucide-react';
import type { Product } from '../types.ts';
import { calculateDiscountPercent, formatIDR, getEffectivePrice } from '../utils/commerce.ts';

interface ProductCardProps {
  product: Product;
  isWishlisted: boolean;
  onToggleWishlist: (productId: number) => void;
  onSelect: (productId: number) => void;
}

export function ProductCard({
  product,
  isWishlisted,
  onToggleWishlist,
  onSelect,
}: ProductCardProps) {
  const effectivePrice = getEffectivePrice(product);
  const discountPct = calculateDiscountPercent(product.price, product.discountPrice);
  const primaryImage = product.images[0] || '';

  let tagLabel = '';
  if (discountPct > 0) {
    tagLabel = `Sale -${discountPct}%`;
  } else if (product.isNewArrival) {
    tagLabel = 'New Arrival';
  } else if (product.isBestSeller) {
    tagLabel = 'Best Seller';
  }

  return (
    <article className="group flex flex-col bg-white border border-zinc-200 rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5">
      <div className="relative aspect-[4/3] bg-[#F4F4F5] overflow-hidden">
        <button
          type="button"
          onClick={() => onSelect(product.id)}
          aria-label={`Lihat detail ${product.name}`}
          className="w-full h-full block cursor-pointer"
        >
          {primaryImage ? (
            <img
              src={primaryImage}
              alt={product.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 bg-gradient-to-br from-zinc-100 to-zinc-200">
              <Package className="w-8 h-8 mb-1.5" />
              <span className="text-xs font-medium px-3 text-center">{product.name}</span>
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={() => onToggleWishlist(product.id)}
          aria-label={
            isWishlisted
              ? `Hapus ${product.name} dari wishlist`
              : `Simpan ${product.name} ke wishlist`
          }
          className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center border transition-colors cursor-pointer ${
            isWishlisted
              ? 'bg-[#111113] text-white border-[#111113]'
              : 'bg-white/90 text-zinc-700 border-zinc-200 hover:text-[#111113]'
          }`}
        >
          <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current' : ''}`} />
        </button>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between gap-2">
        <div>
          <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
            <span className="truncate">
              {product.categoryName || 'Streetwear'}
              {tagLabel ? ` · ${tagLabel}` : ''}
            </span>
            {Number(product.reviewCount) > 0 && (
              <span className="inline-flex items-center gap-1 shrink-0 tabular-nums text-zinc-700">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {product.avgRating}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => onSelect(product.id)}
            className="mt-1 text-left font-display text-base font-semibold text-[#111113] hover:text-[#2563EB] transition-colors line-clamp-1 cursor-pointer"
          >
            {product.name}
          </button>
        </div>

        <div className="flex items-baseline justify-between gap-2 pt-1">
          <div className="flex items-baseline gap-2 tabular-nums">
            <span className="text-[15px] font-semibold text-[#111113]">
              {formatIDR(effectivePrice)}
            </span>
            {discountPct > 0 && (
              <span className="text-xs text-zinc-400 line-through">
                {formatIDR(product.price)}
              </span>
            )}
          </div>
          <span
            className={`text-[11px] tabular-nums ${
              product.stock <= 0
                ? 'text-red-600 font-medium'
                : product.stock <= 5
                ? 'text-amber-700 font-medium'
                : 'text-zinc-500'
            }`}
          >
            {product.stock <= 0 ? 'Habis' : `Stok ${product.stock}`}
          </span>
        </div>
      </div>
    </article>
  );
}
