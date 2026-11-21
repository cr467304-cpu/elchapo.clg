import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import type { CartItem } from '../types.ts';
import { formatIDR } from '../utils/commerce.ts';

interface CartContentProps {
  items: CartItem[];
  onUpdateQty: (itemId: number, qty: number) => void;
  onRemoveItem: (itemId: number) => void;
  onCheckout: () => void;
  onContinueShopping: () => void;
}

export function CartItemsList({
  items,
  onUpdateQty,
  onRemoveItem,
  onCheckout,
  onContinueShopping,
}: CartContentProps) {
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const hasStockIssue = items.some((i) => i.stock < i.quantity || i.status !== 'active');

  if (items.length === 0) {
    return (
      <div className="py-16 text-center px-6">
        <ShoppingBag className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
        <p className="font-display text-lg font-semibold text-[#111113]">
          Keranjang belanja Anda kosong
        </p>
        <p className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">
          Tambahkan kaos boxy, hoodie, atau aksesoris pilihan Anda ke keranjang.
        </p>
        <button
          type="button"
          onClick={onContinueShopping}
          className="mt-5 px-5 py-2.5 bg-[#111113] text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          Jelajahi Produk
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 divide-y divide-zinc-200 overflow-y-auto">
        {items.map((item) => {
          const outOfStock = item.stock < item.quantity || item.status !== 'active';
          return (
            <div key={item.id} className="py-4 flex gap-4">
              <div className="w-20 h-20 rounded-lg bg-[#F4F4F5] overflow-hidden shrink-0 border border-zinc-200">
                {item.productImage ? (
                  <img
                    src={item.productImage}
                    alt={item.productName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-[#111113] truncate">
                    {item.productName}
                  </h4>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    aria-label={`Hapus ${item.productName} dari keranjang`}
                    className="p-1 text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-zinc-500 mt-0.5">
                  Ukuran {item.size} · {item.color}
                </p>

                {outOfStock && (
                  <p className="text-xs text-red-600 font-medium mt-1">
                    Stok tersisa {item.stock} unit
                  </p>
                )}

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center border border-zinc-200 rounded-lg bg-white">
                    <button
                      type="button"
                      onClick={() => onUpdateQty(item.id, item.quantity - 1)}
                      aria-label={`Kurangi jumlah ${item.productName}`}
                      className="p-1.5 text-zinc-600 hover:text-[#111113] cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2.5 text-xs font-medium tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                      disabled={item.quantity >= item.stock}
                      aria-label={`Tambah jumlah ${item.productName}`}
                      className="p-1.5 text-zinc-600 hover:text-[#111113] disabled:opacity-40 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <span className="text-sm font-semibold text-[#111113] tabular-nums">
                    {formatIDR(item.unitPrice * item.quantity)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-4 border-t border-zinc-200 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-600">Subtotal ({totalQty} item)</span>
          <span className="font-semibold text-base text-[#111113] tabular-nums">
            {formatIDR(subtotal)}
          </span>
        </div>
        <p className="text-xs text-zinc-500">
          Biaya pengiriman dan kode promo dihitung pada langkah checkout.
        </p>
        <button
          type="button"
          onClick={onCheckout}
          disabled={hasStockIssue}
          className="w-full py-3 px-4 bg-[#111113] text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors cursor-pointer"
        >
          Lanjut ke Checkout
        </button>
      </div>
    </div>
  );
}

interface CartDrawerProps extends CartContentProps {
  open: boolean;
  onClose: () => void;
  onOpenFullCart: () => void;
}

export function CartDrawer({
  open,
  onClose,
  onOpenFullCart,
  ...props
}: CartDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        aria-label="Keranjang Belanja"
        className="relative z-10 w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-6"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111113]">
              Keranjang Belanja
            </h2>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFullCart();
              }}
              className="text-xs text-[#2563EB] hover:underline cursor-pointer"
            >
              Lihat halaman keranjang penuh
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup keranjang"
            className="p-2 rounded-lg text-zinc-500 hover:text-[#111113] hover:bg-zinc-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 pt-2">
          <CartItemsList
            {...props}
            onCheckout={() => {
              onClose();
              props.onCheckout();
            }}
            onContinueShopping={() => {
              onClose();
              props.onContinueShopping();
            }}
          />
        </div>
      </aside>
    </div>
  );
}
