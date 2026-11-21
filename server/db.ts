import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const db = new DatabaseSync(path.join(DATA_DIR, 'elchapo.db'));

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT 'Jakarta Selatan',
    postal_code TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    permissions_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    material TEXT NOT NULL DEFAULT '',
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    price INTEGER NOT NULL,
    discount_price INTEGER,
    stock INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    is_new_arrival INTEGER NOT NULL DEFAULT 0,
    is_best_seller INTEGER NOT NULL DEFAULT 0,
    sizes_json TEXT NOT NULL DEFAULT '["S","M","L","XL","XXL"]',
    colors_json TEXT NOT NULL DEFAULT '["Obsidian Black"]',
    images_json TEXT NOT NULL DEFAULT '[]',
    sales_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wishlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size TEXT NOT NULL,
    color TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, product_id, size, color)
  );

  CREATE TABLE IF NOT EXISTS payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    qris_image_url TEXT NOT NULL DEFAULT '',
    bank_name TEXT NOT NULL DEFAULT '',
    account_number TEXT NOT NULL DEFAULT '',
    account_holder TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    gateway_channels_json TEXT NOT NULL DEFAULT '[]',
    updated_by TEXT NOT NULL DEFAULT 'system',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payment_settings_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
    changed_by TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shipping_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name TEXT NOT NULL,
    cost INTEGER NOT NULL,
    eta TEXT NOT NULL,
    origin_city TEXT NOT NULL DEFAULT 'Jakarta Selatan',
    origin_lat REAL NOT NULL DEFAULT -6.2615,
    origin_lng REAL NOT NULL DEFAULT 106.8106,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    discount_type TEXT NOT NULL DEFAULT 'percent',
    discount_value INTEGER NOT NULL DEFAULT 0,
    min_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    recipient_name TEXT NOT NULL,
    recipient_phone TEXT NOT NULL,
    shipping_address TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    subtotal INTEGER NOT NULL,
    discount_amount INTEGER NOT NULL DEFAULT 0,
    promo_code TEXT,
    shipping_cost INTEGER NOT NULL DEFAULT 0,
    shipping_service TEXT NOT NULL DEFAULT '',
    shipping_eta TEXT NOT NULL DEFAULT '',
    tracking_number TEXT NOT NULL DEFAULT '',
    total_amount INTEGER NOT NULL,
    payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id),
    payment_method_name TEXT NOT NULL,
    payment_type TEXT NOT NULL DEFAULT 'qris',
    payment_channel TEXT NOT NULL DEFAULT 'QRIS',
    payment_proof_url TEXT NOT NULL DEFAULT '',
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    order_status TEXT NOT NULL DEFAULT 'Menunggu Pembayaran',
    origin_lat REAL NOT NULL DEFAULT -6.2615,
    origin_lng REAL NOT NULL DEFAULT 106.8106,
    courier_lat REAL NOT NULL DEFAULT -6.2615,
    courier_lng REAL NOT NULL DEFAULT 106.8106,
    dest_lat REAL NOT NULL DEFAULT -6.2088,
    dest_lng REAL NOT NULL DEFAULT 106.8456,
    current_location_label TEXT NOT NULL DEFAULT 'Warehouse elchapo.clg — Jakarta Selatan',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    product_image TEXT NOT NULL,
    size TEXT NOT NULL,
    color TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    line_total INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_tracking_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    location_name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL,
    comment TEXT NOT NULL,
    verified_purchase INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    channel TEXT NOT NULL DEFAULT 'in_app',
    recipient TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS website_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function ensurePaymentMethodBankColumns(): void {
  const cols = db.prepare('PRAGMA table_info(payment_methods)').all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has('bank_name')) {
    db.exec("ALTER TABLE payment_methods ADD COLUMN bank_name TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('account_number')) {
    db.exec("ALTER TABLE payment_methods ADD COLUMN account_number TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('account_holder')) {
    db.exec("ALTER TABLE payment_methods ADD COLUMN account_holder TEXT NOT NULL DEFAULT ''");
  }
}

ensurePaymentMethodBankColumns();

function createDefaultQrisDataUrl(): string {
  // Deterministic crisp SVG QRIS representation (merchant: elchapo.clg) that can be replaced anytime in Admin
  const cells: string[] = [];
  const size = 21;
  const isFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let dark = false;
      if (isFinder(r, c)) {
        const lr = r >= size - 7 ? r - (size - 7) : r;
        const lc = c >= size - 7 ? c - (size - 7) : c;
        dark =
          lr === 0 ||
          lr === 6 ||
          lc === 0 ||
          lc === 6 ||
          (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4);
      } else if (r === 6 || c === 6) {
        dark = (r + c) % 2 === 0;
      } else {
        dark = ((r * 17 + c * 31 + r * c) % 5) < 2;
      }
      if (dark) {
        cells.push(`<rect x="${24 + c * 8}" y="${58 + r * 8}" width="7.6" height="7.6" fill="#111113"/>`);
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 216 260" width="216" height="260">
    <rect width="216" height="260" rx="12" fill="#FFFFFF" stroke="#E4E4E7" stroke-width="2"/>
    <rect x="0" y="0" width="216" height="44" rx="12" fill="#111113"/>
    <rect x="0" y="24" width="216" height="20" fill="#111113"/>
    <text x="108" y="27" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="14" fill="#FFFFFF">QRIS · elchapo.clg</text>
    ${cells.join('')}
    <text x="108" y="242" text-anchor="middle" font-family="monospace" font-size="10" fill="#52525B">NMID: ID10260085647441648</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function ensureDefaultBankTransferPaymentMethod(): void {
  const existingBank = db
    .prepare("SELECT COUNT(*) as count FROM payment_methods WHERE type = 'bank_transfer'")
    .get() as { count: number };
  if (existingBank.count > 0) return;

  const now = new Date().toISOString();
  const bankId = Number(
    db
      .prepare(
        `INSERT INTO payment_methods (
          code, name, type, is_active, qris_image_url, bank_name, account_number, account_holder,
          instructions, gateway_channels_json, updated_by, updated_at
        ) VALUES (?, ?, 'bank_transfer', 1, '', ?, ?, ?, ?, ?, 'system', ?)`
      )
      .run(
        'bank_transfer_bca',
        'Transfer Bank ke Rekening Admin (BCA)',
        'BCA',
        '8820194500',
        'elchapo.clg Official',
        '1. Transfer tepat sesuai nominal total tagihan ke nomor rekening admin di atas.\n2. Simpan bukti transfer (foto struk ATM atau screenshot m-banking).\n3. Unggah bukti transfer pada halaman konfirmasi untuk diverifikasi admin.',
        '["BCA"]',
        now
      ).lastInsertRowid
  );

  db.prepare(
    'INSERT INTO payment_settings_history (payment_method_id, changed_by, summary, created_at) VALUES (?, ?, ?, ?)'
  ).run(bankId, 'system', 'Inisialisasi metode transfer langsung ke rekening bank admin (BCA)', now);
}

export function seedInitialData(): void {
  ensureDefaultBankTransferPaymentMethod();
  const existingCats = db.prepare('SELECT COUNT(*) as count FROM categories').get() as {
    count: number;
  };
  if (existingCats.count > 0) return;

  const now = new Date().toISOString();

  const categories = [
    { name: 'T-Shirt', slug: 't-shirt', description: 'Heavyweight boxy & relaxed cotton tees', sort: 1 },
    { name: 'Hoodie', slug: 'hoodie', description: '480gsm double-lined fleece hoodies', sort: 2 },
    { name: 'Jacket', slug: 'jacket', description: 'Technical canvas & outerwear essentials', sort: 3 },
    { name: 'Pants', slug: 'pants', description: 'Architectural cargo & wide-leg trousers', sort: 4 },
    { name: 'Accessories', slug: 'accessories', description: 'Ballistic nylon bags & headwear', sort: 5 },
    { name: 'Other Collections', slug: 'other-collections', description: 'Seasonal capsule drops & limited editions', sort: 6 },
  ];

  const insertCat = db.prepare(
    'INSERT INTO categories (name, slug, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const catIds: Record<string, number> = {};
  for (const cat of categories) {
    const info = insertCat.run(cat.name, cat.slug, cat.description, cat.sort, now);
    catIds[cat.slug] = Number(info.lastInsertRowid);
  }

  const products = [
    {
      name: 'Heavyweight Boxy Washed Tee',
      slug: 'heavyweight-boxy-washed-tee',
      description:
        'Potongan boxy modern dengan bahu jatuh yang terstruktur. Diproses enzyme-wash untuk tekstur matte yang lembut dan tahan lama.',
      material: '100% Combed Cotton 280 GSM · Pre-shrunk',
      categorySlug: 't-shirt',
      price: 299000,
      discountPrice: 249000,
      stock: 34,
      isNew: 1,
      isBest: 1,
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      colors: ['Washed Charcoal', 'Studio Chalk', 'Stone Gray'],
      images: [
        '/src/assets/images/product_tshirt_boxy_1795224764536.jpg',
        '/src/assets/images/promo_banner_capsule_1795224764816.jpg',
      ],
      salesCount: 142,
    },
    {
      name: 'Monolith 480gsm Pullover Hoodie',
      slug: 'monolith-480gsm-pullover-hoodie',
      description:
        'Hoodie pullover berbahan French Terry ultra-padat 480 GSM dengan double-layered hood tanpa jahitan luar yang tegas.',
      material: '100% Heavyweight French Terry 480 GSM',
      categorySlug: 'hoodie',
      price: 649000,
      discountPrice: null,
      stock: 18,
      isNew: 1,
      isBest: 1,
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      colors: ['Slate Ash', 'Obsidian Black'],
      images: [
        '/src/assets/images/product_hoodie_heavy_1795224764711.jpg',
        '/src/assets/images/hero_streetwear_campaign_1795224764469.jpg',
      ],
      salesCount: 98,
    },
    {
      name: 'Tech Canvas Utility Field Jacket',
      slug: 'tech-canvas-utility-field-jacket',
      description:
        'Jaket outerwear teknis dengan resleting tersembunyi, kerah stand-collar, dan empat saku utilitas geometris anti-air ringan.',
      material: 'Water-Repellent Cotton-Nylon Twill 320 GSM',
      categorySlug: 'jacket',
      price: 899000,
      discountPrice: 749000,
      stock: 12,
      isNew: 1,
      isBest: 0,
      sizes: ['M', 'L', 'XL', 'XXL'],
      colors: ['Matte Black', 'Charcoal'],
      images: [
        '/src/assets/images/product_jacket_work_1795224764288.jpg',
        '/src/assets/images/promo_banner_capsule_1795224764816.jpg',
      ],
      salesCount: 64,
    },
    {
      name: 'Architectural Wide Cargo Trousers',
      slug: 'architectural-wide-cargo-trousers',
      description:
        'Celana kargo wide-leg dengan lipatan lutut ergonomis dan kantong samping berprofil bersih untuk siluet streetwear kontemporer.',
      material: '100% Cotton Ripstop Twill 300 GSM',
      categorySlug: 'pants',
      price: 579000,
      discountPrice: 499000,
      stock: 22,
      isNew: 0,
      isBest: 1,
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      colors: ['Stone Ash', 'Obsidian Black'],
      images: [
        '/src/assets/images/product_pants_cargo_1795224764706.jpg',
        '/src/assets/images/hero_streetwear_campaign_1795224764469.jpg',
      ],
      salesCount: 115,
    },
    {
      name: 'Ballistic Crossbody & Twill Cap Set',
      slug: 'ballistic-crossbody-twill-cap-set',
      description:
        'Tas selempang ringkas berbahan ballistic nylon 1680D dengan ritsleting tahan air, dipadukan topi 6-panel structured twill.',
      material: '1680D Ballistic Nylon & Brushed Cotton Twill',
      categorySlug: 'accessories',
      price: 429000,
      discountPrice: 379000,
      stock: 27,
      isNew: 1,
      isBest: 0,
      sizes: ['All Size'],
      colors: ['Matte Black'],
      images: ['/src/assets/images/product_cap_crossbody_1795224764981.jpg'],
      salesCount: 77,
    },
    {
      name: 'Archive Capsule Oversized Hoodie',
      slug: 'archive-capsule-oversized-hoodie',
      description:
        'Edisi kapsul terbatas dengan siluet drop-shoulder proporsional, rib manset elastis padat, dan finishing garment-dyed.',
      material: '100% Organic Loopback Cotton 460 GSM',
      categorySlug: 'other-collections',
      price: 699000,
      discountPrice: 599000,
      stock: 4,
      isNew: 1,
      isBest: 1,
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Washed Graphite', 'Cement'],
      images: [
        '/src/assets/images/hero_streetwear_campaign_1795224764469.jpg',
        '/src/assets/images/product_hoodie_heavy_1795224764711.jpg',
      ],
      salesCount: 89,
    },
    {
      name: 'Studio Essential Mockneck Tee',
      slug: 'studio-essential-mockneck-tee',
      description:
        'Kaos kerah mockneck minimalis berstruktur rapat yang cocok sebagai inner outerwear maupun dipakai tunggal.',
      material: '100% Supima Heavy Jersey 260 GSM',
      categorySlug: 't-shirt',
      price: 319000,
      discountPrice: null,
      stock: 3,
      isNew: 0,
      isBest: 0,
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Carbon Black', 'Optic White'],
      images: ['/src/assets/images/product_tshirt_boxy_1795224764536.jpg'],
      salesCount: 51,
    },
    {
      name: 'Modular Technical Overshirt',
      slug: 'modular-technical-overshirt',
      description:
        'Overshirt modern berbahan katun kanvas padat dengan kancing snap matte tersembunyi dan jahitan panel minimalis.',
      material: 'Cotton-Poly Technical Canvas 290 GSM',
      categorySlug: 'jacket',
      price: 549000,
      discountPrice: null,
      stock: 15,
      isNew: 0,
      isBest: 1,
      sizes: ['M', 'L', 'XL', 'XXL'],
      colors: ['Anthracite', 'Sand'],
      images: ['/src/assets/images/product_jacket_work_1795224764288.jpg'],
      salesCount: 68,
    },
  ];

  const insertProd = db.prepare(`
    INSERT INTO products (
      name, slug, description, material, category_id, price, discount_price,
      stock, status, is_new_arrival, is_best_seller, sizes_json, colors_json,
      images_json, sales_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of products) {
    insertProd.run(
      p.name,
      p.slug,
      p.description,
      p.material,
      catIds[p.categorySlug],
      p.price,
      p.discountPrice,
      p.stock,
      p.isNew,
      p.isBest,
      JSON.stringify(p.sizes),
      JSON.stringify(p.colors),
      JSON.stringify(p.images),
      p.salesCount,
      now,
      now
    );
  }

  const insertPayment = db.prepare(`
    INSERT INTO payment_methods (
      code, name, type, is_active, qris_image_url, instructions,
      gateway_channels_json, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'system', ?)
  `);

  const qrisId = Number(
    insertPayment.run(
      'qris_main',
      'QRIS elchapo.clg',
      'qris',
      1,
      createDefaultQrisDataUrl(),
      '1. Buka aplikasi e-wallet atau mobile banking (BCA, Mandiri, GoPay, OVO, DANA, ShopeePay).\n2. Pindai kode QRIS di atas dan pastikan nominal transfer sesuai total tagihan.\n3. Simpan bukti pembayaran lalu unggah pada form konfirmasi di bawah ini.',
      '["QRIS All Payment"]',
      now
    ).lastInsertRowid
  );

  insertPayment.run(
    'gateway_digital',
    'Digital Payment Gateway (Instan)',
    'gateway',
    1,
    '',
    'Pembayaran otomatis terverifikasi melalui gerbang pembayaran digital pihak ketiga yang aman (Virtual Account & E-Wallet).',
    '["GoPay","OVO","DANA","ShopeePay","BCA Virtual Account","Mandiri Virtual Account"]',
    now
  );

  db.prepare(
    'INSERT INTO payment_settings_history (payment_method_id, changed_by, summary, created_at) VALUES (?, ?, ?, ?)'
  ).run(qrisId, 'system', 'Inisialisasi metode pembayaran QRIS dinamis elchapo.clg', now);

  const insertShipping = db.prepare(`
    INSERT INTO shipping_settings (service_name, cost, eta, origin_city, origin_lat, origin_lng, is_active)
    VALUES (?, ?, ?, 'Jakarta Selatan', -6.2615, 106.8106, 1)
  `);
  insertShipping.run('JNE Regular', 22000, '2–3 Hari Kerja');
  insertShipping.run('SiCepat BEST', 32000, '1–2 Hari Kerja');
  insertShipping.run('J&T Express', 24000, '2–3 Hari Kerja');
  insertShipping.run('Instant Courier (Jabodetabek)', 45000, 'Hari Ini (2–4 Jam)');

  const insertPromo = db.prepare(`
    INSERT INTO promotions (code, title, discount_type, discount_value, min_order, is_active, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, 1, NULL, ?)
  `);
  insertPromo.run('ELCHAPO10', 'Diskon Koleksi 10%', 'percent', 10, 300000, now);
  insertPromo.run('NEWDROP50K', 'Potongan Rp 50.000', 'fixed', 50000, 500000, now);

  const defaultSettings: Record<string, string> = {
    storeName: 'elchapo.clg',
    announcementText: 'Gratis ongkir untuk pembelian minimal Rp 750.000 · Gunakan kode ELCHAPO10 untuk potongan 10%',
    heroTitle: 'Essential Streetwear. Engineered for Daily Form.',
    heroSubtitle:
      'Koleksi terbaru elchapo.clg menghadirkan siluet boxy terstruktur, katun kelas berat 280–480 GSM, dan utilitas modern dalam palet monokrom yang bersih.',
    heroCta: 'Jelajahi Koleksi',
    heroImage: '/src/assets/images/hero_streetwear_campaign_1795224764469.jpg',
    promoTitle: 'Monochrome Capsule Drop — Terbatas',
    promoSubtitle:
      'Material organic French Terry dan ripstop teknis dengan potongan presisi. Tersedia dalam jumlah terbatas.',
    promoImage: '/src/assets/images/promo_banner_capsule_1795224764816.jpg',
    contactEmail: 'hello@elchapo.clg',
    contactPhone: '085647441648',
    whatsappNumber: '085647441648',
    instagramUrl: 'https://instagram.com/elchapo.clg',
    tiktokUrl: 'https://tiktok.com/@elchapo.clg',
    footerAbout:
      'elchapo.clg adalah label streetwear independen yang berfokus pada siluet modern, kualitas material kelas berat, dan desain fungsional yang tahan waktu.',
    privacyPolicy:
      'elchapo.clg menjaga kerahasiaan data pribadi pelanggan termasuk nama, email, nomor WhatsApp, dan alamat pengiriman. Data hanya digunakan untuk pemrosesan pesanan, notifikasi pengiriman, dan dukungan pelanggan.',
    termsConditions:
      'Seluruh harga tercantum dalam Rupiah (IDR). Pesanan yang dibayar melalui QRIS akan diverifikasi oleh tim kami sebelum diproses. Pengubahan status pengiriman dilakukan secara transparan dan dapat dipantau secara real-time.',
    returnPolicy:
      'Penukaran ukuran atau pengembalian produk cacat produksi dapat diajukan maksimal 7 hari setelah pesanan diterima dengan kondisi hangtag masih terpasang lengkap.',
    aboutStory:
      'Lahir dari semangat desain streetwear kontemporer, elchapo.clg merancang pakaian harian dengan standar konstruksi tinggi: mulai dari kaos katun 280 GSM, hoodie 480 GSM, hingga celana kargo arsitektural. Tanpa logo berlebihan—kekuatan kami ada pada siluet, material, dan detail jahitan.',
  };

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO website_settings (key, value) VALUES (?, ?)'
  );
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, v);
  }
}

seedInitialData();
