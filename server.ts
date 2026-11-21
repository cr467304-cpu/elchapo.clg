import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  getApp as getFirebaseAdminApp,
  getApps as getFirebaseAdminApps,
  initializeApp as initializeFirebaseAdminApp,
  type App as FirebaseAdminApp,
} from 'firebase-admin/app';
import { getAuth as getFirebaseAdminAuth } from 'firebase-admin/auth';
import { db, UPLOAD_DIR } from './server/db.ts';
import {
  clearSessionCookie,
  extractTokenFromRequest,
  hashPassword,
  setSessionCookie,
  signSessionToken,
  verifyCsrfForCookieMutation,
  verifyPassword,
  verifySessionToken,
  type AuthenticatedUser,
} from './server/auth.ts';
import {
  ALL_ADMIN_PERMISSIONS,
  type AdminPermission,
  type Order,
  type OrderItem,
  type OrderStatus,
  type OrderTrackingEvent,
  type PaymentIncomingSummary,
  type PaymentMethod,
  type PaymentMethodType,
  type Product,
  type PromoCode,
  type ShippingOption,
  type User,
  type UserRole,
  type WebsiteSettings,
} from './src/types.ts';
import {
  calculateCartSummary,
  formatIDR,
  formatWhatsAppUrl,
  hasStaffPermission,
  interpolateRouteProgress,
  isAllowedAdminGoogleEmail,
  isValidOrderStatus,
  normalizeWhatsAppNumber,
} from './src/utils/commerce.ts';

const PORT = 3000;
const STORE_WHATSAPP = '085647441648';

function initFirebaseAdminForTokenVerification(): FirebaseAdminApp | null {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) return null;
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { projectId?: string };
    if (!raw.projectId || raw.projectId === 'remixed-project-id') return null;
    return getFirebaseAdminApps().length
      ? getFirebaseAdminApp()
      : initializeFirebaseAdminApp({ projectId: raw.projectId });
  } catch {
    return null;
  }
}

const firebaseAdminApp = initFirebaseAdminForTokenVerification();

// SSE clients keyed by userId
const sseClients = new Map<number, Set<Response>>();

function broadcastUserEvent(userId: number, eventName: string, payload: unknown): void {
  const clients = sseClients.get(userId);
  if (!clients || clients.size === 0) return;
  const serialized = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(serialized);
    } catch {
      clients.delete(res);
    }
  }
}

