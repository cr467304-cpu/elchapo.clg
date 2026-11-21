import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExcelSpreadsheetXml,
  calculateCartSummary,
  calculateDiscountPercent,
  formatWhatsAppUrl,
  getEffectivePrice,
  hasStaffPermission,
  interpolateRouteProgress,
  isAllowedAdminGoogleEmail,
  isValidOrderStatus,
  normalizeWhatsAppNumber,
} from './commerce.ts';
import type { Order, PromoCode } from '../types.ts';

test('effective price and discount percentage calculate accurately', () => {
  assert.equal(getEffectivePrice({ price: 350000, discountPrice: 280000 }), 280000);
  assert.equal(getEffectivePrice({ price: 350000, discountPrice: null }), 350000);
  assert.equal(getEffectivePrice({ price: 350000, discountPrice: 400000 }), 350000);
  assert.equal(calculateDiscountPercent(400000, 300000), 25);
  assert.equal(calculateDiscountPercent(400000, null), 0);
});

test('cart summary validates stock and computes totals with promo and shipping', () => {
  const promo: PromoCode = {
    id: 1,
    code: 'ELCHAPO10',
    title: 'Diskon 10%',
    discountType: 'percent',
    discountValue: 10,
    minOrder: 200000,
    isActive: true,
    expiresAt: null,
  };

  const summary = calculateCartSummary(
    [
      {
        productId: 1,
        productName: 'Heavy Boxy Tee',
        unitPrice: 250000,
        quantity: 2,
        stock: 5,
        status: 'active',
      },
    ],
    promo,
    25000
  );

  assert.equal(summary.subtotal, 500000);
  assert.equal(summary.promoDiscount, 50000);
  assert.equal(summary.shippingCost, 25000);
  assert.equal(summary.totalAmount, 475000);
  assert.equal(summary.totalQuantity, 2);
  assert.equal(summary.stockIssues.length, 0);

  const invalid = calculateCartSummary(
    [
      {
        productId: 2,
        productName: 'Slate Hoodie',
        unitPrice: 450000,
        quantity: 4,
        stock: 2,
        status: 'active',
      },
    ],
    null,
    25000
  );
  assert.equal(invalid.stockIssues.length, 1);
});

test('RBAC permission check honors admin, staff granular permissions, and suspended state', () => {
  assert.equal(
    hasStaffPermission({ role: 'admin', permissions: [], status: 'active' }, 'staff'),
    true
  );
  assert.equal(
    hasStaffPermission({ role: 'staff', permissions: ['orders', 'shipping'], status: 'active' }, 'orders'),
    true
  );
  assert.equal(
    hasStaffPermission({ role: 'staff', permissions: ['orders'], status: 'active' }, 'payments'),
    false
  );
  assert.equal(
    hasStaffPermission({ role: 'staff', permissions: ['orders'], status: 'suspended' }, 'orders'),
    false
  );
  assert.equal(
    hasStaffPermission({ role: 'customer', permissions: ['overview'], status: 'active' }, 'overview'),
    false
  );
});

test('Admin Google login authorization enforces allowlist, active staff roles, and blocks customers', () => {
  assert.equal(isAllowedAdminGoogleEmail('cr467304@gmail.com'), true);
  assert.equal(isAllowedAdminGoogleEmail('CR467304@GMAIL.COM'), true);
  assert.equal(isAllowedAdminGoogleEmail('random.user@gmail.com'), false);
  assert.equal(isAllowedAdminGoogleEmail('random.user@gmail.com', [], 'customer', 'active'), false);
  assert.equal(isAllowedAdminGoogleEmail('staff@elchapo.clg', [], 'staff', 'active'), true);
  assert.equal(isAllowedAdminGoogleEmail('staff@elchapo.clg', [], 'staff', 'suspended'), false);
  assert.equal(isAllowedAdminGoogleEmail('cr467304@gmail.com', [], 'admin', 'suspended'), false);
  assert.equal(isAllowedAdminGoogleEmail('partner@gmail.com', ['partner@gmail.com']), true);
});

test('WhatsApp normalization formats Indonesian numbers cleanly', () => {
  assert.equal(normalizeWhatsAppNumber('085647441648'), '6285647441648');
  assert.equal(normalizeWhatsAppNumber('+62 856-4744-1648'), '6285647441648');
  const url = formatWhatsAppUrl('085647441648', 'Halo elchapo.clg');
  assert.ok(url.startsWith('https://wa.me/6285647441648?text='));
});

test('route interpolation and order status validation', () => {
  assert.equal(isValidOrderStatus('Diproses'), true);
  assert.equal(isValidOrderStatus('UnknownStatus'), false);
  const mid = interpolateRouteProgress({ lat: -6.2, lng: 106.8 }, { lat: -6.4, lng: 107.0 }, 0.5);
  assert.equal(mid.lat, -6.3);
  assert.equal(mid.lng, 106.9);
});

test('Excel XML export escapes special characters and contains headers', () => {
  const sampleOrder: Order = {
    id: 1,
    orderNumber: 'ELC-001',
    userId: 2,
    recipientName: 'Budi & Co',
    recipientPhone: '085647441648',
    shippingAddress: 'Jl. Kemang <Utama>',
    notes: '',
    subtotal: 250000,
    discountAmount: 0,
    promoCode: null,
    shippingCost: 20000,
    shippingService: 'JNE Regular',
    shippingEta: '2-3 Hari',
    trackingNumber: 'JNE12345',
    totalAmount: 270000,
    paymentMethodId: 1,
    paymentMethodName: 'QRIS elchapo.clg',
    paymentType: 'qris',
    paymentChannel: 'QRIS',
    paymentProofUrl: '',
    paymentStatus: 'paid',
    orderStatus: 'Diproses',
    originLat: -6.26,
    originLng: 106.81,
    courierLat: -6.26,
    courierLng: 106.81,
    destLat: -6.21,
    destLng: 106.85,
    currentLocationLabel: 'Hub Kemang',
    createdAt: '2026-11-20T10:00:00Z',
    updatedAt: '2026-11-20T10:05:00Z',
    items: [],
    trackingEvents: [],
  };

  const xml = buildExcelSpreadsheetXml([sampleOrder]);
  assert.ok(xml.includes('Budi &amp; Co'));
  assert.ok(xml.includes('Jl. Kemang &lt;Utama&gt;'));
  assert.ok(xml.includes('ELC-001'));
});
