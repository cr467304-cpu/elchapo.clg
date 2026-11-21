import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Landmark,
  QrCode,
  ShieldCheck,
  Tag,
  Truck,
  Upload,
} from 'lucide-react';
import type {
  CartItem,
  Order,
  PaymentMethod,
  PromoCode,
  ShippingOption,
  User,
} from '../types.ts';
import { apiRequest, uploadImageFile } from '../utils/api.ts';
import { calculateCartSummary, formatIDR } from '../utils/commerce.ts';

interface CheckoutViewProps {
  user: User | null;
  cartItems: CartItem[];
  paymentMethods: PaymentMethod[];
  shippingOptions: ShippingOption[];
  onOrderCreated: (order: Order) => void;
  onRequireLogin: () => void;
  onBackToCart: () => void;
}

export function CheckoutView({
  user,
  cartItems,
  paymentMethods,
  shippingOptions,
  onOrderCreated,
  onRequireLogin,
  onBackToCart,
}: CheckoutViewProps) {
  const [recipientName, setRecipientName] = useState(user?.name || '');
  const [recipientPhone, setRecipientPhone] = useState(user?.phone || '');
  const [shippingAddress, setShippingAddress] = useState(
    user?.address ? `${user.address}${user.city ? `, ${user.city}` : ''}${user.postalCode ? ` ${user.postalCode}` : ''}` : ''
  );
  const [notes, setNotes] = useState('');
  const [selectedShippingId, setSelectedShippingId] = useState<number>(
    shippingOptions[0]?.id || 0
  );
  const [selectedPaymentId, setSelectedPaymentId] = useState<number>(
    paymentMethods[0]?.id || 0
  );
  const [selectedChannel, setSelectedChannel] = useState<string>(
    paymentMethods[0]?.gatewayChannels[0] || 'QRIS'
  );
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null);
  const [promoMsg, setPromoMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedShippingId && shippingOptions[0]) {
      setSelectedShippingId(shippingOptions[0].id);
    }
  }, [shippingOptions, selectedShippingId]);

  useEffect(() => {
    if (!selectedPaymentId && paymentMethods[0]) {
      setSelectedPaymentId(paymentMethods[0].id);
      setSelectedChannel(paymentMethods[0].gatewayChannels[0] || 'QRIS');
    }
  }, [paymentMethods, selectedPaymentId]);

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#111113]">
          Masuk untuk Melanjutkan Checkout
        </h1>
        <p className="text-sm text-zinc-600">
          Pesanan, wishlist, dan pelacakan pengiriman real-time terhubung langsung dengan akun elchapo.clg Anda.
        </p>
        <button
          type="button"
          onClick={onRequireLogin}
          className="px-6 py-3 bg-[#111113] text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
        >
          Masuk / Daftar Akun
        </button>
      </div>
    );
  }

  const chosenShipping =
    shippingOptions.find((s) => s.id === selectedShippingId) || shippingOptions[0];
  const chosenPayment =
    paymentMethods.find((p) => p.id === selectedPaymentId) || paymentMethods[0];

  const summary = calculateCartSummary(
    cartItems,
    appliedPromo,
    chosenShipping?.cost || 0
  );

  const handleApplyPromo = async () => {
    setPromoMsg('');
    if (!promoInput.trim()) return;
    try {
      const res = await apiRequest<{ promo: PromoCode }>('/api/promos/validate', {
        method: 'POST',
        body: JSON.stringify({ code: promoInput.trim(), subtotal: summary.subtotal }),
      });
      setAppliedPromo(res.promo);
      setPromoMsg(`Kode ${res.promo.code} diterapkan (${res.promo.title}).`);
    } catch (err) {
      setAppliedPromo(null);
      setPromoMsg(err instanceof Error ? err.message : 'Kode promo tidak valid.');
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!recipientName.trim() || !recipientPhone.trim() || !shippingAddress.trim()) {
      setError('Mohon lengkapi nama penerima, nomor telepon/WhatsApp, dan alamat pengiriman.');
      return;
    }
    if (!chosenPayment || !chosenShipping) {
      setError('Pilih metode pengiriman dan metode pembayaran terlebih dahulu.');
      return;
    }
    if (summary.stockIssues.length > 0) {
      setError(summary.stockIssues[0]);
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ order: Order }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          recipientName,
          recipientPhone,
          shippingAddress,
          notes,
          shippingOptionId: chosenShipping.id,
          paymentMethodId: chosenPayment.id,
          paymentChannel:
            chosenPayment.type === 'qris'
              ? 'QRIS'
              : chosenPayment.type === 'bank_transfer'
                ? chosenPayment.bankName
                  ? `${chosenPayment.bankName} · ${chosenPayment.accountNumber}`
                  : chosenPayment.name
                : selectedChannel,
          promoCode: appliedPromo?.code,
        }),
      });
      onOrderCreated(res.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat pesanan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-8">
      <button
        type="button"
        onClick={onBackToCart}
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-[#111113] cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Kembali ke Keranjang</span>
      </button>

      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#111113]">
          Checkout Pesanan
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          Lengkapi alamat pengiriman dan pilih metode pembayaran aktif.
        </p>
      </div>

      {cartItems.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center">
          <p className="text-sm text-zinc-600">Keranjang belanja Anda kosong.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-6">
            {/* Shipping Address */}
            <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold text-[#111113]">
                Informasi Pengiriman
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="chk-name" className="block text-xs font-medium text-zinc-700 mb-1">
                    Nama Penerima
                  </label>
                  <input
                    id="chk-name"
                    type="text"
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Nama lengkap penerima"
                    className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label htmlFor="chk-phone" className="block text-xs font-medium text-zinc-700 mb-1">
                    Nomor WhatsApp / Telepon
                  </label>
                  <input
                    id="chk-phone"
                    type="tel"
                    required
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    placeholder="Contoh: 085647441648"
                    className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="chk-address" className="block text-xs font-medium text-zinc-700 mb-1">
                  Alamat Lengkap (Jalan, Kecamatan, Kota, Kode Pos)
                </label>
                <textarea
                  id="chk-address"
                  required
                  rows={3}
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="Jl. Kemang Raya No. 18, Jakarta Selatan 12730"
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label htmlFor="chk-notes" className="block text-xs font-medium text-zinc-700 mb-1">
                  Catatan untuk Penjual (Opsional)
                </label>
                <input
                  id="chk-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Misal: Tolong bungkus rapi / titip ke satpam"
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </section>

            {/* Courier Selection */}
            <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-[#111113]" />
                <h2 className="font-display text-lg font-semibold text-[#111113]">
                  Jasa Pengiriman
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {shippingOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedShippingId(opt.id)}
                    className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      chosenShipping?.id === opt.id
                        ? 'border-[#2563EB] bg-[#EFF6FF]'
                        : 'border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#111113]">
                        {opt.serviceName}
                      </span>
                      <span className="text-sm font-semibold text-[#111113] tabular-nums">
                        {formatIDR(opt.cost)}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      Estimasi {opt.eta} · Dari {opt.originCity}
                    </p>
                  </button>
                ))}
              </div>
            </section>

            {/* Payment Method (Dynamic QRIS + Payment Gateway) */}
            <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#111113]" />
                <h2 className="font-display text-lg font-semibold text-[#111113]">
                  Metode Pembayaran
                </h2>
              </div>

              {paymentMethods.length === 0 ? (
                <p className="text-sm text-red-600">
                  Belum ada metode pembayaran yang diaktifkan oleh admin.
                </p>
              ) : (
                <div className="space-y-3">
                  {paymentMethods.map((pm) => {
                    const active = chosenPayment?.id === pm.id;
                    return (
                      <div
                        key={pm.id}
                        className={`rounded-xl border p-4 transition-colors ${
                          active ? 'border-[#2563EB] bg-[#EFF6FF]/60' : 'border-zinc-200'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPaymentId(pm.id);
                            setSelectedChannel(pm.gatewayChannels[0] || 'QRIS');
                          }}
                          className="w-full flex items-center justify-between text-left cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            {pm.type === 'qris' ? (
                              <QrCode className="w-5 h-5 text-[#111113] shrink-0" />
                            ) : pm.type === 'bank_transfer' ? (
                              <Landmark className="w-5 h-5 text-[#111113] shrink-0" />
                            ) : (
                              <ShieldCheck className="w-5 h-5 text-[#2563EB] shrink-0" />
                            )}
                            <div>
                              <p className="text-sm font-semibold text-[#111113]">
                                {pm.name}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {pm.type === 'qris'
                                  ? 'Pindai QRIS & unggah bukti pembayaran (Verifikasi Admin)'
                                  : pm.type === 'bank_transfer'
                                    ? `Transfer langsung ke rekening admin ${pm.bankName || ''} (${pm.accountNumber || '-'}) a.n. ${pm.accountHolder || '-'}`
                                    : 'Pembayaran digital instan terverifikasi otomatis'}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              active ? 'border-[#2563EB]' : 'border-zinc-300'
                            }`}
                          >
                            {active && <span className="w-2 h-2 rounded-full bg-[#2563EB]" />}
                          </span>
                        </button>

                        {active && pm.type === 'bank_transfer' && (
                          <div className="mt-4 pt-3 border-t border-zinc-200 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                            <div className="bg-white border border-zinc-200 rounded-lg px-3 py-2">
                              <span className="text-[11px] text-zinc-500 block">Bank Tujuan</span>
                              <span className="font-semibold text-[#111113]">{pm.bankName || '-'}</span>
                            </div>
                            <div className="bg-white border border-zinc-200 rounded-lg px-3 py-2">
                              <span className="text-[11px] text-zinc-500 block">Nomor Rekening</span>
                              <span className="font-mono font-semibold text-[#111113] tabular-nums">
                                {pm.accountNumber || '-'}
                              </span>
                            </div>
                            <div className="bg-white border border-zinc-200 rounded-lg px-3 py-2">
                              <span className="text-[11px] text-zinc-500 block">Atas Nama</span>
                              <span className="font-semibold text-[#111113]">{pm.accountHolder || '-'}</span>
                            </div>
                          </div>
                        )}

                        {active && pm.type === 'gateway' && pm.gatewayChannels.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-zinc-200">
                            <p className="text-xs font-medium text-zinc-700 mb-2">
                              Pilih Kanal Pembayaran Digital:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {pm.gatewayChannels.map((ch) => (
                                <button
                                  key={ch}
                                  type="button"
                                  onClick={() => setSelectedChannel(ch)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                                    selectedChannel === ch
                                      ? 'bg-[#111113] text-white border-[#111113]'
                                      : 'bg-white text-zinc-700 border-zinc-300'
                                  }`}
                                >
                                  {ch}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Right Summary */}
          <aside className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl p-6 space-y-5 lg:sticky lg:top-24">
            <h2 className="font-display text-lg font-semibold text-[#111113]">
              Ringkasan Belanja
            </h2>

            <div className="divide-y divide-zinc-200 max-h-64 overflow-y-auto">
              {cartItems.map((it) => (
                <div key={it.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-[#111113] truncate">{it.productName}</p>
                    <p className="text-xs text-zinc-500">
                      {it.size} · {it.color} · x{it.quantity}
                    </p>
                  </div>
                  <span className="font-semibold text-[#111113] tabular-nums shrink-0">
                    {formatIDR(it.unitPrice * it.quantity)}
                  </span>
                </div>
              ))}
            </div>

            {/* Promo code */}
            <div className="pt-2 space-y-2">
              <label htmlFor="promo-code" className="block text-xs font-medium text-zinc-700">
                Kode Promo
              </label>
              <div className="flex gap-2">
                <input
                  id="promo-code"
                  type="text"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value)}
                  placeholder="Contoh: ELCHAPO10"
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm uppercase focus:outline-none focus:border-[#2563EB]"
                />
                <button
                  type="button"
                  onClick={handleApplyPromo}
                  className="px-4 py-2 bg-zinc-100 text-[#111113] text-xs font-semibold rounded-lg border border-zinc-300 hover:bg-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Pakai</span>
                </button>
              </div>
              {promoMsg && (
                <p className={`text-xs ${appliedPromo ? 'text-emerald-700' : 'text-red-600'}`}>
                  {promoMsg}
                </p>
              )}
            </div>

            <div className="pt-4 border-t border-zinc-200 space-y-2 text-sm tabular-nums">
              <div className="flex justify-between text-zinc-600">
                <span>Subtotal ({summary.totalQuantity} barang)</span>
                <span>{formatIDR(summary.subtotal)}</span>
              </div>
              {summary.promoDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Diskon Promo ({appliedPromo?.code})</span>
                  <span>-{formatIDR(summary.promoDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-zinc-600">
                <span>Biaya Pengiriman</span>
                <span>{formatIDR(summary.shippingCost)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-[#111113] pt-2 border-t border-zinc-200">
                <span>Total Pembayaran</span>
                <span>{formatIDR(summary.totalAmount)}</span>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || paymentMethods.length === 0}
              className="w-full py-3.5 px-5 bg-[#111113] text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting ? 'Membuat Pesanan...' : 'Buat Pesanan & Lanjut Bayar'}
            </button>
          </aside>
        </form>
      )}
    </div>
  );
}

interface PaymentConfirmationViewProps {
  orderNumber: string;
  paymentMethods: PaymentMethod[];
  onTrackOrder: (orderNumber: string) => void;
  onOrderUpdated: (order: Order) => void;
}

export function PaymentConfirmationView({
  orderNumber,
  paymentMethods,
  onTrackOrder,
  onOrderUpdated,
}: PaymentConfirmationViewProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [proofUrl, setProofUrl] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [copiedField, setCopiedField] = useState<'' | 'account' | 'amount'>('');

  const handleCopy = async (field: 'account' | 'amount', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(''), 2000);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<{ order: Order }>(`/api/orders/${orderNumber}`)
      .then((res) => {
        if (!active) return;
        setOrder(res.order);
        setProofUrl(res.order.paymentProofUrl || '');
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat pesanan.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orderNumber]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-sm text-zinc-500">
        Memuat detail pembayaran...
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-sm text-red-600">
        {error || 'Pesanan tidak ditemukan.'}
      </div>
    );
  }

  const matchedPm = paymentMethods.find((p) => p.id === order.paymentMethodId);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadImageFile(file);
      setProofUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunggah gambar.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofUrl) {
      setError('Pilih atau unggah foto bukti pembayaran terlebih dahulu.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await apiRequest<{ order: Order }>(
        `/api/orders/${order.orderNumber}/payment-proof`,
        {
          method: 'POST',
          body: JSON.stringify({ proofUrl }),
        }
      );
      setOrder(res.order);
      onOrderUpdated(res.order);
      setSuccessMsg(
        'Bukti pembayaran berhasil dikirim! Status pesanan kini Menunggu Konfirmasi Admin.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim bukti pembayaran.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGatewayComplete = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await apiRequest<{ order: Order }>(
        `/api/orders/${order.orderNumber}/gateway-pay`,
        {
          method: 'POST',
          body: JSON.stringify({ channel: order.paymentChannel }),
        }
      );
      setOrder(res.order);
      onOrderUpdated(res.order);
      setSuccessMsg(
        `Pembayaran via ${order.paymentChannel} berhasil terverifikasi! Pesanan Anda sedang diproses.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pembayaran gagal diproses.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 pb-24 space-y-6">
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5">
          <div>
            <p className="text-xs text-zinc-500">Nomor Pesanan</p>
            <h1 className="font-mono text-xl font-bold text-[#111113] tabular-nums">
              {order.orderNumber}
            </h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Total Pembayaran</p>
            <p className="text-2xl font-bold text-[#2563EB] tabular-nums">
              {formatIDR(order.totalAmount)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[#FAFAFA] border border-zinc-200 rounded-lg px-4 py-3">
          <span>
            Status Pesanan: <strong className="text-[#111113]">{order.orderStatus}</strong>
          </span>
          <span>
            Metode: <strong className="text-[#111113]">{order.paymentMethodName}</strong>
            {order.paymentChannel ? ` (${order.paymentChannel})` : ''}
          </span>
        </div>

        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{successMsg}</p>
              <button
                type="button"
                onClick={() => onTrackOrder(order.orderNumber)}
                className="mt-2 text-xs font-semibold text-emerald-800 underline cursor-pointer"
              >
                Pantau Status & Peta Pengiriman Live
              </button>
            </div>
          </div>
        )}

        {order.paymentStatus === 'paid' ? (
          <div className="py-4 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <div>
              <h2 className="font-display text-xl font-bold text-[#111113]">
                Pembayaran Telah Diverifikasi
              </h2>
              <p className="text-sm text-zinc-600 mt-1">
                Pesanan Anda sedang diproses. Pantau pergerakan kurir secara real-time.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onTrackOrder(order.orderNumber)}
              className="px-6 py-3 bg-[#111113] text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              Lacak Pesanan Real-Time
            </button>
          </div>
        ) : order.paymentType === 'qris' || order.paymentType === 'bank_transfer' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {order.paymentType === 'qris' ? (
              <div className="bg-[#FAFAFA] border border-zinc-200 rounded-xl p-5 flex flex-col items-center text-center space-y-3">
                {matchedPm?.qrisImageUrl ? (
                  <img
                    src={matchedPm.qrisImageUrl}
                    alt="Kode QRIS elchapo.clg"
                    className="w-52 h-auto rounded-lg border border-zinc-200 bg-white p-2"
                  />
                ) : (
                  <div className="w-52 h-52 flex items-center justify-center bg-white border border-zinc-200 rounded-lg text-xs text-zinc-500">
                    QRIS belum dikonfigurasi
                  </div>
                )}
                <p className="text-xs text-zinc-600 whitespace-pre-line text-left leading-relaxed">
                  {matchedPm?.instructions ||
                    'Pindai kode QRIS di atas sesuai nominal tagihan lalu unggah bukti transfer Anda.'}
                </p>
              </div>
            ) : (
              <div className="bg-[#FAFAFA] border border-zinc-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2.5 border-b border-zinc-200 pb-3">
                  <Landmark className="w-5 h-5 text-[#111113] shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-[#111113]">
                      Rekening Tujuan Transfer Admin
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Dana masuk langsung ke rekening toko resmi
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between bg-white border border-zinc-200 rounded-lg px-3.5 py-2.5">
                    <div>
                      <span className="text-[11px] text-zinc-500 block">Bank Tujuan</span>
                      <span className="font-bold text-sm text-[#111113]">
                        {matchedPm?.bankName || order.paymentMethodName}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 bg-white border border-zinc-200 rounded-lg px-3.5 py-2.5">
                    <div>
                      <span className="text-[11px] text-zinc-500 block">Nomor Rekening Admin</span>
                      <span className="font-mono font-bold text-base text-[#111113] tabular-nums">
                        {matchedPm?.accountNumber || '-'}
                      </span>
                    </div>
                    {matchedPm?.accountNumber && (
                      <button
                        type="button"
                        onClick={() => handleCopy('account', matchedPm.accountNumber)}
                        className="px-2.5 py-1.5 rounded-md border border-zinc-300 bg-zinc-50 hover:border-[#111113] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        {copiedField === 'account' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Salin No. Rek</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between bg-white border border-zinc-200 rounded-lg px-3.5 py-2.5">
                    <div>
                      <span className="text-[11px] text-zinc-500 block">Atas Nama Pemilik</span>
                      <span className="font-semibold text-[#111113]">
                        {matchedPm?.accountHolder || '-'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 bg-white border border-zinc-200 rounded-lg px-3.5 py-2.5">
                    <div>
                      <span className="text-[11px] text-zinc-500 block">Nominal Transfer</span>
                      <span className="font-bold text-sm text-[#2563EB] tabular-nums">
                        {formatIDR(order.totalAmount)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy('amount', String(order.totalAmount))}
                      className="px-2.5 py-1.5 rounded-md border border-zinc-300 bg-zinc-50 hover:border-[#111113] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiedField === 'amount' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Nominal</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-zinc-600 whitespace-pre-line text-left leading-relaxed">
                  {matchedPm?.instructions ||
                    'Transfer tepat sesuai total tagihan ke rekening admin di atas lalu unggah bukti transfer Anda.'}
                </p>
              </div>
            )}

            <form onSubmit={handleSubmitProof} className="space-y-4">
              <h2 className="font-display text-base font-bold text-[#111113]">
                {order.paymentType === 'bank_transfer'
                  ? 'Unggah Bukti Transfer Rekening Admin'
                  : 'Unggah Bukti Pembayaran QRIS'}
              </h2>
              <p className="text-xs text-zinc-600">
                Setelah transfer berhasil di aplikasi bank/e-wallet Anda, unggah foto atau screenshot bukti transaksi di sini untuk diverifikasi admin.
              </p>

              <div>
                <label
                  htmlFor="proof-file-input"
                  className="block w-full border-2 border-dashed border-zinc-300 hover:border-[#2563EB] rounded-xl p-5 text-center cursor-pointer transition-colors"
                >
                  <Upload className="w-6 h-6 text-zinc-400 mx-auto mb-2" />
                  <span className="text-xs font-medium text-[#111113] block">
                    {uploading ? 'Mengunggah gambar...' : 'Pilih Foto Bukti Transfer (PNG/JPG/WEBP)'}
                  </span>
                </label>
                <input
                  id="proof-file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </div>

              {proofUrl && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-zinc-700">Pratinjau Bukti Pembayaran:</p>
                  <img
                    src={proofUrl}
                    alt="Bukti pembayaran"
                    className="w-full max-h-48 object-contain rounded-lg border border-zinc-200 bg-zinc-50"
                  />
                </div>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting || uploading || !proofUrl}
                className="w-full py-3 px-4 bg-[#111113] text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Mengirim Bukti...' : 'Kirim Bukti Pembayaran'}
              </button>

              <button
                type="button"
                onClick={() => onTrackOrder(order.orderNumber)}
                className="w-full py-2.5 px-4 bg-white border border-zinc-300 text-zinc-700 text-xs font-semibold rounded-lg hover:bg-zinc-50 cursor-pointer"
              >
                Lihat Status & Peta Pesanan
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="bg-[#FAFAFA] border border-zinc-200 rounded-xl p-5 space-y-2">
              <p className="text-sm font-semibold text-[#111113]">
                Gerbang Pembayaran Digital Pihak Ketiga · {order.paymentChannel}
              </p>
              <p className="text-xs text-zinc-600 leading-relaxed">
                {matchedPm?.instructions ||
                  'Selesaikan pembayaran secara instan melalui saluran e-wallet atau Virtual Account yang dipilih.'}
              </p>
              <div className="pt-2 font-mono text-xs text-zinc-700 tabular-nums">
                Kode Referensi Transaksi: <span className="font-semibold">PGW-{order.orderNumber}</span>
              </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleGatewayComplete}
                disabled={submitting}
                className="flex-1 py-3 px-5 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              >
                {submitting
                  ? 'Memproses Pembayaran...'
                  : `Bayar Sekarang (${order.paymentChannel})`}
              </button>
              <button
                type="button"
                onClick={() => onTrackOrder(order.orderNumber)}
                className="py-3 px-5 bg-white border border-zinc-300 text-zinc-700 text-sm font-semibold rounded-lg hover:bg-zinc-50 cursor-pointer"
              >
                Lacak Pesanan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
