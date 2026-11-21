import type {
  AdminPermission,
  Order,
  OrderStatus,
  PromoCode,
  User,
} from '../types.ts';

export function formatIDR(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safe);
}

export function getEffectivePrice(product: {
  price: number;
  discountPrice: number | null;
}): number {
  if (
    product.discountPrice !== null &&
    product.discountPrice > 0 &&
    product.discountPrice < product.price
  ) {
    return product.discountPrice;
  }
  return product.price;
}

export function calculateDiscountPercent(
  price: number,
  discountPrice: number | null
): number {
  if (!discountPrice || discountPrice <= 0 || discountPrice >= price || price <= 0) {
    return 0;
  }
  return Math.round(((price - discountPrice) / price) * 100);
}

export interface CartCalculationItem {
  productId: number;
  productName: string;
  unitPrice: number;
  quantity: number;
  stock: number;
  status: string;
}

export interface CartSummary {
  subtotal: number;
  promoDiscount: number;
  shippingCost: number;
  totalAmount: number;
  totalQuantity: number;
  stockIssues: string[];
}

export function calculateCartSummary(
  items: CartCalculationItem[],
  promo: PromoCode | null,
  shippingCost: number
): CartSummary {
  let subtotal = 0;
  let totalQuantity = 0;
  const stockIssues: string[] = [];

  for (const item of items) {
    if (item.quantity <= 0) {
      stockIssues.push(`${item.productName}: jumlah minimal 1.`);
      continue;
    }
    if (item.status !== 'active' || item.stock <= 0) {
      stockIssues.push(`${item.productName}: produk saat ini habis atau tidak aktif.`);
    } else if (item.quantity > item.stock) {
      stockIssues.push(
        `${item.productName}: stok tersisa ${item.stock}, jumlah diminta ${item.quantity}.`
      );
    }
    subtotal += item.unitPrice * item.quantity;
    totalQuantity += item.quantity;
  }

  let promoDiscount = 0;
  if (promo && promo.isActive && subtotal >= promo.minOrder && subtotal > 0) {
    if (promo.discountType === 'percent') {
      promoDiscount = Math.round((subtotal * promo.discountValue) / 100);
    } else {
      promoDiscount = Math.min(subtotal, Math.round(promo.discountValue));
    }
  }

  const safeShipping = items.length > 0 ? Math.max(0, Math.round(shippingCost)) : 0;
  const totalAmount = Math.max(0, subtotal - promoDiscount + safeShipping);

  return {
    subtotal,
    promoDiscount,
    shippingCost: safeShipping,
    totalAmount,
    totalQuantity,
    stockIssues,
  };
}

export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  'Menunggu Pembayaran',
  'Menunggu Konfirmasi',
  'Pembayaran Ditolak',
  'Diproses',
  'Dikirim',
  'Selesai',
  'Dibatalkan',
];

export function isValidOrderStatus(status: string): status is OrderStatus {
  return (ORDER_STATUS_SEQUENCE as string[]).includes(status);
}

export const PRIMARY_ADMIN_GOOGLE_EMAIL = 'cr467304@gmail.com';

export function isAllowedAdminGoogleEmail(
  email: string,
  extraAllowedEmails: string[] = [],
  existingUserRole?: string | null,
  existingUserStatus?: string | null
): boolean {
  const clean = email.trim().toLowerCase();
  if (!clean) return false;
  if (existingUserStatus === 'suspended') return false;

  const allowlist = new Set<string>([
    PRIMARY_ADMIN_GOOGLE_EMAIL,
    ...extraAllowedEmails.map((e) => e.trim().toLowerCase()).filter(Boolean),
  ]);

  if (allowlist.has(clean)) return true;
  if (existingUserRole === 'admin' || existingUserRole === 'staff') return true;
  return false;
}

export function hasStaffPermission(
  user: Pick<User, 'role' | 'permissions' | 'status'> | null | undefined,
  permission: AdminPermission
): boolean {
  if (!user || user.status !== 'active') return false;
  if (user.role === 'admin') return true;
  if (user.role === 'staff') {
    return Array.isArray(user.permissions) && user.permissions.includes(permission);
  }
  return false;
}

export function normalizeWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith('62')) {
    return digits;
  }
  return `62${digits}`;
}

export function formatWhatsAppUrl(phone: string, message: string): string {
  const normalized = normalizeWhatsAppNumber(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function interpolateRouteProgress(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  progress: number
): { lat: number; lng: number } {
  const clamped = Math.max(0, Math.min(1, progress));
  return {
    lat: Number((origin.lat + (dest.lat - origin.lat) * clamped).toFixed(6)),
    lng: Number((origin.lng + (dest.lng - origin.lng) * clamped).toFixed(6)),
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildExcelSpreadsheetXml(orders: Order[]): string {
  const headers = [
    'No. Pesanan',
    'Tanggal',
    'Penerima',
    'Telepon',
    'Alamat Pengiriman',
    'Metode Pembayaran',
    'Status Pembayaran',
    'Status Pesanan',
    'No. Resi',
    'Subtotal',
    'Diskon',
    'Ongkir',
    'Total Pembayaran',
  ];

  const headerCells = headers
    .map(
      (h) =>
        `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`
    )
    .join('');

  const dataRows = orders
    .map((o) => {
      const cells: Array<{ type: 'String' | 'Number'; val: string | number }> = [
        { type: 'String', val: o.orderNumber },
        { type: 'String', val: o.createdAt },
        { type: 'String', val: o.recipientName },
        { type: 'String', val: o.recipientPhone },
        { type: 'String', val: o.shippingAddress },
        { type: 'String', val: `${o.paymentMethodName}${o.paymentChannel ? ` (${o.paymentChannel})` : ''}` },
        { type: 'String', val: o.paymentStatus },
        { type: 'String', val: o.orderStatus },
        { type: 'String', val: o.trackingNumber || '-' },
        { type: 'Number', val: o.subtotal },
        { type: 'Number', val: o.discountAmount },
        { type: 'Number', val: o.shippingCost },
        { type: 'Number', val: o.totalAmount },
      ];
      return `<Row>${cells
        .map(
          (c) =>
            `<Cell><Data ss:Type="${c.type}">${escapeXml(String(c.val))}</Data></Cell>`
        )
        .join('')}</Row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#111113" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Riwayat Transaksi">
  <Table>
   <Row>${headerCells}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;
}
