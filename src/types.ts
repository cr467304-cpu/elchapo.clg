export type UserRole = 'customer' | 'staff' | 'admin';

export type AdminPermission =
  | 'overview'
  | 'products'
  | 'orders'
  | 'payments'
  | 'shipping'
  | 'customers'
  | 'staff'
  | 'settings';

export const ALL_ADMIN_PERMISSIONS: AdminPermission[] = [
  'overview',
  'products',
  'orders',
  'payments',
  'shipping',
  'customers',
  'staff',
  'settings',
];

export type OrderStatus =
  | 'Menunggu Pembayaran'
  | 'Menunggu Konfirmasi'
  | 'Pembayaran Ditolak'
  | 'Diproses'
  | 'Dikirim'
  | 'Selesai'
  | 'Dibatalkan';

export type PaymentStatus = 'unpaid' | 'pending_confirmation' | 'paid' | 'rejected';

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  role: UserRole;
  permissions: AdminPermission[];
  status: 'active' | 'suspended';
  createdAt: string;
  totalSpent?: number;
  ordersCount?: number;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  productCount?: number;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string;
  material: string;
  categoryId: number;
  categoryName?: string;
  price: number;
  discountPrice: number | null;
  stock: number;
  status: 'active' | 'draft' | 'out_of_stock';
  isNewArrival: boolean;
  isBestSeller: boolean;
  sizes: string[];
  colors: string[];
  images: string[];
  salesCount: number;
  avgRating?: number;
  reviewCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  id: number;
  productId: number;
  productName: string;
  productImage: string;
  size: string;
  color: string;
  quantity: number;
  unitPrice: number;
  stock: number;
  status: string;
}

export interface PromoCode {
  id: number;
  code: string;
  title: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrder: number;
  isActive: boolean;
  expiresAt: string | null;
}

export type PaymentMethodType = 'qris' | 'gateway' | 'bank_transfer';

export interface PaymentMethod {
  id: number;
  code: string;
  name: string;
  type: PaymentMethodType;
  isActive: boolean;
  qrisImageUrl: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  instructions: string;
  gatewayChannels: string[];
  updatedBy: string;
  updatedAt: string;
}

export interface PaymentIncomingSummary {
  paymentMethodId: number;
  paymentMethodName: string;
  paymentType: PaymentMethodType;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  paidOrdersCount: number;
  paidTotalAmount: number;
  pendingCount: number;
  pendingAmount: number;
}

export interface PaymentSettingsHistory {
  id: number;
  paymentMethodId: number;
  changedBy: string;
  summary: string;
  createdAt: string;
}

export interface ShippingOption {
  id: number;
  serviceName: string;
  cost: number;
  eta: string;
  originCity: string;
  originLat: number;
  originLng: number;
  isActive: boolean;
}

export interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  productName: string;
  productImage: string;
  size: string;
  color: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderTrackingEvent {
  id: number;
  orderId: number;
  status: OrderStatus;
  title: string;
  description: string;
  locationName: string;
  lat: number;
  lng: number;
  createdAt: string;
}

export interface Order {
  id: number;
  orderNumber: string;
  userId: number;
  customerEmail?: string;
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  notes: string;
  subtotal: number;
  discountAmount: number;
  promoCode: string | null;
  shippingCost: number;
  shippingService: string;
  shippingEta: string;
  trackingNumber: string;
  totalAmount: number;
  paymentMethodId: number;
  paymentMethodName: string;
  paymentType: PaymentMethodType;
  paymentChannel: string;
  paymentProofUrl: string;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  originLat: number;
  originLng: number;
  courierLat: number;
  courierLng: number;
  destLat: number;
  destLng: number;
  currentLocationLabel: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  trackingEvents: OrderTrackingEvent[];
}

export interface Review {
  id: number;
  productId: number;
  userId: number;
  userName: string;
  orderId: number | null;
  rating: number;
  comment: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

export interface AppNotification {
  id: number;
  userId: number;
  orderId: number | null;
  channel: 'push' | 'whatsapp' | 'email' | 'in_app';
  recipient: string;
  title: string;
  message: string;
  metadata?: Record<string, string>;
  isRead: boolean;
  createdAt: string;
}

export interface WebsiteSettings {
  storeName: string;
  announcementText: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCta: string;
  heroImage: string;
  promoTitle: string;
  promoSubtitle: string;
  promoCta: string;
  promoImage: string;
  contactEmail: string;
  contactPhone: string;
  whatsappNumber: string;
  instagramUrl: string;
  tiktokUrl: string;
  footerAbout: string;
  privacyPolicy: string;
  termsConditions: string;
  returnPolicy: string;
  aboutStory: string;
}

export interface SalesSeriesPoint {
  label: string;
  revenue: number;
  orders: number;
}

export interface AdminOverviewData {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  pendingPaymentOrders: number;
  processingOrders: number;
  completedOrders: number;
  lowStockProducts: Product[];
  dailySales: SalesSeriesPoint[];
  weeklySales: SalesSeriesPoint[];
  monthlySales: SalesSeriesPoint[];
  recentNotifications: AppNotification[];
}