function broadcastStaffEvent(eventName: string, payload: unknown): void {
  const staffRows = db
    .prepare("SELECT id FROM users WHERE role IN ('admin', 'staff') AND status = 'active'")
    .all() as Array<{ id: number }>;
  for (const row of staffRows) {
    broadcastUserEvent(row.id, eventName, payload);
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function parseJsonArray<T>(raw: string | null | undefined, fallback: T[] = []): T[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function mapUserRow(row: Record<string, unknown>): AuthenticatedUser {
  return {
    id: Number(row.id),
    name: String(row.name),
    email: String(row.email),
    phone: String(row.phone ?? ''),
    address: String(row.address ?? ''),
    city: String(row.city ?? ''),
    postalCode: String(row.postal_code ?? ''),
    role: row.role as UserRole,
    permissions: parseJsonArray<AdminPermission>(String(row.permissions_json ?? '[]')),
    status: (row.status as 'active' | 'suspended') || 'active',
    createdAt: String(row.created_at),
  };
}

function mapProductRow(row: Record<string, unknown>): Product {
  return {
    id: Number(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: String(row.description ?? ''),
    material: String(row.material ?? ''),
    categoryId: Number(row.category_id),
    categoryName: row.category_name ? String(row.category_name) : undefined,
    price: Number(row.price),
    discountPrice: row.discount_price !== null && row.discount_price !== undefined ? Number(row.discount_price) : null,
    stock: Number(row.stock),
    status: row.status as Product['status'],
    isNewArrival: Boolean(row.is_new_arrival),
    isBestSeller: Boolean(row.is_best_seller),
    sizes: parseJsonArray<string>(String(row.sizes_json)),
    colors: parseJsonArray<string>(String(row.colors_json)),
    images: parseJsonArray<string>(String(row.images_json)),
    salesCount: Number(row.sales_count ?? 0),
    avgRating: row.avg_rating !== undefined && row.avg_rating !== null ? Number(Number(row.avg_rating).toFixed(1)) : 0,
    reviewCount: row.review_count !== undefined ? Number(row.review_count) : 0,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function getWebsiteSettings(): WebsiteSettings {
  const rows = db.prepare('SELECT key, value FROM website_settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const record: Record<string, string> = {};
  for (const r of rows) {
    record[r.key] = r.value;
  }
  return {
    storeName: record.storeName || 'elchapo.clg',
    announcementText: record.announcementText || '',
    heroTitle: record.heroTitle || 'Essential Streetwear.',
    heroSubtitle: record.heroSubtitle || '',
    heroCta: record.heroCta || 'Jelajahi Koleksi',
    heroImage: record.heroImage || '/src/assets/images/hero_streetwear_campaign_1795224764469.jpg',
    promoTitle: record.promoTitle || '',
    promoSubtitle: record.promoSubtitle || '',
    promoCta: record.promoCta || 'Belanja Koleksi Promo',
    promoImage: record.promoImage || '/src/assets/images/promo_banner_capsule_1795224764816.jpg',
    contactEmail: record.contactEmail || 'hello@elchapo.clg',
    contactPhone: record.contactPhone || STORE_WHATSAPP,
    whatsappNumber: record.whatsappNumber || STORE_WHATSAPP,
    instagramUrl: record.instagramUrl || 'https://instagram.com/elchapo.clg',
    tiktokUrl: record.tiktokUrl || 'https://tiktok.com/@elchapo.clg',
    footerAbout: record.footerAbout || '',
    privacyPolicy: record.privacyPolicy || '',
    termsConditions: record.termsConditions || '',
    returnPolicy: record.returnPolicy || '',
    aboutStory: record.aboutStory || '',
  };
}

function getOrderWithDetails(orderRow: Record<string, unknown>): Order {
  const orderId = Number(orderRow.id);
  const itemsRaw = db
    .prepare('SELECT * FROM order_items WHERE order_id = ?')
    .all(orderId) as Array<Record<string, unknown>>;
  const eventsRaw = db
    .prepare('SELECT * FROM order_tracking_events WHERE order_id = ? ORDER BY id ASC')
    .all(orderId) as Array<Record<string, unknown>>;

  const items: OrderItem[] = itemsRaw.map((i) => ({
    id: Number(i.id),
    orderId: Number(i.order_id),
    productId: Number(i.product_id),
    productName: String(i.product_name),
    productImage: String(i.product_image),
    size: String(i.size),
    color: String(i.color),
    unitPrice: Number(i.unit_price),
    quantity: Number(i.quantity),
    lineTotal: Number(i.line_total),
  }));

  const trackingEvents: OrderTrackingEvent[] = eventsRaw.map((e) => ({
    id: Number(e.id),
    orderId: Number(e.order_id),
    status: e.status as OrderStatus,
    title: String(e.title),
    description: String(e.description),
    locationName: String(e.location_name),
    lat: Number(e.lat),
    lng: Number(e.lng),
    createdAt: String(e.created_at),
  }));

  return {
    id: orderId,
    orderNumber: String(orderRow.order_number),
    userId: Number(orderRow.user_id),
    customerEmail: orderRow.customer_email ? String(orderRow.customer_email) : undefined,
    recipientName: String(orderRow.recipient_name),
    recipientPhone: String(orderRow.recipient_phone),
    shippingAddress: String(orderRow.shipping_address),
    notes: String(orderRow.notes ?? ''),
    subtotal: Number(orderRow.subtotal),
    discountAmount: Number(orderRow.discount_amount),
    promoCode: orderRow.promo_code ? String(orderRow.promo_code) : null,
    shippingCost: Number(orderRow.shipping_cost),
    shippingService: String(orderRow.shipping_service),
    shippingEta: String(orderRow.shipping_eta),
    trackingNumber: String(orderRow.tracking_number ?? ''),
    totalAmount: Number(orderRow.total_amount),
    paymentMethodId: Number(orderRow.payment_method_id),
    paymentMethodName: String(orderRow.payment_method_name),
    paymentType: orderRow.payment_type as PaymentMethodType,
    paymentChannel: String(orderRow.payment_channel ?? ''),
    paymentProofUrl: String(orderRow.payment_proof_url ?? ''),
    paymentStatus: orderRow.payment_status as Order['paymentStatus'],
    orderStatus: orderRow.order_status as OrderStatus,
    originLat: Number(orderRow.origin_lat),
    originLng: Number(orderRow.origin_lng),
    courierLat: Number(orderRow.courier_lat),
    courierLng: Number(orderRow.courier_lng),
    destLat: Number(orderRow.dest_lat),
    destLng: Number(orderRow.dest_lng),
    currentLocationLabel: String(orderRow.current_location_label ?? ''),
    createdAt: String(orderRow.created_at),
    updatedAt: String(orderRow.updated_at),
    items,
    trackingEvents,
  };
}

function resolveDestinationCoords(addressText: string): { lat: number; lng: number; cityLabel: string } {
  const lower = addressText.toLowerCase();
  if (lower.includes('bandung')) return { lat: -6.9175, lng: 107.6191, cityLabel: 'Bandung, Jawa Barat' };
  if (lower.includes('surabaya')) return { lat: -7.2575, lng: 112.7521, cityLabel: 'Surabaya, Jawa Timur' };
  if (lower.includes('yogyakarta') || lower.includes('jogja'))
    return { lat: -7.7956, lng: 110.3695, cityLabel: 'DI Yogyakarta' };
  if (lower.includes('semarang')) return { lat: -6.9667, lng: 110.4167, cityLabel: 'Semarang, Jawa Tengah' };
  if (lower.includes('bekasi')) return { lat: -6.2383, lng: 106.9756, cityLabel: 'Bekasi, Jawa Barat' };
  if (lower.includes('tangerang')) return { lat: -6.1702, lng: 106.6403, cityLabel: 'Tangerang, Banten' };
  if (lower.includes('depok')) return { lat: -6.4025, lng: 106.7942, cityLabel: 'Depok, Jawa Barat' };
  if (lower.includes('bogor')) return { lat: -6.5971, lng: 106.806, cityLabel: 'Bogor, Jawa Barat' };
  if (lower.includes('medan')) return { lat: 3.5952, lng: 98.6722, cityLabel: 'Medan, Sumatera Utara' };
  if (lower.includes('bali') || lower.includes('denpasar'))
    return { lat: -8.6705, lng: 115.2126, cityLabel: 'Denpasar, Bali' };
  // Default Central Jakarta delivery target
  return { lat: -6.1944, lng: 106.8229, cityLabel: 'Jakarta Pusat, DKI Jakarta' };
}

function dispatchNotifications(params: {
  userId: number;
  orderId: number;
  orderNumber: string;
  recipientPhone: string;
  recipientEmail: string;
  title: string;
  message: string;
  channels: Array<'push' | 'whatsapp' | 'email' | 'in_app'>;
}): void {
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO notifications (user_id, order_id, channel, recipient, title, message, metadata_json, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);

  for (const channel of params.channels) {
    let recipient = params.recipientEmail;
    const metadata: Record<string, string> = { orderNumber: params.orderNumber };

    if (channel === 'whatsapp') {
      recipient = normalizeWhatsAppNumber(params.recipientPhone || STORE_WHATSAPP);
      metadata.whatsappUrl = formatWhatsAppUrl(
        params.recipientPhone || STORE_WHATSAPP,
        params.message
      );
      metadata.senderWhatsApp = STORE_WHATSAPP;
    }

    const info = insert.run(
      params.userId,
      params.orderId,
      channel,
      recipient,
      params.title,
      params.message,
      JSON.stringify(metadata),
      now
    );

    const createdNotification = {
      id: Number(info.lastInsertRowid),
      userId: params.userId,
      orderId: params.orderId,
      channel,
      recipient,
      title: params.title,
      message: params.message,
      metadata,
      isRead: false,
      createdAt: now,
    };

    if (channel === 'push' || channel === 'in_app') {
      broadcastUserEvent(params.userId, 'notification', createdNotification);
    }
  }
}

interface RequestWithAuth extends Request {
  authUser?: AuthenticatedUser;
}

function attachAuth(req: RequestWithAuth, _res: Response, next: NextFunction): void {
  const token = extractTokenFromRequest(req);
  if (token) {
    const payload = verifySessionToken(token);
    if (payload) {
      const row = db
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(payload.userId) as Record<string, unknown> | undefined;
      if (row && row.status === 'active') {
        req.authUser = mapUserRow(row);
      }
    }
  }
  next();
}

function requireAuth(req: RequestWithAuth, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
    return;
  }
  next();
}

function requireStaff(permission: AdminPermission) {
  return (req: RequestWithAuth, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Akses ditolak. Login admin/staf diperlukan.' });
      return;
    }
    if (!hasStaffPermission(req.authUser, permission)) {
      res.status(403).json({
        error: `Akses ditolak. Anda tidak memiliki izin '${permission}'.`,
      });
      return;
    }
    next();
  };
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));
  app.use('/uploads', express.static(UPLOAD_DIR));

  app.use('/api', verifyCsrfForCookieMutation);
  app.use('/api', attachAuth);

  // Real-time SSE stream for order status & push notifications
  app.get('/api/events', requireAuth, (req: RequestWithAuth, res: Response) => {
    const userId = req.authUser!.id;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let set = sseClients.get(userId);
    if (!set) {
      set = new Set();
      sseClients.set(userId, set);
    }
    set.add(res);

    res.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);

    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      set?.delete(res);
    });
  });

  // Upload image safely with MIME & path confinement
  app.post('/api/uploads', requireAuth, (req: RequestWithAuth, res: Response) => {
    const { filename, mimeType, dataBase64 } = req.body as {
      filename?: string;
      mimeType?: string;
      dataBase64?: string;
    };

    const allowedMimes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
    if (!mimeType || !allowedMimes.has(mimeType.toLowerCase())) {
      res.status(400).json({ error: 'Format gambar harus PNG, JPG, atau WEBP.' });
      return;
    }
    if (!dataBase64 || typeof dataBase64 !== 'string') {
      res.status(400).json({ error: 'Data gambar tidak valid.' });
      return;
    }

    const stripped = dataBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    const buffer = Buffer.from(stripped, 'base64');
    if (buffer.length === 0 || buffer.length > 3 * 1024 * 1024) {
      res.status(400).json({ error: 'Ukuran gambar maksimal 3 MB.' });
      return;
    }

    const ext =
      mimeType.toLowerCase() === 'image/png'
        ? '.png'
        : mimeType.toLowerCase() === 'image/webp'
        ? '.webp'
        : '.jpg';
    const baseName = slugify(path.basename(filename || 'upload', path.extname(filename || ''))) || 'img';
    const safeName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${baseName}${ext}`;
    const resolved = path.resolve(UPLOAD_DIR, safeName);

    if (!resolved.startsWith(UPLOAD_DIR + path.sep)) {
      res.status(400).json({ error: 'Path upload tidak valid.' });
      return;
    }

    fs.writeFileSync(resolved, buffer);
    res.json({ url: `/uploads/${safeName}` });
  });

  // ==================== AUTH ROUTES ====================
  app.get('/api/auth/me', (req: RequestWithAuth, res: Response) => {
    res.json({ user: req.authUser || null });
  });

  app.post('/api/auth/register', (req: RequestWithAuth, res: Response) => {
    const { name, email, phone, password, address, city, postalCode } = req.body as Record<
      string,
      string
    >;
    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      res.status(400).json({
        error: 'Nama, email valid, dan password minimal 6 karakter wajib diisi.',
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      res.status(409).json({ error: 'Email sudah terdaftar. Silakan login.' });
      return;
    }

    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);
    const info = db
      .prepare(
        `INSERT INTO users (name, email, phone, address, city, postal_code, password_hash, role, permissions_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'customer', '[]', 'active', ?)`
      )
      .run(
        name.trim(),
        cleanEmail,
        (phone || '').trim(),
        (address || '').trim(),
        (city || 'Jakarta').trim(),
        (postalCode || '').trim(),
        passwordHash,
        now
      );

    const userRow = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as Record<string, unknown>;
    const user = mapUserRow(userRow);
    const token = signSessionToken({ userId: user.id, email: user.email, role: user.role });
    setSessionCookie(res, token);
    res.status(201).json({ user, token });
  });

  app.post('/api/auth/login', (req: RequestWithAuth, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email?.trim() || !password) {
      res.status(400).json({ error: 'Email dan password wajib diisi.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const row = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(cleanEmail) as Record<string, unknown> | undefined;

    if (!row || !verifyPassword(password, String(row.password_hash))) {
      res.status(401).json({ error: 'Email atau password salah.' });
      return;
    }
    if (row.status !== 'active') {
      res.status(403).json({ error: 'Akun Anda sedang dinonaktifkan.' });
      return;
    }

    const user = mapUserRow(row);
    const token = signSessionToken({ userId: user.id, email: user.email, role: user.role });
    setSessionCookie(res, token);
    res.json({ user, token });
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.put('/api/auth/profile', requireAuth, (req: RequestWithAuth, res: Response) => {
    const { name, phone, address, city, postalCode } = req.body as Record<string, string>;
    if (!name?.trim()) {
      res.status(400).json({ error: 'Nama tidak boleh kosong.' });
      return;
    }
    db.prepare(
      'UPDATE users SET name = ?, phone = ?, address = ?, city = ?, postal_code = ? WHERE id = ?'
    ).run(
      name.trim(),
      (phone || '').trim(),
      (address || '').trim(),
      (city || '').trim(),
      (postalCode || '').trim(),
      req.authUser!.id
    );
    const updated = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(req.authUser!.id) as Record<string, unknown>;
    res.json({ user: mapUserRow(updated) });
  });

  app.put('/api/auth/password', requireAuth, (req: RequestWithAuth, res: Response) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
      return;
    }
    const row = db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(req.authUser!.id) as { password_hash: string };
    if (!verifyPassword(currentPassword, row.password_hash)) {
      res.status(400).json({ error: 'Password saat ini tidak sesuai.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(newPassword),
      req.authUser!.id
    );
    res.json({ ok: true });
  });

  // ==================== ADMIN BOOTSTRAP & PASSCODE ====================
  app.get('/api/admin/bootstrap-status', (_req: Request, res: Response) => {
    const adminCount = db
      .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
      .get() as { count: number };
    const envPasscodeConfigured = Boolean(
      process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0
    );
    res.json({
      needsBootstrap: adminCount.count === 0 && !envPasscodeConfigured,
      envPasscodeConfigured,
      googleAdminEnabled: Boolean(firebaseAdminApp),
    });
  });

  // Exclusive Admin / Staff Google Sign-In via verified Firebase ID Token
  app.post('/api/admin/google-login', async (req: Request, res: Response) => {
    if (!firebaseAdminApp) {
      res.status(503).json({
        error: 'Autentikasi Google Admin belum dikonfigurasi pada server.',
      });
      return;
    }

    const { idToken } = req.body as { idToken?: string };
    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({ error: 'Token autentikasi Google tidak valid.' });
      return;
    }

    try {
      const decoded = await getFirebaseAdminAuth(firebaseAdminApp).verifyIdToken(idToken);
      const email = decoded.email?.trim().toLowerCase() || '';
      if (!email || !decoded.email_verified) {
        res.status(403).json({
          error: 'Akun Google harus memiliki alamat email yang terverifikasi.',
        });
        return;
      }

      const envAllowedEmails = (process.env.ADMIN_GOOGLE_EMAILS || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      let userRow = db
        .prepare('SELECT * FROM users WHERE LOWER(email) = ?')
        .get(email) as Record<string, unknown> | undefined;

      const allowed = isAllowedAdminGoogleEmail(
        email,
        envAllowedEmails,
        userRow ? String(userRow.role) : null,
        userRow ? String(userRow.status) : null
      );

      if (!allowed) {
        res.status(403).json({
          error: `Akun Google (${email}) tidak terdaftar sebagai Administrator atau Staf elchapo.clg.`,
        });
        return;
      }

      const now = new Date().toISOString();
      if (!userRow) {
        const displayName =
          (typeof decoded.name === 'string' && decoded.name.trim()) ||
          'Administrator elchapo.clg';
        const info = db
          .prepare(
            `INSERT INTO users (name, email, phone, address, city, postal_code, password_hash, role, permissions_json, status, created_at)
             VALUES (?, ?, ?, '', 'Jakarta Selatan', '', ?, 'admin', ?, 'active', ?)`
          )
          .run(
            displayName,
            email,
            STORE_WHATSAPP,
            hashPassword(crypto.randomBytes(24).toString('hex')),
            JSON.stringify(ALL_ADMIN_PERMISSIONS),
            now
          );
        userRow = db
          .prepare('SELECT * FROM users WHERE id = ?')
          .get(Number(info.lastInsertRowid)) as Record<string, unknown>;
      } else if (
        userRow.role !== 'admin' &&
        isAllowedAdminGoogleEmail(email, envAllowedEmails, null, String(userRow.status))
      ) {
        // Ensure primary allowlisted owner Google account always holds admin role
        db.prepare('UPDATE users SET role = ?, permissions_json = ? WHERE id = ?').run(
          'admin',
          JSON.stringify(ALL_ADMIN_PERMISSIONS),
          Number(userRow.id)
        );
        userRow = db
          .prepare('SELECT * FROM users WHERE id = ?')
          .get(Number(userRow.id)) as Record<string, unknown>;
      }

      const user = mapUserRow(userRow);
      const token = signSessionToken({ userId: user.id, email: user.email, role: user.role });
      setSessionCookie(res, token);
      res.json({ user, token });
    } catch {
      res.status(401).json({
        error: 'Verifikasi login Google gagal atau sesi telah kedaluwarsa.',
      });
    }
  });

  app.post('/api/admin/bootstrap', (req: Request, res: Response) => {
    const { name, email, password, passcode } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      passcode?: string;
    };

    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    if (envPasscode) {
      if (!passcode || passcode !== envPasscode) {
        res.status(403).json({ error: 'Passcode admin tidak sesuai.' });
        return;
      }
      // Find or create default owner admin for env-configured passcode
      let existing = db
        .prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1")
        .get() as Record<string, unknown> | undefined;
      if (!existing) {
        const now = new Date().toISOString();
        const info = db
          .prepare(
            `INSERT INTO users (name, email, phone, address, city, postal_code, password_hash, role, permissions_json, status, created_at)
             VALUES (?, ?, ?, '', 'Jakarta Selatan', '', ?, 'admin', ?, 'active', ?)`
          )
          .run(
            name?.trim() || 'Owner elchapo.clg',
            email?.trim().toLowerCase() || 'admin@elchapo.clg',
            STORE_WHATSAPP,
            hashPassword(envPasscode),
            JSON.stringify(ALL_ADMIN_PERMISSIONS),
            now
          );
        existing = db
          .prepare('SELECT * FROM users WHERE id = ?')
          .get(Number(info.lastInsertRowid)) as Record<string, unknown>;
      }
      const user = mapUserRow(existing);
      const token = signSessionToken({ userId: user.id, email: user.email, role: user.role });
      setSessionCookie(res, token);
      res.json({ user, token });
      return;
    }

    const adminCount = db
      .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
      .get() as { count: number };
    if (adminCount.count > 0) {
      res.status(409).json({
        error: 'Akun Administrator utama sudah diklaim. Silakan login menggunakan email & password.',
      });
      return;
    }

    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      res.status(400).json({
        error: 'Nama, email, dan password minimal 6 karakter wajib diisi.',
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existingEmail) {
      res.status(409).json({ error: 'Email sudah digunakan oleh akun lain.' });
      return;
    }

    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO users (name, email, phone, address, city, postal_code, password_hash, role, permissions_json, status, created_at)
         VALUES (?, ?, ?, '', 'Jakarta Selatan', '', ?, 'admin', ?, 'active', ?)`
      )
      .run(
        name.trim(),
        cleanEmail,
        STORE_WHATSAPP,
        hashPassword(password),
        JSON.stringify(ALL_ADMIN_PERMISSIONS),
        now
      );

    const row = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as Record<string, unknown>;
    const user = mapUserRow(row);
    const token = signSessionToken({ userId: user.id, email: user.email, role: user.role });
    setSessionCookie(res, token);
    res.status(201).json({ user, token });
  });

  // ==================== PUBLIC STOREFRONT ROUTES ====================
  app.get('/api/storefront', (_req: Request, res: Response) => {
    const settings = getWebsiteSettings();
    const categories = db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status != 'draft') as product_count
         FROM categories c ORDER BY c.sort_order ASC, c.id ASC`
      )
      .all() as Array<Record<string, unknown>>;

    const products = db
      .prepare(
        `SELECT p.*, c.name as category_name,
          COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id), 0) as avg_rating,
          (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) as review_count
         FROM products p
         JOIN categories c ON p.category_id = c.id
         WHERE p.status != 'draft'
         ORDER BY p.id DESC`
      )
      .all() as Array<Record<string, unknown>>;

    const paymentMethods = db
      .prepare('SELECT * FROM payment_methods WHERE is_active = 1 ORDER BY id ASC')
      .all() as Array<Record<string, unknown>>;

    const shippingOptions = db
      .prepare('SELECT * FROM shipping_settings WHERE is_active = 1 ORDER BY cost ASC')
      .all() as Array<Record<string, unknown>>;

    const promos = db
      .prepare('SELECT * FROM promotions WHERE is_active = 1 ORDER BY id DESC')
      .all() as Array<Record<string, unknown>>;

    res.json({
      settings,
      categories: categories.map((c) => ({
        id: Number(c.id),
        name: String(c.name),
        slug: String(c.slug),
        description: String(c.description),
        sortOrder: Number(c.sort_order),
        productCount: Number(c.product_count ?? 0),
      })),
      products: products.map(mapProductRow),
      paymentMethods: paymentMethods.map((pm) => ({
        id: Number(pm.id),
        code: String(pm.code),
        name: String(pm.name),
        type: pm.type as PaymentMethodType,
        isActive: Boolean(pm.is_active),
        qrisImageUrl: String(pm.qris_image_url ?? ''),
        bankName: String(pm.bank_name ?? ''),
        accountNumber: String(pm.account_number ?? ''),
        accountHolder: String(pm.account_holder ?? ''),
        instructions: String(pm.instructions ?? ''),
        gatewayChannels: parseJsonArray<string>(String(pm.gateway_channels_json)),
        updatedBy: String(pm.updated_by),
        updatedAt: String(pm.updated_at),
      })),
      shippingOptions: shippingOptions.map((s) => ({
        id: Number(s.id),
        serviceName: String(s.service_name),
        cost: Number(s.cost),
        eta: String(s.eta),
        originCity: String(s.origin_city),
        originLat: Number(s.origin_lat),
        originLng: Number(s.origin_lng),
        isActive: Boolean(s.is_active),
      })),
      promotions: promos.map((pr) => ({
        id: Number(pr.id),
        code: String(pr.code),
        title: String(pr.title),
        discountType: pr.discount_type as 'percent' | 'fixed',
        discountValue: Number(pr.discount_value),
        minOrder: Number(pr.min_order),
        isActive: Boolean(pr.is_active),
        expiresAt: pr.expires_at ? String(pr.expires_at) : null,
      })),
    });
  });

  app.get('/api/products/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const row = db
      .prepare(
        `SELECT p.*, c.name as category_name,
          COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id), 0) as avg_rating,
          (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) as review_count
         FROM products p
         JOIN categories c ON p.category_id = c.id
         WHERE p.id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Produk tidak ditemukan.' });
      return;
    }

    const reviews = db
      .prepare('SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC')
      .all(id) as Array<Record<string, unknown>>;

    res.json({
      product: mapProductRow(row),
      reviews: reviews.map((r) => ({
        id: Number(r.id),
        productId: Number(r.product_id),
        userId: Number(r.user_id),
        userName: String(r.user_name),
        orderId: r.order_id ? Number(r.order_id) : null,
        rating: Number(r.rating),
        comment: String(r.comment),
        verifiedPurchase: Boolean(r.verified_purchase),
        createdAt: String(r.created_at),
      })),
    });
  });

  app.post('/api/products/:id/reviews', requireAuth, (req: RequestWithAuth, res: Response) => {
    const productId = Number(req.params.id);
    const { rating, comment } = req.body as { rating?: number; comment?: string };
    const cleanRating = Math.round(Number(rating));
    if (!Number.isFinite(cleanRating) || cleanRating < 1 || cleanRating > 5 || !comment?.trim()) {
      res.status(400).json({ error: 'Rating (1–5) dan ulasan wajib diisi.' });
      return;
    }

    // Verify customer actually purchased this product with paid order
    const verifiedOrder = db
      .prepare(
        `SELECT o.id FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.user_id = ? AND oi.product_id = ? AND o.payment_status = 'paid'
         LIMIT 1`
      )
      .get(req.authUser!.id, productId) as { id: number } | undefined;

    if (!verifiedOrder) {
      res.status(403).json({
        error: 'Hanya pelanggan yang telah membeli dan melunasi produk ini yang dapat memberikan ulasan.',
      });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM reviews WHERE product_id = ? AND user_id = ?')
      .get(productId, req.authUser!.id);
    if (existing) {
      res.status(409).json({ error: 'Anda sudah memberikan ulasan untuk produk ini.' });
      return;
    }

    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO reviews (product_id, user_id, user_name, order_id, rating, comment, verified_purchase, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
      )
      .run(
        productId,
        req.authUser!.id,
        req.authUser!.name,
        verifiedOrder.id,
        cleanRating,
        comment.trim(),
        now
      );

    res.status(201).json({
      review: {
        id: Number(info.lastInsertRowid),
        productId,
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        orderId: verifiedOrder.id,
        rating: cleanRating,
        comment: comment.trim(),
        verifiedPurchase: true,
        createdAt: now,
      },
    });
  });

  // ==================== WISHLIST ROUTES ====================
  app.get('/api/wishlist', requireAuth, (req: RequestWithAuth, res: Response) => {
    const rows = db
      .prepare('SELECT product_id FROM wishlists WHERE user_id = ? ORDER BY id DESC')
      .all(req.authUser!.id) as Array<{ product_id: number }>;
    res.json({ productIds: rows.map((r) => Number(r.product_id)) });
  });

  app.post('/api/wishlist/toggle', requireAuth, (req: RequestWithAuth, res: Response) => {
    const productId = Number((req.body as { productId?: number }).productId);
    if (!productId) {
      res.status(400).json({ error: 'Produk tidak valid.' });
      return;
    }
    const exists = db
      .prepare('SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?')
      .get(req.authUser!.id, productId) as { id: number } | undefined;

    if (exists) {
      db.prepare('DELETE FROM wishlists WHERE id = ?').run(exists.id);
    } else {
      db.prepare('INSERT INTO wishlists (user_id, product_id, created_at) VALUES (?, ?, ?)').run(
        req.authUser!.id,
        productId,
        new Date().toISOString()
      );
    }
    const rows = db
      .prepare('SELECT product_id FROM wishlists WHERE user_id = ? ORDER BY id DESC')
      .all(req.authUser!.id) as Array<{ product_id: number }>;
    res.json({ productIds: rows.map((r) => Number(r.product_id)) });
  });

  // ==================== CART ROUTES ====================
  function fetchUserCart(userId: number) {
    const rows = db
      .prepare(
        `SELECT ci.id, ci.product_id, ci.size, ci.color, ci.quantity,
                p.name as product_name, p.price, p.discount_price, p.stock, p.status, p.images_json
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         WHERE ci.user_id = ?
         ORDER BY ci.id DESC`
      )
      .all(userId) as Array<Record<string, unknown>>;

    return rows.map((r) => {
      const price = Number(r.price);
      const disc = r.discount_price !== null ? Number(r.discount_price) : null;
      const unitPrice = disc !== null && disc > 0 && disc < price ? disc : price;
      const images = parseJsonArray<string>(String(r.images_json));
      return {
        id: Number(r.id),
        productId: Number(r.product_id),
        productName: String(r.product_name),
        productImage: images[0] || '',
        size: String(r.size),
        color: String(r.color),
        quantity: Number(r.quantity),
        unitPrice,
        stock: Number(r.stock),
        status: String(r.status),
      };
    });
  }

  app.get('/api/cart', requireAuth, (req: RequestWithAuth, res: Response) => {
    res.json({ items: fetchUserCart(req.authUser!.id) });
  });

  app.post('/api/cart', requireAuth, (req: RequestWithAuth, res: Response) => {
    const { productId, size, color, quantity } = req.body as {
      productId?: number;
      size?: string;
      color?: string;
      quantity?: number;
    };
    const pid = Number(productId);
    const qty = Math.max(1, Math.round(Number(quantity || 1)));
    const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(pid) as
      | Record<string, unknown>
      | undefined;

    if (!prod || prod.status !== 'active') {
      res.status(404).json({ error: 'Produk tidak tersedia.' });
      return;
    }
    if (Number(prod.stock) < qty) {
      res.status(400).json({ error: `Stok tersisa ${prod.stock} unit.` });
      return;
    }

    const sizes = parseJsonArray<string>(String(prod.sizes_json));
    const colors = parseJsonArray<string>(String(prod.colors_json));
    const chosenSize = size && sizes.includes(size) ? size : sizes[0] || 'M';
    const chosenColor = color && colors.includes(color) ? color : colors[0] || 'Black';

    const existing = db
      .prepare('SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ? AND color = ?')
      .get(req.authUser!.id, pid, chosenSize, chosenColor) as
      | { id: number; quantity: number }
      | undefined;

    if (existing) {
      const nextQty = existing.quantity + qty;
      if (nextQty > Number(prod.stock)) {
        res.status(400).json({ error: `Total melebihi stok tersedia (${prod.stock} unit).` });
        return;
      }
      db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(nextQty, existing.id);
    } else {
      db.prepare(
        'INSERT INTO cart_items (user_id, product_id, size, color, quantity, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(req.authUser!.id, pid, chosenSize, chosenColor, qty, new Date().toISOString());
    }

    res.json({ items: fetchUserCart(req.authUser!.id) });
  });

  app.put('/api/cart/:itemId', requireAuth, (req: RequestWithAuth, res: Response) => {
    const itemId = Number(req.params.itemId);
    const qty = Math.round(Number((req.body as { quantity?: number }).quantity));
    const existing = db
      .prepare(
        `SELECT ci.id, p.stock FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         WHERE ci.id = ? AND ci.user_id = ?`
      )
      .get(itemId, req.authUser!.id) as { id: number; stock: number } | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Item keranjang tidak ditemukan.' });
      return;
    }
    if (qty <= 0) {
      db.prepare('DELETE FROM cart_items WHERE id = ?').run(itemId);
    } else if (qty > existing.stock) {
      res.status(400).json({ error: `Stok maksimal tersedia ${existing.stock} unit.` });
      return;
    } else {
      db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(qty, itemId);
    }
    res.json({ items: fetchUserCart(req.authUser!.id) });
  });

  app.delete('/api/cart/:itemId', requireAuth, (req: RequestWithAuth, res: Response) => {
    const itemId = Number(req.params.itemId);
    db.prepare('DELETE FROM cart_items WHERE id = ? AND user_id = ?').run(
      itemId,
      req.authUser!.id
    );
    res.json({ items: fetchUserCart(req.authUser!.id) });
  });

  app.post('/api/promos/validate', (req: Request, res: Response) => {
    const { code, subtotal } = req.body as { code?: string; subtotal?: number };
    const clean = (code || '').trim().toUpperCase();
    if (!clean) {
      res.status(400).json({ error: 'Masukkan kode promo.' });
      return;
    }
    const row = db
      .prepare('SELECT * FROM promotions WHERE UPPER(code) = ? AND is_active = 1')
      .get(clean) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Kode promo tidak ditemukan atau sudah tidak aktif.' });
      return;
    }
    if (row.expires_at && new Date(String(row.expires_at)).getTime() < Date.now()) {
      res.status(400).json({ error: 'Kode promo sudah kedaluwarsa.' });
      return;
    }
    if (Number(subtotal || 0) < Number(row.min_order)) {
      res.status(400).json({
        error: `Minimal belanja ${formatIDR(Number(row.min_order))} untuk kode ini.`,
      });
      return;
    }
    const promo: PromoCode = {
      id: Number(row.id),
      code: String(row.code),
      title: String(row.title),
      discountType: row.discount_type as 'percent' | 'fixed',
      discountValue: Number(row.discount_value),
      minOrder: Number(row.min_order),
      isActive: Boolean(row.is_active),
      expiresAt: row.expires_at ? String(row.expires_at) : null,
    };
    res.json({ promo });
  });

  // ==================== ORDERS & PAYMENTS (CUSTOMER) ====================
  app.post('/api/orders', requireAuth, (req: RequestWithAuth, res: Response) => {
    const {
      recipientName,
      recipientPhone,
      shippingAddress,
      notes,
      shippingOptionId,
      paymentMethodId,
      paymentChannel,
      promoCode,
      items: directItems,
    } = req.body as {
      recipientName?: string;
      recipientPhone?: string;
      shippingAddress?: string;
      notes?: string;
      shippingOptionId?: number;
      paymentMethodId?: number;
      paymentChannel?: string;
      promoCode?: string;
      items?: Array<{ productId: number; size: string; color: string; quantity: number }>;
    };

    if (!recipientName?.trim() || !recipientPhone?.trim() || !shippingAddress?.trim()) {
      res.status(400).json({ error: 'Nama penerima, nomor telepon, dan alamat lengkap wajib diisi.' });
      return;
    }

    const shippingRow = db
      .prepare('SELECT * FROM shipping_settings WHERE id = ? AND is_active = 1')
      .get(Number(shippingOptionId)) as Record<string, unknown> | undefined;
    if (!shippingRow) {
      res.status(400).json({ error: 'Metode pengiriman tidak valid.' });
      return;
    }

    const pmRow = db
      .prepare('SELECT * FROM payment_methods WHERE id = ? AND is_active = 1')
      .get(Number(paymentMethodId)) as Record<string, unknown> | undefined;
    if (!pmRow) {
      res.status(400).json({ error: 'Metode pembayaran tidak aktif atau tidak ditemukan.' });
      return;
    }

    // Load items from DB cart or validated request items
    const cartRows = fetchUserCart(req.authUser!.id);
    const sourceItems =
      cartRows.length > 0
        ? cartRows
        : (directItems || []).map((di) => {
            const p = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(di.productId)) as
              | Record<string, unknown>
              | undefined;
            if (!p) {
              return {
                productId: di.productId,
                productName: 'Produk tidak ditemukan',
                productImage: '',
                size: di.size,
                color: di.color,
                quantity: di.quantity,
                unitPrice: 0,
                stock: 0,
                status: 'draft',
              };
            }
            const price = Number(p.price);
            const disc = p.discount_price !== null ? Number(p.discount_price) : null;
            const unitPrice = disc !== null && disc > 0 && disc < price ? disc : price;
            const imgs = parseJsonArray<string>(String(p.images_json));
            return {
              productId: Number(p.id),
              productName: String(p.name),
              productImage: imgs[0] || '',
              size: di.size || 'M',
              color: di.color || 'Black',
              quantity: Math.max(1, Math.round(Number(di.quantity || 1))),
              unitPrice,
              stock: Number(p.stock),
              status: String(p.status),
            };
          });

    if (sourceItems.length === 0) {
      res.status(400).json({ error: 'Keranjang belanja kosong.' });
      return;
    }

    let promo: PromoCode | null = null;
    if (promoCode?.trim()) {
      const pRow = db
        .prepare('SELECT * FROM promotions WHERE UPPER(code) = ? AND is_active = 1')
        .get(promoCode.trim().toUpperCase()) as Record<string, unknown> | undefined;
      if (pRow) {
        promo = {
          id: Number(pRow.id),
          code: String(pRow.code),
          title: String(pRow.title),
          discountType: pRow.discount_type as 'percent' | 'fixed',
          discountValue: Number(pRow.discount_value),
          minOrder: Number(pRow.min_order),
          isActive: Boolean(pRow.is_active),
          expiresAt: pRow.expires_at ? String(pRow.expires_at) : null,
        };
      }
    }

    const summary = calculateCartSummary(sourceItems, promo, Number(shippingRow.cost));
    if (summary.stockIssues.length > 0) {
      res.status(400).json({ error: summary.stockIssues[0] });
      return;
    }

    const now = new Date().toISOString();
    const orderNumber = `ELC-${now.slice(0, 10).replace(/-/g, '')}-${crypto
      .randomBytes(2)
      .toString('hex')
      .toUpperCase()}`;
    const dest = resolveDestinationCoords(shippingAddress);
    const originLat = Number(shippingRow.origin_lat);
    const originLng = Number(shippingRow.origin_lng);
    const paymentType = pmRow.type as PaymentMethodType;
    const defaultChannel =
      paymentType === 'qris'
        ? 'QRIS'
        : paymentType === 'bank_transfer'
          ? pmRow.bank_name
            ? `${String(pmRow.bank_name)} · ${String(pmRow.account_number || '')}`.trim()
            : String(pmRow.name)
          : 'GoPay';
    const chosenChannel = paymentChannel?.trim() || defaultChannel;

    let createdOrderId = 0;

    db.exec('BEGIN IMMEDIATE');
    try {
      const orderInfo = db
        .prepare(
          `INSERT INTO orders (
            order_number, user_id, recipient_name, recipient_phone, shipping_address, notes,
            subtotal, discount_amount, promo_code, shipping_cost, shipping_service, shipping_eta,
            tracking_number, total_amount, payment_method_id, payment_method_name, payment_type,
            payment_channel, payment_proof_url, payment_status, order_status,
            origin_lat, origin_lng, courier_lat, courier_lng, dest_lat, dest_lng,
            current_location_label, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, '', 'unpaid', 'Menunggu Pembayaran', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          orderNumber,
          req.authUser!.id,
          recipientName.trim(),
          recipientPhone.trim(),
          shippingAddress.trim(),
          (notes || '').trim(),
          summary.subtotal,
          summary.promoDiscount,
          promo ? promo.code : null,
          summary.shippingCost,
          String(shippingRow.service_name),
          String(shippingRow.eta),
          summary.totalAmount,
          Number(pmRow.id),
          String(pmRow.name),
          paymentType,
          chosenChannel,
          originLat,
          originLng,
          originLat,
          originLng,
          dest.lat,
          dest.lng,
          `Warehouse ${String(shippingRow.origin_city)}`,
          now,
          now
        );

      createdOrderId = Number(orderInfo.lastInsertRowid);

      const insertItem = db.prepare(
        `INSERT INTO order_items (order_id, product_id, product_name, product_image, size, color, unit_price, quantity, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const item of sourceItems) {
        insertItem.run(
          createdOrderId,
          item.productId,
          item.productName,
          item.productImage,
          item.size,
          item.color,
          item.unitPrice,
          item.quantity,
          item.unitPrice * item.quantity
        );
      }

      db.prepare(
        `INSERT INTO order_tracking_events (order_id, status, title, description, location_name, lat, lng, created_at)
         VALUES (?, 'Menunggu Pembayaran', 'Pesanan Dibuat', ?, ?, ?, ?, ?)`
      ).run(
        createdOrderId,
        `Menunggu pembayaran via ${String(pmRow.name)} (${chosenChannel}) sebesar ${formatIDR(summary.totalAmount)}.`,
        `Warehouse ${String(shippingRow.origin_city)}`,
        originLat,
        originLng,
        now
      );

      db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.authUser!.id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(createdOrderId) as Record<
      string,
      unknown
    >;
    const fullOrder = getOrderWithDetails(orderRow);

    dispatchNotifications({
      userId: req.authUser!.id,
      orderId: createdOrderId,
      orderNumber,
      recipientPhone: recipientPhone.trim(),
      recipientEmail: req.authUser!.email,
      title: `Pesanan ${orderNumber} Dibuat`,
      message: `Pesanan Anda (${formatIDR(summary.totalAmount)}) berhasil dibuat. Silakan selesaikan pembayaran melalui ${String(pmRow.name)}.`,
      channels: ['push', 'email'],
    });

    broadcastStaffEvent('order_created', fullOrder);
    res.status(201).json({ order: fullOrder });
  });

  app.get('/api/orders', requireAuth, (req: RequestWithAuth, res: Response) => {
    const rows = db
      .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC')
      .all(req.authUser!.id) as Array<Record<string, unknown>>;
    res.json({ orders: rows.map(getOrderWithDetails) });
  });

  app.get('/api/orders/:orderNumber', requireAuth, (req: RequestWithAuth, res: Response) => {
    const row = db
      .prepare('SELECT * FROM orders WHERE order_number = ?')
      .get(req.params.orderNumber) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      return;
    }
    const isStaff = hasStaffPermission(req.authUser, 'orders');
    if (Number(row.user_id) !== req.authUser!.id && !isStaff) {
      res.status(403).json({ error: 'Anda tidak memiliki akses ke pesanan ini.' });
      return;
    }
    res.json({ order: getOrderWithDetails(row) });
  });

  app.post(
    '/api/orders/:orderNumber/payment-proof',
    requireAuth,
    (req: RequestWithAuth, res: Response) => {
      const { proofUrl } = req.body as { proofUrl?: string };
      if (!proofUrl?.trim()) {
        res.status(400).json({ error: 'Bukti pembayaran wajib diunggah.' });
        return;
      }

      const row = db
        .prepare('SELECT * FROM orders WHERE order_number = ? AND user_id = ?')
        .get(req.params.orderNumber, req.authUser!.id) as Record<string, unknown> | undefined;

      if (!row) {
        res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
        return;
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE orders SET payment_proof_url = ?, payment_status = 'pending_confirmation',
         order_status = 'Menunggu Konfirmasi', updated_at = ? WHERE id = ?`
      ).run(proofUrl.trim(), now, Number(row.id));

      const methodLabel =
        String(row.payment_type) === 'bank_transfer'
          ? 'transfer rekening bank admin'
          : 'transfer QRIS';

      db.prepare(
        `INSERT INTO order_tracking_events (order_id, status, title, description, location_name, lat, lng, created_at)
         VALUES (?, 'Menunggu Konfirmasi', 'Bukti Pembayaran Diunggah', ?, ?, ?, ?, ?)`
      ).run(
        Number(row.id),
        `Bukti ${methodLabel} diterima dan sedang menunggu verifikasi admin.`,
        String(row.current_location_label),
        Number(row.courier_lat),
        Number(row.courier_lng),
        now
      );

      const updated = getOrderWithDetails(
        db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(row.id)) as Record<
          string,
          unknown
        >
      );

      dispatchNotifications({
        userId: req.authUser!.id,
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        recipientPhone: updated.recipientPhone,
        recipientEmail: req.authUser!.email,
        title: `Bukti Pembayaran Terkirim · ${updated.orderNumber}`,
        message: `Bukti ${methodLabel} untuk ${updated.orderNumber} telah diterima. Admin sedang memverifikasi pembayaran Anda.`,
        channels: ['push', 'email'],
      });

      broadcastUserEvent(req.authUser!.id, 'order_updated', updated);
      broadcastStaffEvent('order_updated', updated);
      res.json({ order: updated });
    }
  );

  // Instant Third-Party Digital Payment Gateway checkout completion
  app.post(
    '/api/orders/:orderNumber/gateway-pay',
    requireAuth,
    (req: RequestWithAuth, res: Response) => {
      const { channel } = req.body as { channel?: string };
      const row = db
        .prepare('SELECT * FROM orders WHERE order_number = ? AND user_id = ?')
        .get(req.params.orderNumber, req.authUser!.id) as Record<string, unknown> | undefined;

      if (!row) {
        res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
        return;
      }
      if (row.payment_type !== 'gateway') {
        res.status(400).json({ error: 'Pesanan ini menggunakan metode QRIS manual.' });
        return;
      }
      if (row.payment_status === 'paid') {
        res.json({ order: getOrderWithDetails(row) });
        return;
      }

      const now = new Date().toISOString();
      const orderId = Number(row.id);
      const chosenChannel = channel?.trim() || String(row.payment_channel) || 'GoPay';

      db.exec('BEGIN IMMEDIATE');
      try {
        const items = db
          .prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?')
          .all(orderId) as Array<{ product_id: number; quantity: number }>;

        for (const it of items) {
          const prod = db
            .prepare('SELECT name, stock FROM products WHERE id = ?')
            .get(it.product_id) as { name: string; stock: number } | undefined;
          if (!prod || prod.stock < it.quantity) {
            throw new Error(`Stok produk ${prod?.name || ''} tidak mencukupi.`);
          }
          const nextStock = prod.stock - it.quantity;
          db.prepare(
            `UPDATE products SET stock = ?, sales_count = sales_count + ?,
             status = CASE WHEN ? <= 0 THEN 'out_of_stock' ELSE status END, updated_at = ?
             WHERE id = ?`
          ).run(nextStock, it.quantity, nextStock, now, it.product_id);
        }

        db.prepare(
          `UPDATE orders SET payment_channel = ?, payment_status = 'paid', order_status = 'Diproses',
           updated_at = ? WHERE id = ?`
        ).run(chosenChannel, now, orderId);

        db.prepare(
          `INSERT INTO order_tracking_events (order_id, status, title, description, location_name, lat, lng, created_at)
           VALUES (?, 'Diproses', 'Pembayaran Terverifikasi Otomatis', ?, ?, ?, ?, ?)`
        ).run(
          orderId,
          `Pembayaran instan via ${chosenChannel} berhasil diverifikasi. Pesanan sedang dikemas.`,
          String(row.current_location_label),
          Number(row.courier_lat),
          Number(row.courier_lng),
          now
        );

        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Gagal memproses pembayaran gateway.',
        });
        return;
      }

      const updated = getOrderWithDetails(
        db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Record<string, unknown>
      );

      dispatchNotifications({
        userId: req.authUser!.id,
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        recipientPhone: updated.recipientPhone,
        recipientEmail: req.authUser!.email,
        title: `Pembayaran Berhasil · ${updated.orderNumber}`,
        message: `Halo ${updated.recipientName}, pembayaran ${formatIDR(updated.totalAmount)} via ${chosenChannel} untuk pesanan ${updated.orderNumber} di elchapo.clg telah berhasil dan sedang diproses! Info CS: ${STORE_WHATSAPP}.`,
        channels: ['push', 'whatsapp', 'email'],
      });

      broadcastUserEvent(req.authUser!.id, 'order_updated', updated);
      broadcastStaffEvent('order_updated', updated);
      res.json({ order: updated });
    }
  );

  // ==================== NOTIFICATIONS ====================
  app.get('/api/notifications', requireAuth, (req: RequestWithAuth, res: Response) => {
    const rows = db
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 40')
      .all(req.authUser!.id) as Array<Record<string, unknown>>;
    res.json({
      notifications: rows.map((n) => ({
        id: Number(n.id),
        userId: Number(n.user_id),
        orderId: n.order_id ? Number(n.order_id) : null,
        channel: n.channel,
        recipient: String(n.recipient),
        title: String(n.title),
        message: String(n.message),
        metadata: JSON.parse(String(n.metadata_json || '{}')),
        isRead: Boolean(n.is_read),
        createdAt: String(n.created_at),
      })),
    });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: RequestWithAuth, res: Response) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.authUser!.id);
    res.json({ ok: true });
  });

  // ==================== ADMIN ROUTES ====================
  app.get(
    '/api/admin/overview',
    requireStaff('overview'),
    (_req: RequestWithAuth, res: Response) => {
      const revenueRow = db
        .prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE payment_status = 'paid'")
        .get() as { total: number };
      const ordersCount = db.prepare('SELECT COUNT(*) as c FROM orders').get() as { c: number };
      const productsCount = db.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number };
      const customersCount = db
        .prepare("SELECT COUNT(*) as c FROM users WHERE role = 'customer'")
        .get() as { c: number };
      const pendingPayment = db
        .prepare(
          "SELECT COUNT(*) as c FROM orders WHERE order_status IN ('Menunggu Pembayaran', 'Menunggu Konfirmasi')"
        )
        .get() as { c: number };
      const processing = db
        .prepare("SELECT COUNT(*) as c FROM orders WHERE order_status IN ('Diproses', 'Dikirim')")
        .get() as { c: number };
      const completed = db
        .prepare("SELECT COUNT(*) as c FROM orders WHERE order_status = 'Selesai'")
        .get() as { c: number };

      const lowStockRows = db
        .prepare(
          `SELECT p.*, c.name as category_name FROM products p
           JOIN categories c ON p.category_id = c.id
           WHERE p.stock <= 10 ORDER BY p.stock ASC LIMIT 12`
        )
        .all() as Array<Record<string, unknown>>;

      // Daily sales (last 7 days)
      const allPaid = db
        .prepare("SELECT total_amount, created_at FROM orders WHERE payment_status = 'paid'")
        .all() as Array<{ total_amount: number; created_at: string }>;

      const dailySales: Array<{ label: string; revenue: number; orders: number }> = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const dayKey = d.toISOString().slice(0, 10);
        const matching = allPaid.filter((o) => o.created_at.startsWith(dayKey));
        dailySales.push({
          label: dayKey.slice(5),
          revenue: matching.reduce((sum, o) => sum + Number(o.total_amount), 0),
          orders: matching.length,
        });
      }

      const weeklySales = ['Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4'].map((label, idx) => {
        if (idx === 3) {
          return {
            label,
            revenue: allPaid.reduce((s, o) => s + Number(o.total_amount), 0),
            orders: allPaid.length,
          };
        }
        return { label, revenue: 0, orders: 0 };
      });

      const currentMonth = new Date().toISOString().slice(0, 7);
      const monthlySales = [
        {
          label: currentMonth,
          revenue: allPaid.reduce((s, o) => s + Number(o.total_amount), 0),
          orders: allPaid.length,
        },
      ];

      const notifRows = db
        .prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 15')
        .all() as Array<Record<string, unknown>>;

      res.json({
        totalRevenue: Number(revenueRow.total),
        totalOrders: Number(ordersCount.c),
        totalProducts: Number(productsCount.c),
        totalCustomers: Number(customersCount.c),
        pendingPaymentOrders: Number(pendingPayment.c),
        processingOrders: Number(processing.c),
        completedOrders: Number(completed.c),
        lowStockProducts: lowStockRows.map(mapProductRow),
        dailySales,
        weeklySales,
        monthlySales,
        recentNotifications: notifRows.map((n) => ({
          id: Number(n.id),
          userId: Number(n.user_id),
          orderId: n.order_id ? Number(n.order_id) : null,
          channel: n.channel,
          recipient: String(n.recipient),
          title: String(n.title),
          message: String(n.message),
          metadata: JSON.parse(String(n.metadata_json || '{}')),
          isRead: Boolean(n.is_read),
          createdAt: String(n.created_at),
        })),
      });
    }
  );

  // Admin Products & Categories
  app.get(
    '/api/admin/products',
    requireStaff('products'),
    (_req: RequestWithAuth, res: Response) => {
      const products = db
        .prepare(
          `SELECT p.*, c.name as category_name FROM products p
           JOIN categories c ON p.category_id = c.id ORDER BY p.id DESC`
        )
        .all() as Array<Record<string, unknown>>;
      const categories = db
        .prepare('SELECT * FROM categories ORDER BY sort_order ASC, id ASC')
        .all() as Array<Record<string, unknown>>;

      res.json({
        products: products.map(mapProductRow),
        categories: categories.map((c) => ({
          id: Number(c.id),
          name: String(c.name),
          slug: String(c.slug),
          description: String(c.description),
          sortOrder: Number(c.sort_order),
        })),
      });
    }
  );

  app.post(
    '/api/admin/products',
    requireStaff('products'),
    (req: RequestWithAuth, res: Response) => {
      const body = req.body as Partial<Product>;
      if (!body.name?.trim() || !body.categoryId || !Number.isFinite(Number(body.price))) {
        res.status(400).json({ error: 'Nama, kategori, dan harga produk wajib diisi.' });
        return;
      }

      const now = new Date().toISOString();
      const baseSlug = slugify(body.name) || 'product';
      const slug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;
      const info = db
        .prepare(
          `INSERT INTO products (
            name, slug, description, material, category_id, price, discount_price,
            stock, status, is_new_arrival, is_best_seller, sizes_json, colors_json,
            images_json, sales_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
        )
        .run(
          body.name.trim(),
          slug,
          (body.description || '').trim(),
          (body.material || '').trim(),
          Number(body.categoryId),
          Math.max(0, Math.round(Number(body.price))),
          body.discountPrice ? Math.max(0, Math.round(Number(body.discountPrice))) : null,
          Math.max(0, Math.round(Number(body.stock || 0))),
          body.status || 'active',
          body.isNewArrival ? 1 : 0,
          body.isBestSeller ? 1 : 0,
          JSON.stringify(body.sizes?.length ? body.sizes : ['S', 'M', 'L', 'XL']),
          JSON.stringify(body.colors?.length ? body.colors : ['Black']),
          JSON.stringify(
            body.images?.length
              ? body.images
              : ['/src/assets/images/product_tshirt_boxy_1795224764536.jpg']
          ),
          now,
          now
        );

      const created = db
        .prepare(
          `SELECT p.*, c.name as category_name FROM products p
           JOIN categories c ON p.category_id = c.id WHERE p.id = ?`
        )
        .get(Number(info.lastInsertRowid)) as Record<string, unknown>;
      res.status(201).json({ product: mapProductRow(created) });
    }
  );

  app.put(
    '/api/admin/products/:id',
    requireStaff('products'),
    (req: RequestWithAuth, res: Response) => {
      const id = Number(req.params.id);
      const body = req.body as Partial<Product>;
      const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
      if (!existing) {
        res.status(404).json({ error: 'Produk tidak ditemukan.' });
        return;
      }
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE products SET
          name = ?, description = ?, material = ?, category_id = ?, price = ?,
          discount_price = ?, stock = ?, status = ?, is_new_arrival = ?, is_best_seller = ?,
          sizes_json = ?, colors_json = ?, images_json = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        (body.name || '').trim(),
        (body.description || '').trim(),
        (body.material || '').trim(),
        Number(body.categoryId),
        Math.max(0, Math.round(Number(body.price))),
        body.discountPrice ? Math.max(0, Math.round(Number(body.discountPrice))) : null,
        Math.max(0, Math.round(Number(body.stock ?? 0))),
        body.status || 'active',
        body.isNewArrival ? 1 : 0,
        body.isBestSeller ? 1 : 0,
        JSON.stringify(body.sizes?.length ? body.sizes : ['S', 'M', 'L', 'XL']),
        JSON.stringify(body.colors?.length ? body.colors : ['Black']),
        JSON.stringify(body.images?.length ? body.images : []),
        now,
        id
      );

      const updated = db
        .prepare(
          `SELECT p.*, c.name as category_name FROM products p
           JOIN categories c ON p.category_id = c.id WHERE p.id = ?`
        )
        .get(id) as Record<string, unknown>;
      res.json({ product: mapProductRow(updated) });
    }
  );

  app.delete(
    '/api/admin/products/:id',
    requireStaff('products'),
    (req: RequestWithAuth, res: Response) => {
      const id = Number(req.params.id);
      const usedInOrder = db
        .prepare('SELECT id FROM order_items WHERE product_id = ? LIMIT 1')
        .get(id);
      if (usedInOrder) {
        // Archive as draft if historical orders reference this product
        db.prepare("UPDATE products SET status = 'draft', updated_at = ? WHERE id = ?").run(
          new Date().toISOString(),
          id
        );
      } else {
        db.prepare('DELETE FROM products WHERE id = ?').run(id);
      }
      res.json({ ok: true });
    }
  );

  app.post(
    '/api/admin/categories',
    requireStaff('products'),
    (req: RequestWithAuth, res: Response) => {
      const { name, description, sortOrder } = req.body as {
        name?: string;
        description?: string;
        sortOrder?: number;
      };
      if (!name?.trim()) {
        res.status(400).json({ error: 'Nama kategori wajib diisi.' });
        return;
      }
      const slug = `${slugify(name)}-${crypto.randomBytes(2).toString('hex')}`;
      const info = db
        .prepare(
          'INSERT INTO categories (name, slug, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run(
          name.trim(),
          slug,
          (description || '').trim(),
          Number(sortOrder || 10),
          new Date().toISOString()
        );
      res.status(201).json({
        category: {
          id: Number(info.lastInsertRowid),
          name: name.trim(),
          slug,
          description: (description || '').trim(),
          sortOrder: Number(sortOrder || 10),
        },
      });
    }
  );

  app.put(
    '/api/admin/categories/:id',
    requireStaff('products'),
    (req: RequestWithAuth, res: Response) => {
      const id = Number(req.params.id);
      const { name, description, sortOrder } = req.body as {
        name?: string;
        description?: string;
        sortOrder?: number;
      };
      if (!name?.trim()) {
        res.status(400).json({ error: 'Nama kategori wajib diisi.' });
        return;
      }
      db.prepare('UPDATE categories SET name = ?, description = ?, sort_order = ? WHERE id = ?').run(
        name.trim(),
        (description || '').trim(),
        Number(sortOrder || 1),
        id
      );
      res.json({ ok: true });
    }
  );

  app.delete(
    '/api/admin/categories/:id',
    requireStaff('products'),
    (req: RequestWithAuth, res: Response) => {
      const id = Number(req.params.id);
      const hasProds = db
        .prepare('SELECT id FROM products WHERE category_id = ? LIMIT 1')
        .get(id);
      if (hasProds) {
        res.status(400).json({
          error: 'Kategori masih memiliki produk. Pindahkan atau hapus produk terlebih dahulu.',
        });
        return;
      }
      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
      res.json({ ok: true });
    }
  );

  // Admin Orders Management
  app.get('/api/admin/orders', requireStaff('orders'), (_req: RequestWithAuth, res: Response) => {
    const rows = db
      .prepare(
        `SELECT o.*, u.email as customer_email FROM orders o
         JOIN users u ON o.user_id = u.id ORDER BY o.id DESC`
      )
      .all() as Array<Record<string, unknown>>;
    res.json({ orders: rows.map(getOrderWithDetails) });
  });

  app.post(
    '/api/admin/orders/:id/verify-payment',
    requireStaff('orders'),
    (req: RequestWithAuth, res: Response) => {
      const orderId = Number(req.params.id);
      const { approved, reason } = req.body as { approved?: boolean; reason?: string };

      const row = db
        .prepare(
          `SELECT o.*, u.email as customer_email FROM orders o
           JOIN users u ON o.user_id = u.id WHERE o.id = ?`
        )
        .get(orderId) as Record<string, unknown> | undefined;

      if (!row) {
        res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
        return;
      }

      const now = new Date().toISOString();

      if (approved) {
        if (row.payment_status === 'paid') {
          res.json({ order: getOrderWithDetails(row) });
          return;
        }

        db.exec('BEGIN IMMEDIATE');
        try {
          const items = db
            .prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?')
            .all(orderId) as Array<{ product_id: number; quantity: number }>;

          for (const it of items) {
            const prod = db
              .prepare('SELECT name, stock FROM products WHERE id = ?')
              .get(it.product_id) as { name: string; stock: number } | undefined;
            if (!prod || prod.stock < it.quantity) {
              throw new Error(`Stok produk ${prod?.name || ''} tidak mencukupi.`);
            }
            const nextStock = prod.stock - it.quantity;
            db.prepare(
              `UPDATE products SET stock = ?, sales_count = sales_count + ?,
               status = CASE WHEN ? <= 0 THEN 'out_of_stock' ELSE status END, updated_at = ?
               WHERE id = ?`
            ).run(nextStock, it.quantity, nextStock, now, it.product_id);
          }

          db.prepare(
            `UPDATE orders SET payment_status = 'paid', order_status = 'Diproses', updated_at = ? WHERE id = ?`
          ).run(now, orderId);

          const verifiedTitle =
            String(row.payment_type) === 'bank_transfer'
              ? 'Pembayaran Rekening Admin Diverifikasi'
              : 'Pembayaran QRIS Diverifikasi';
          db.prepare(
            `INSERT INTO order_tracking_events (order_id, status, title, description, location_name, lat, lng, created_at)
             VALUES (?, 'Diproses', ?, ?, ?, ?, ?, ?)`
          ).run(
            orderId,
            verifiedTitle,
            `Pembayaran diverifikasi oleh ${req.authUser!.name}. Pesanan sedang disiapkan untuk pengiriman.`,
            String(row.current_location_label),
            Number(row.courier_lat),
            Number(row.courier_lng),
            now
          );

          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          res.status(400).json({
            error: err instanceof Error ? err.message : 'Gagal memverifikasi pembayaran.',
          });
          return;
        }

        const updated = getOrderWithDetails(
          db
            .prepare(
              `SELECT o.*, u.email as customer_email FROM orders o
               JOIN users u ON o.user_id = u.id WHERE o.id = ?`
            )
            .get(orderId) as Record<string, unknown>
        );

        // Automatic WhatsApp + Email + Push notification after payment verification
        const waMessage = `Halo ${updated.recipientName}, pembayaran Anda sebesar ${formatIDR(updated.totalAmount)} untuk pesanan ${updated.orderNumber} di elchapo.clg telah DIVERIFIKASI! Status sekarang: Diproses. Hubungi WhatsApp resmi kami di ${STORE_WHATSAPP} jika ada pertanyaan.`;

        dispatchNotifications({
          userId: updated.userId,
          orderId: updated.id,
          orderNumber: updated.orderNumber,
          recipientPhone: updated.recipientPhone,
          recipientEmail: updated.customerEmail || '',
          title: `Pembayaran Diverifikasi · ${updated.orderNumber}`,
          message: waMessage,
          channels: ['whatsapp', 'email', 'push'],
        });

        broadcastUserEvent(updated.userId, 'order_updated', updated);
        broadcastStaffEvent('order_updated', updated);
        res.json({
          order: updated,
          whatsappDispatchUrl: formatWhatsAppUrl(
            updated.recipientPhone || STORE_WHATSAPP,
            waMessage
          ),
        });
      } else {
        db.prepare(
          `UPDATE orders SET payment_status = 'rejected', order_status = 'Pembayaran Ditolak', updated_at = ? WHERE id = ?`
        ).run(now, orderId);

        db.prepare(
          `INSERT INTO order_tracking_events (order_id, status, title, description, location_name, lat, lng, created_at)
           VALUES (?, 'Pembayaran Ditolak', 'Pembayaran Ditolak', ?, ?, ?, ?, ?)`
        ).run(
          orderId,
          reason?.trim() || 'Bukti pembayaran tidak sesuai. Silakan unggah ulang bukti yang valid.',
          String(row.current_location_label),
          Number(row.courier_lat),
          Number(row.courier_lng),
          now
        );

        const updated = getOrderWithDetails(
          db
            .prepare(
              `SELECT o.*, u.email as customer_email FROM orders o
               JOIN users u ON o.user_id = u.id WHERE o.id = ?`
            )
            .get(orderId) as Record<string, unknown>
        );

        dispatchNotifications({
          userId: updated.userId,
          orderId: updated.id,
          orderNumber: updated.orderNumber,
          recipientPhone: updated.recipientPhone,
          recipientEmail: updated.customerEmail || '',
          title: `Pembayaran Ditolak · ${updated.orderNumber}`,
          message: `Pembayaran untuk ${updated.orderNumber} ditolak: ${reason?.trim() || 'Bukti tidak valid'}. Silakan unggah ulang bukti pembayaran atau hubungi WhatsApp ${STORE_WHATSAPP}.`,
          channels: ['push', 'email', 'whatsapp'],
        });

        broadcastUserEvent(updated.userId, 'order_updated', updated);
        broadcastStaffEvent('order_updated', updated);
        res.json({ order: updated });
      }
    }
  );

  app.patch(
    '/api/admin/orders/:id',
    requireStaff('orders'),
    (req: RequestWithAuth, res: Response) => {
      const orderId = Number(req.params.id);
      const {
        orderStatus,
        trackingNumber,
        locationLabel,
        routeProgress,
        courierLat,
        courierLng,
        note,
      } = req.body as {
        orderStatus?: string;
        trackingNumber?: string;
        locationLabel?: string;
        routeProgress?: number;
        courierLat?: number;
        courierLng?: number;
        note?: string;
      };

      const row = db
        .prepare(
          `SELECT o.*, u.email as customer_email FROM orders o
           JOIN users u ON o.user_id = u.id WHERE o.id = ?`
        )
        .get(orderId) as Record<string, unknown> | undefined;

      if (!row) {
        res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
        return;
      }

      const nextStatus = orderStatus && isValidOrderStatus(orderStatus)
        ? orderStatus
        : (row.order_status as OrderStatus);

      let nextLat = Number(row.courier_lat);
      let nextLng = Number(row.courier_lng);

      if (typeof routeProgress === 'number') {
        const pt = interpolateRouteProgress(
          { lat: Number(row.origin_lat), lng: Number(row.origin_lng) },
          { lat: Number(row.dest_lat), lng: Number(row.dest_lng) },
          routeProgress
        );
        nextLat = pt.lat;
        nextLng = pt.lng;
      } else if (typeof courierLat === 'number' && typeof courierLng === 'number') {
        nextLat = courierLat;
        nextLng = courierLng;
      } else if (nextStatus === 'Selesai') {
        nextLat = Number(row.dest_lat);
        nextLng = Number(row.dest_lng);
      }

      const nextResi = trackingNumber !== undefined ? trackingNumber.trim() : String(row.tracking_number);
      const nextLocation =
        locationLabel?.trim() ||
        (nextStatus === 'Selesai'
          ? 'Telah Diterima Pelanggan'
          : nextStatus === 'Dikirim'
          ? 'Dalam Perjalanan Kurir'
          : String(row.current_location_label));

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE orders SET order_status = ?, tracking_number = ?, current_location_label = ?,
         courier_lat = ?, courier_lng = ?, updated_at = ? WHERE id = ?`
      ).run(nextStatus, nextResi, nextLocation, nextLat, nextLng, now, orderId);

      db.prepare(
        `INSERT INTO order_tracking_events (order_id, status, title, description, location_name, lat, lng, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        orderId,
        nextStatus,
        `Status: ${nextStatus}`,
        note?.trim() ||
          `Pesanan diperbarui ke ${nextStatus}${nextResi ? ` · Resi: ${nextResi}` : ''} (${nextLocation}).`,
        nextLocation,
        nextLat,
        nextLng,
        now
      );

      const updated = getOrderWithDetails(
        db
          .prepare(
            `SELECT o.*, u.email as customer_email FROM orders o
             JOIN users u ON o.user_id = u.id WHERE o.id = ?`
          )
          .get(orderId) as Record<string, unknown>
      );

      dispatchNotifications({
        userId: updated.userId,
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        recipientPhone: updated.recipientPhone,
        recipientEmail: updated.customerEmail || '',
        title: `Update Pengiriman · ${updated.orderNumber}`,
        message: `Status pesanan ${updated.orderNumber} kini: ${nextStatus}. Lokasi: ${nextLocation}${nextResi ? ` · No. Resi: ${nextResi}` : ''}.`,
        channels: ['email', 'push'],
      });

      broadcastUserEvent(updated.userId, 'order_updated', updated);
      broadcastStaffEvent('order_updated', updated);
      res.json({ order: updated });
    }
  );

  // Admin Payment Methods Settings & Incoming Funds Summary
  app.get(
    '/api/admin/payment-methods',
    requireStaff('payments'),
    (_req: RequestWithAuth, res: Response) => {
      const methods = db
        .prepare('SELECT * FROM payment_methods ORDER BY id ASC')
        .all() as Array<Record<string, unknown>>;
      const history = db
        .prepare('SELECT * FROM payment_settings_history ORDER BY id DESC LIMIT 30')
        .all() as Array<Record<string, unknown>>;
      const orderStats = db
        .prepare(
          `SELECT
            payment_method_id,
            SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as paid_count,
            SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as paid_total,
            SUM(CASE WHEN payment_status IN ('pending_confirmation', 'unpaid') AND order_status != 'Dibatalkan' THEN 1 ELSE 0 END) as pending_count,
            SUM(CASE WHEN payment_status IN ('pending_confirmation', 'unpaid') AND order_status != 'Dibatalkan' THEN total_amount ELSE 0 END) as pending_total
           FROM orders
           GROUP BY payment_method_id`
        )
        .all() as Array<Record<string, unknown>>;

      const statsMap = new Map<number, Record<string, unknown>>();
      for (const st of orderStats) {
        statsMap.set(Number(st.payment_method_id), st);
      }

      const incomingSummary: PaymentIncomingSummary[] = methods.map((pm) => {
        const pmId = Number(pm.id);
        const st = statsMap.get(pmId);
        return {
          paymentMethodId: pmId,
          paymentMethodName: String(pm.name),
          paymentType: pm.type as PaymentMethodType,
          bankName: String(pm.bank_name ?? ''),
          accountNumber: String(pm.account_number ?? ''),
          accountHolder: String(pm.account_holder ?? ''),
          paidOrdersCount: Number(st?.paid_count ?? 0),
          paidTotalAmount: Number(st?.paid_total ?? 0),
          pendingCount: Number(st?.pending_count ?? 0),
          pendingAmount: Number(st?.pending_total ?? 0),
        };
      });

      res.json({
        paymentMethods: methods.map((pm) => ({
          id: Number(pm.id),
          code: String(pm.code),
          name: String(pm.name),
          type: pm.type as PaymentMethodType,
          isActive: Boolean(pm.is_active),
          qrisImageUrl: String(pm.qris_image_url ?? ''),
          bankName: String(pm.bank_name ?? ''),
          accountNumber: String(pm.account_number ?? ''),
          accountHolder: String(pm.account_holder ?? ''),
          instructions: String(pm.instructions ?? ''),
          gatewayChannels: parseJsonArray<string>(String(pm.gateway_channels_json)),
          updatedBy: String(pm.updated_by),
          updatedAt: String(pm.updated_at),
        })),
        incomingSummary,
        history: history.map((h) => ({
          id: Number(h.id),
          paymentMethodId: Number(h.payment_method_id),
          changedBy: String(h.changed_by),
          summary: String(h.summary),
          createdAt: String(h.created_at),
        })),
      });
    }
  );

  app.post(
    '/api/admin/payment-methods',
    requireStaff('payments'),
    (req: RequestWithAuth, res: Response) => {
      const body = req.body as Partial<PaymentMethod>;
      const bankName = (body.bankName || '').trim();
      const accountNumber = (body.accountNumber || '').trim();
      const accountHolder = (body.accountHolder || '').trim();
      const name =
        (body.name || '').trim() ||
        (bankName ? `Transfer Bank ke Rekening Admin (${bankName})` : '');

      if (!bankName || !accountNumber || !accountHolder) {
        res.status(400).json({
          error: 'Nama bank, nomor rekening, dan atas nama pemilik rekening wajib diisi.',
        });
        return;
      }

      const now = new Date().toISOString();
      const code = `bank_${bankName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${crypto
        .randomBytes(2)
        .toString('hex')}`;
      const instructions =
        (body.instructions || '').trim() ||
        `1. Transfer tepat sesuai nominal tagihan ke rekening ${bankName} ${accountNumber} a.n. ${accountHolder}.\n2. Simpan bukti transfer dan unggah pada halaman konfirmasi pembayaran.`;
      const isActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : 1;

      const info = db
        .prepare(
          `INSERT INTO payment_methods (
            code, name, type, is_active, qris_image_url, bank_name, account_number, account_holder,
            instructions, gateway_channels_json, updated_by, updated_at
          ) VALUES (?, ?, 'bank_transfer', ?, '', ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          code,
          name,
          isActive,
          bankName,
          accountNumber,
          accountHolder,
          instructions,
          JSON.stringify([bankName]),
          req.authUser!.name,
          now
        );

      const newId = Number(info.lastInsertRowid);
      db.prepare(
        'INSERT INTO payment_settings_history (payment_method_id, changed_by, summary, created_at) VALUES (?, ?, ?, ?)'
      ).run(
        newId,
        req.authUser!.name,
        `Menambahkan rekening admin ${bankName} (${accountNumber} a.n. ${accountHolder})`,
        now
      );

      res.status(201).json({ id: newId });
    }
  );

  app.put(
    '/api/admin/payment-methods/:id',
    requireStaff('payments'),
    (req: RequestWithAuth, res: Response) => {
      const id = Number(req.params.id);
      const body = req.body as Partial<PaymentMethod>;
      const existing = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Metode pembayaran tidak ditemukan.' });
        return;
      }

      const now = new Date().toISOString();
      const nextName = (body.name ?? String(existing.name)).trim();
      const nextActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : Number(existing.is_active);
      const nextQris =
        body.qrisImageUrl !== undefined ? body.qrisImageUrl : String(existing.qris_image_url);
      const nextBankName =
        body.bankName !== undefined ? body.bankName.trim() : String(existing.bank_name ?? '');
      const nextAccountNumber =
        body.accountNumber !== undefined
          ? body.accountNumber.trim()
          : String(existing.account_number ?? '');
      const nextAccountHolder =
        body.accountHolder !== undefined
          ? body.accountHolder.trim()
          : String(existing.account_holder ?? '');

      if (String(existing.type) === 'bank_transfer' && (!nextBankName || !nextAccountNumber || !nextAccountHolder)) {
        res.status(400).json({
          error: 'Nama bank, nomor rekening, dan atas nama pemilik rekening wajib diisi.',
        });
        return;
      }

      const nextInstructions =
        body.instructions !== undefined ? body.instructions : String(existing.instructions);
      const nextChannels =
        String(existing.type) === 'bank_transfer'
          ? JSON.stringify([nextBankName])
          : body.gatewayChannels
            ? JSON.stringify(body.gatewayChannels)
            : String(existing.gateway_channels_json);

      db.prepare(
        `UPDATE payment_methods SET name = ?, is_active = ?, qris_image_url = ?,
         bank_name = ?, account_number = ?, account_holder = ?, instructions = ?,
         gateway_channels_json = ?, updated_by = ?, updated_at = ? WHERE id = ?`
      ).run(
        nextName,
        nextActive,
        nextQris,
        nextBankName,
        nextAccountNumber,
        nextAccountHolder,
        nextInstructions,
        nextChannels,
        req.authUser!.name,
        now,
        id
      );

      const summary =
        String(existing.type) === 'bank_transfer'
          ? `Memperbarui ${nextName} — ${nextBankName} ${nextAccountNumber} a.n. ${nextAccountHolder} (${nextActive ? 'Aktif' : 'Nonaktif'})`
          : `Memperbarui ${nextName} (${nextActive ? 'Aktif' : 'Nonaktif'})`;
      db.prepare(
        'INSERT INTO payment_settings_history (payment_method_id, changed_by, summary, created_at) VALUES (?, ?, ?, ?)'
      ).run(id, req.authUser!.name, summary, now);

      res.json({ ok: true });
    }
  );

  app.delete(
    '/api/admin/payment-methods/:id',
    requireStaff('payments'),
    (req: RequestWithAuth, res: Response) => {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Metode pembayaran tidak ditemukan.' });
        return;
      }
      if (String(existing.type) !== 'bank_transfer') {
        res.status(400).json({ error: 'Hanya rekening bank tambahan yang dapat dihapus.' });
        return;
      }
      const orderCount = db
        .prepare('SELECT COUNT(*) as count FROM orders WHERE payment_method_id = ?')
        .get(id) as { count: number };
      if (orderCount.count > 0) {
        res.status(400).json({
          error: 'Rekening ini sudah memiliki riwayat transaksi. Nonaktifkan saja statusnya agar riwayat tetap terjaga.',
        });
        return;
      }

      db.prepare('DELETE FROM payment_methods WHERE id = ?').run(id);
      res.json({ ok: true });
    }
  );

  // Admin Shipping & Promotions
  app.get(
    '/api/admin/shipping',
    requireStaff('shipping'),
    (_req: RequestWithAuth, res: Response) => {
      const rows = db.prepare('SELECT * FROM shipping_settings ORDER BY id ASC').all() as Array<
        Record<string, unknown>
      >;
      res.json({
        shippingOptions: rows.map((s) => ({
          id: Number(s.id),
          serviceName: String(s.service_name),
          cost: Number(s.cost),
          eta: String(s.eta),
          originCity: String(s.origin_city),
          originLat: Number(s.origin_lat),
          originLng: Number(s.origin_lng),
          isActive: Boolean(s.is_active),
        })),
      });
    }
  );

  app.post(
    '/api/admin/shipping',
    requireStaff('shipping'),
    (req: RequestWithAuth, res: Response) => {
      const body = req.body as Partial<ShippingOption>;
      if (!body.serviceName?.trim()) {
        res.status(400).json({ error: 'Nama layanan pengiriman wajib diisi.' });
        return;
      }
      db.prepare(
        `INSERT INTO shipping_settings (service_name, cost, eta, origin_city, origin_lat, origin_lng, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        body.serviceName.trim(),
        Math.max(0, Math.round(Number(body.cost || 0))),
        (body.eta || '2–3 Hari Kerja').trim(),
        (body.originCity || 'Jakarta Selatan').trim(),
        Number(body.originLat ?? -6.2615),
        Number(body.originLng ?? 106.8106),
        body.isActive === false ? 0 : 1
      );
      res.status(201).json({ ok: true });
    }
  );

  app.put(
    '/api/admin/shipping/:id',
    requireStaff('shipping'),
    (req: RequestWithAuth, res: Response) => {
      const id = Number(req.params.id);
      const body = req.body as Partial<ShippingOption>;
      db.prepare(
        `UPDATE shipping_settings SET service_name = ?, cost = ?, eta = ?, origin_city = ?, is_active = ? WHERE id = ?`
      ).run(
        (body.serviceName || '').trim(),
        Math.max(0, Math.round(Number(body.cost || 0))),
        (body.eta || '').trim(),
        (body.originCity || 'Jakarta Selatan').trim(),
        body.isActive === false ? 0 : 1,
        id
      );
      res.json({ ok: true });
    }
  );

  app.delete(
    '/api/admin/shipping/:id',
    requireStaff('shipping'),
    (req: RequestWithAuth, res: Response) => {
      db.prepare('DELETE FROM shipping_settings WHERE id = ?').run(Number(req.params.id));
      res.json({ ok: true });
    }
  );

  app.get(
    '/api/admin/promotions',
    requireStaff('products'),
    (_req: RequestWithAuth, res: Response) => {
      const rows = db.prepare('SELECT * FROM promotions ORDER BY id DESC').all() as Array<
        Record<string, unknown>
      >;
      res.json({
        promotions: rows.map((pr) => ({
          id: Number(pr.id),
          code: String(pr.code),
          title: String(pr.title),
          discountType: pr.discount_type,
          discountValue: Number(pr.discount_value),
          minOrder: Number(pr.min_order),
          isActive: Boolean(pr.is_active),
          expiresAt: pr.expires_at ? String(pr.expires_at) : null,
        })),
      });
    }
  );

  app.post(
    '/api/admin/promotions',
    requireStaff('products'),
    (req: RequestWithAuth, res: Response) => {
      const { code, title, discountType, discountValue, minOrder } = req.body as Partial<PromoCode>;
      if (!code?.trim() || !title?.trim()) {
        res.status(400).json({ error: 'Kode dan judul promo wajib diisi.' });
        return;
      }
      db.prepare(
        `INSERT INTO promotions (code, title, discount_type, discount_value, min_order, is_active, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, 1, NULL, ?)`
      ).run(
        code.trim().toUpperCase(),
        title.trim(),
        discountType === 'fixed' ? 'fixed' : 'percent',
        Math.max(0, Math.round(Number(discountValue || 0))),
        Math.max(0, Math.round(Number(minOrder || 0))),
        new Date().toISOString()
      );
      res.status(201).json({ ok: true });
    }
  );

  app.delete(
    '/api/admin/promotions/:id',
    requireStaff('products'),
    (req: RequestWithAuth, res: Response) => {
      db.prepare('DELETE FROM promotions WHERE id = ?').run(Number(req.params.id));
      res.json({ ok: true });
    }
  );

  // Admin Customers Management
  app.get(
    '/api/admin/customers',
    requireStaff('customers'),
    (_req: RequestWithAuth, res: Response) => {
      const rows = db
        .prepare(
          `SELECT u.*,
            COALESCE((SELECT SUM(o.total_amount) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'paid'), 0) as total_spent,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) as orders_count
           FROM users u WHERE u.role = 'customer' ORDER BY u.id DESC`
        )
        .all() as Array<Record<string, unknown>>;

      const customers: User[] = rows.map((r) => ({
        ...mapUserRow(r),
        totalSpent: Number(r.total_spent ?? 0),
        ordersCount: Number(r.orders_count ?? 0),
      }));
      res.json({ customers });
    }
  );

  app.patch(
    '/api/admin/customers/:id/status',
    requireStaff('customers'),
    (req: RequestWithAuth, res: Response) => {
      const id = Number(req.params.id);
      const { status } = req.body as { status?: 'active' | 'suspended' };
      db.prepare('UPDATE users SET status = ? WHERE id = ? AND role = ?').run(
        status === 'suspended' ? 'suspended' : 'active',
        id,
        'customer'
      );
      res.json({ ok: true });
    }
  );

  // Admin Staff & RBAC Management
  app.get('/api/admin/staff', requireStaff('staff'), (_req: RequestWithAuth, res: Response) => {
    const rows = db
      .prepare("SELECT * FROM users WHERE role IN ('admin', 'staff') ORDER BY id ASC")
      .all() as Array<Record<string, unknown>>;
    res.json({ staff: rows.map(mapUserRow) });
  });

  app.post('/api/admin/staff', requireStaff('staff'), (req: RequestWithAuth, res: Response) => {
    const { name, email, phone, password, role, permissions } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
      role?: 'staff' | 'admin';
      permissions?: AdminPermission[];
    };
    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      res.status(400).json({ error: 'Nama, email, dan password minimal 6 karakter wajib diisi.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (exists) {
      res.status(409).json({ error: 'Email sudah terdaftar.' });
      return;
    }
    const assignedRole: UserRole = role === 'admin' ? 'admin' : 'staff';
    const perms =
      assignedRole === 'admin'
        ? ALL_ADMIN_PERMISSIONS
        : (permissions || []).filter((p) => ALL_ADMIN_PERMISSIONS.includes(p));

    db.prepare(
      `INSERT INTO users (name, email, phone, address, city, postal_code, password_hash, role, permissions_json, status, created_at)
       VALUES (?, ?, ?, '', 'Jakarta Selatan', '', ?, ?, ?, 'active', ?)`
    ).run(
      name.trim(),
      cleanEmail,
      (phone || '').trim(),
      hashPassword(password),
      assignedRole,
      JSON.stringify(perms),
      new Date().toISOString()
    );
    res.status(201).json({ ok: true });
  });

  app.patch(
    '/api/admin/staff/:id',
    requireStaff('staff'),
    (req: RequestWithAuth, res: Response) => {
      const id = Number(req.params.id);
      const { role, permissions, status } = req.body as {
        role?: 'staff' | 'admin';
        permissions?: AdminPermission[];
        status?: 'active' | 'suspended';
      };
      if (id === req.authUser!.id && status === 'suspended') {
        res.status(400).json({ error: 'Tidak dapat menonaktifkan akun Anda sendiri.' });
        return;
      }
      const nextRole: UserRole = role === 'admin' ? 'admin' : 'staff';
      const perms =
        nextRole === 'admin'
          ? ALL_ADMIN_PERMISSIONS
          : (permissions || []).filter((p) => ALL_ADMIN_PERMISSIONS.includes(p));
      db.prepare(
        'UPDATE users SET role = ?, permissions_json = ?, status = ? WHERE id = ?'
      ).run(nextRole, JSON.stringify(perms), status === 'suspended' ? 'suspended' : 'active', id);
      res.json({ ok: true });
    }
  );

  // Admin Website Settings
  app.put(
    '/api/admin/settings',
    requireStaff('settings'),
    (req: RequestWithAuth, res: Response) => {
      const body = req.body as Partial<WebsiteSettings>;
      const upsert = db.prepare(
        'INSERT INTO website_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      );
      for (const [k, v] of Object.entries(body)) {
        if (typeof v === 'string') {
          upsert.run(k, v);
        }
      }
      res.json({ settings: getWebsiteSettings() });
    }
  );

  // Vite Dev Middleware or Static Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use('/src/assets/images', express.static(path.resolve(process.cwd(), 'src/assets/images')));
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`elchapo.clg server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
