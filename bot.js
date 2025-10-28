// =============================
// GABE LAUNDRY BOT 🧺 - OPTIMIZED VERSION
// =============================

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

// =============================
// CONSTANTS & CONFIGURATION
// =============================
const CONFIG = {
  TOKEN: process.env.TELEGRAM_TOKEN,
  ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID,
  CONTACT_PATTERN: /^\+?\d{7,}$/,
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 menit
  MAX_CART_ITEMS: 50,
};

const ERROR_MESSAGES = {
  ORDER_EXPIRED: "Maaf, order Anda sepertinya kedaluwarsa.",
  INVALID_FORMAT:
    "Format salah. Pastikan Anda memasukkan Nama; Nomor HP; Alamat (3 bagian dipisah titik-koma).",
  EMPTY_FIELDS: "Nama dan Alamat tidak boleh kosong. Silakan coba lagi.",
  INVALID_PHONE:
    "Nomor HP tidak valid (minimal 7 digit angka). Silakan coba lagi.",
  CART_FULL: "Keranjang penuh! Maksimal 50 item.",
  GENERIC_ERROR: "Waduh, ada error. Coba ulangi dari /start.",
};

const PAYMENT_DETAILS = {
  bca: "BCA: 1234567890 (a/n Gabe Laundry)",
  mandiri: "Mandiri: 0987654321 (a/n Gabe Laundry)",
  bni: "BNI: 1122334455 (a/n Gabe Laundry)",
  gopay: "Gopay: 0811223344 (a/n Gabe Laundry)",
  ovo: "OVO: 0811223344 (a/n Gabe Laundry)",
  cod: "Bayar di Tempat (Cash on Delivery)",
};

const DELIVERY_FEES = {
  antar_jemput: 10000,
  antar_saja: 5000,
  jemput_saja: 5000,
  ambil_sendiri: 0,
};

const JASA_LAUNDRY = {
  "Cuci Komplit": { price: 11000, unit: "kg" },
  "Flash Laundry (Express)": { price: 25000, unit: "kg" },
  "Cuci Kering Lipat": { price: 9000, unit: "kg" },
  "One Day Service": { price: 16000, unit: "kg" },
  Setrika: { price: 8000, unit: "kg" },
  "Pakaian Formal/Khusus": { price: 65000, unit: "pcs" },
  "Pakaian Musiman/Tebal": { price: 45000, unit: "pcs" },
  "Pakaian Kerja": { price: 35000, unit: "pcs" },
  "Pakaian/Kain Berbahan Sensitif/Khusus": { price: 50000, unit: "pcs" },
  "Pakaian Bayi": { price: 15000, unit: "pcs" },
  "Handuk/Sprei": { price: 25000, unit: "pcs" },
  "Tas/Sepatu/Boneka": { price: 35000, unit: "pcs" },
};

const PRODUCTS_DATA = {
  "Deterjen Bubuk 650Gr": { price: 25000, unit: "pcs" },
  "Deterjen Cair 1L": { price: 20000, unit: "pcs" },
  "Pelembut Pakaian 1L": { price: 18000, unit: "pcs" },
  "Pewangi Pakaian (Mawar/Melati/Sakura) 1L": { price: 50000, unit: "pcs" },
};

// Cached product names array
const PRODUCT_NAMES = Object.keys(PRODUCTS_DATA);

// =============================
// VALIDATION
// =============================
if (!CONFIG.TOKEN) {
  console.error("Error: Token Telegram tidak ditemukan!");
  console.log(
    "Pastikan Anda sudah membuat file .env dan mengisinya dengan TELEGRAM_TOKEN=..."
  );
  process.exit(1);
}
if (!CONFIG.ADMIN_CHAT_ID) {
  console.warn(
    "PERINGATAN: ADMIN_CHAT_ID tidak ditemukan. Notifikasi admin tidak akan berfungsi."
  );
}

// =============================
// BOT INITIALIZATION
// =============================
const bot = new TelegramBot(CONFIG.TOKEN, { polling: true });

// =============================
// STATE MANAGEMENT
// =============================
class SessionManager {
  constructor() {
    this.serviceCarts = new Map();
    this.productCarts = new Map();
    this.pendingOrders = new Map();
    this.ordersAwaitingConfirmation = new Map();
    this.sessionTimers = new Map();
    this.activeListeners = new Map();
  }

  clearSession(chatId) {
    this.serviceCarts.delete(chatId);
    this.productCarts.delete(chatId);
    this.pendingOrders.delete(chatId);
    this.ordersAwaitingConfirmation.delete(chatId);
    this.clearTimer(chatId);
    this.removeListener(chatId);
  }

  resetTimer(chatId) {
    this.clearTimer(chatId);
    const timer = setTimeout(() => {
      this.clearSession(chatId);
      bot.sendMessage(
        chatId,
        "⏰ Sesi Anda telah berakhir karena tidak ada aktivitas.",
        getKeyboard("main")
      );
    }, CONFIG.SESSION_TIMEOUT);
    this.sessionTimers.set(chatId, timer);
  }

  clearTimer(chatId) {
    const timer = this.sessionTimers.get(chatId);
    if (timer) {
      clearTimeout(timer);
      this.sessionTimers.delete(chatId);
    }
  }

  setListener(chatId, listener) {
    this.removeListener(chatId);
    this.activeListeners.set(chatId, listener);
  }

  removeListener(chatId) {
    const listener = this.activeListeners.get(chatId);
    if (listener) {
      bot.removeListener("text", listener);
      this.activeListeners.delete(chatId);
    }
  }

  getServiceCart(chatId) {
    if (!this.serviceCarts.has(chatId)) {
      this.serviceCarts.set(chatId, { items: [], messageId: null });
    }
    return this.serviceCarts.get(chatId);
  }

  getProductCart(chatId) {
    if (!this.productCarts.has(chatId)) {
      this.productCarts.set(chatId, { items: [], messageId: null });
    }
    return this.productCarts.get(chatId);
  }
}

const sessions = new SessionManager();

// =============================
// UTILITY FUNCTIONS
// =============================
const formatCurrency = (amount) => amount.toLocaleString("id-ID");

const calculateTotal = (items) =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0);

const safeEditMessage = async (chatId, messageId, text, options = {}) => {
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...options,
    });
    return true;
  } catch (error) {
    if (!error.message.includes("message is not modified")) {
      console.error("Edit message error:", error.message);
      if (error.message.includes("message to edit not found")) {
        return false;
      }
    }
    return true;
  }
};

const safeSendMessage = async (chatId, text, options = {}) => {
  try {
    return await bot.sendMessage(chatId, text, options);
  } catch (error) {
    console.error("Send message error:", error.message);
    return null;
  }
};

const safeDeleteMessage = async (chatId, messageId) => {
  try {
    if (messageId) {
      await bot.deleteMessage(chatId, messageId);
    }
  } catch (error) {
    // Silently ignore deletion errors
  }
};

const sanitizeServiceName = (name) =>
  name.replace(/ /g, "-").replace(/\//g, "_");

const desanitizeServiceName = (safeName) =>
  safeName.replace(/-/g, " ").replace(/_/g, "/");

// =============================
// KEYBOARD BUILDERS
// =============================
const getKeyboard = (type, data = {}) => {
  const keyboards = {
    main: {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🧺 Order Layanan Jasa", callback_data: "order_laundry" }],
          [{ text: "🧴 Beli Produk", callback_data: "order_produk" }],
          [{ text: "📍 Info Lokasi & Jam Buka", callback_data: "info_lokasi" }],
          [{ text: "📞 Hubungi Admin", callback_data: "hubungi_admin" }],
        ],
      },
    },

    services: {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "👔 Daftar Layanan & Harga",
              callback_data: "lihat_layanan",
            },
          ],
          [{ text: "🧺 Order Laundry", callback_data: "order_laundry" }],
          [{ text: "« Kembali ke Menu Utama", callback_data: "menu_utama" }],
        ],
      },
    },

    products: {
      reply_markup: {
        inline_keyboard: [
          [{ text: "👕 Daftar Produk & Harga", callback_data: "lihat_produk" }],
          [{ text: "🛒 Order Produk", callback_data: "order_produk" }],
          [{ text: "« Kembali ke Menu Utama", callback_data: "menu_utama" }],
        ],
      },
    },

    checkout: {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Lanjut Checkout", callback_data: "checkout_confirm" }],
          [{ text: "❌ Batal", callback_data: "checkout_cancel" }],
        ],
      },
    },

    contactConfirm: {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Data Benar", callback_data: "contact_confirm_yes" }],
          [{ text: "✏️ Ulangi Data", callback_data: "contact_confirm_no" }],
        ],
      },
    },

    delivery: {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `🛵 Antar & Jemput (Rp${formatCurrency(
                DELIVERY_FEES.antar_jemput
              )})`,
              callback_data: "delivery_antar_jemput",
            },
          ],
          [
            {
              text: `🚚 Antar Saja (Rp${formatCurrency(
                DELIVERY_FEES.antar_saja
              )})`,
              callback_data: "delivery_antar_saja",
            },
          ],
          [
            {
              text: `🛍️ Jemput Saja (Rp${formatCurrency(
                DELIVERY_FEES.jemput_saja
              )})`,
              callback_data: "delivery_jemput_saja",
            },
          ],
          [
            {
              text: "🚶 Ambil Sendiri (Gratis)",
              callback_data: "delivery_ambil_sendiri",
            },
          ],
          [{ text: "« Batal Checkout", callback_data: "checkout_cancel" }],
        ],
      },
    },

    payment: {
      reply_markup: {
        inline_keyboard: [
          [{ text: "💳 M-Banking", callback_data: "payment_mbanking" }],
          [{ text: "📱 E-Wallet", callback_data: "payment_ewallet" }],
          [{ text: "💵 Bayar di Tempat (COD)", callback_data: "payment_cod" }],
          [
            {
              text: "« Kembali ke Data Kontak",
              callback_data: "payment_back_to_contact",
            },
          ],
        ],
      },
    },

    mbanking: {
      reply_markup: {
        inline_keyboard: [
          [{ text: "BCA", callback_data: "payment_bca" }],
          [{ text: "Mandiri", callback_data: "payment_mandiri" }],
          [{ text: "BNI", callback_data: "payment_bni" }],
          [{ text: "« Kembali", callback_data: "payment_back_to_main" }],
        ],
      },
    },

    ewallet: {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Gopay", callback_data: "payment_gopay" }],
          [{ text: "OVO", callback_data: "payment_ovo" }],
          [{ text: "« Kembali", callback_data: "payment_back_to_main" }],
        ],
      },
    },

    backToStart: {
      reply_markup: {
        inline_keyboard: [
          [{ text: "↩️ Kembali ke Menu Awal", callback_data: "menu_utama" }],
        ],
      },
    },
  };

  return keyboards[type] || keyboards.main;
};

const buildServicesKeyboard = (chatId) => {
  const keyboard = [];
  const serviceCart = sessions.getServiceCart(chatId);
  const productCart = sessions.getProductCart(chatId);

  // Cart items dengan hapus
  if (serviceCart.items.length > 0) {
    keyboard.push([
      { text: "--- Keranjang Layanan ---", callback_data: "ignore" },
    ]);
    serviceCart.items.forEach((item, index) => {
      keyboard.push([
        {
          text: `❌ Hapus ${item.name} (${item.quantity}${item.unit})`,
          callback_data: `cart_remove_service_${index}`,
        },
      ]);
    });
    keyboard.push([
      { text: "--- Pilih Layanan Baru ---", callback_data: "ignore" },
    ]);
  }

  // Layanan available
  Object.keys(JASA_LAUNDRY).forEach((serviceName) => {
    keyboard.push([
      {
        text: `👕 ${serviceName}`,
        callback_data: `order_select_${sanitizeServiceName(serviceName)}`,
      },
    ]);
  });

  // Navigation
  keyboard.push([
    { text: "🧴 Tambah/Lihat Produk", callback_data: "cart_nav_products" },
  ]);

  if (serviceCart.items.length > 0 || productCart.items.length > 0) {
    keyboard.push([
      {
        text: "✅ Checkout Sekarang (Gabungan)",
        callback_data: "cart_checkout",
      },
    ]);
  }

  keyboard.push([
    { text: "❌ Batalkan Semua & Kembali", callback_data: "cart_cancel_all" },
  ]);

  return { reply_markup: { inline_keyboard: keyboard } };
};

const buildProductsKeyboard = (chatId) => {
  const keyboard = [];
  const serviceCart = sessions.getServiceCart(chatId);
  const productCart = sessions.getProductCart(chatId);

  // Cart items dengan hapus
  if (productCart.items.length > 0) {
    keyboard.push([
      { text: "--- Keranjang Produk ---", callback_data: "ignore" },
    ]);
    productCart.items.forEach((item, index) => {
      keyboard.push([
        {
          text: `❌ Hapus ${item.name} (${item.quantity}${item.unit})`,
          callback_data: `cart_remove_product_${index}`,
        },
      ]);
    });
    keyboard.push([
      { text: "--- Pilih Produk Baru ---", callback_data: "ignore" },
    ]);
  }

  // Produk available
  PRODUCT_NAMES.forEach((productName, index) => {
    keyboard.push([
      {
        text: `🧴 ${productName}`,
        callback_data: `product_select_${index}`,
      },
    ]);
  });

  // Navigation
  keyboard.push([
    {
      text: "🧺 Tambah/Lihat Layanan Jasa",
      callback_data: "cart_nav_services",
    },
  ]);

  if (serviceCart.items.length > 0 || productCart.items.length > 0) {
    keyboard.push([
      {
        text: "✅ Checkout Sekarang (Gabungan)",
        callback_data: "cart_checkout",
      },
    ]);
  }

  keyboard.push([
    { text: "❌ Batalkan Semua & Kembali", callback_data: "cart_cancel_all" },
  ]);

  return { reply_markup: { inline_keyboard: keyboard } };
};

// =============================
// CORE FUNCTIONS
// =============================
const sendStartMessage = async (chatId) => {
  sessions.clearSession(chatId);
  await safeSendMessage(
    chatId,
    `🧺 Halo, selamat datang di Gabe Laundry!  
Saya LaundryBot, siap bantu kamu laundry pakaian bersih, wangi, dan rapi ✨

Silakan pilih menu di bawah ini:`,
    { parse_mode: "Markdown", ...getKeyboard("main") }
  );
};

const showServiceOrderMenu = async (chatId, messagePrefix = "") => {
  sessions.resetTimer(chatId);

  const serviceCart = sessions.getServiceCart(chatId);
  const productCart = sessions.getProductCart(chatId);

  let text = messagePrefix ? `${messagePrefix}\n\n` : "";
  text += "🛒 *Keranjang Layanan Anda Saat Ini:*\n";

  const serviceTotal = calculateTotal(serviceCart.items);
  const productTotal = calculateTotal(productCart.items);
  const combinedTotal = serviceTotal + productTotal;

  if (serviceCart.items.length === 0) {
    text += "  _(Kosong)_\n";
  } else {
    serviceCart.items.forEach((item, index) => {
      const subtotal = item.price * item.quantity;
      text += `  ${index + 1}. ${item.name} (${item.quantity}${
        item.unit
      }) = Rp${formatCurrency(subtotal)}\n`;
    });
  }

  text += `\n*Total Layanan: Rp${formatCurrency(serviceTotal)}*`;
  if (productTotal > 0) {
    text += `\n*Total Produk: Rp${formatCurrency(productTotal)}*`;
  }
  text += `\n*💰 Total Keseluruhan: Rp${formatCurrency(combinedTotal)}*`;
  text += "\n\nSilakan pilih layanan untuk ditambahkan/dihapus:";

  const keyboard = buildServicesKeyboard(chatId);
  const messageId = serviceCart.messageId || productCart.messageId;

  if (messageId) {
    const success = await safeEditMessage(chatId, messageId, text, {
      parse_mode: "Markdown",
      ...keyboard,
    });

    if (!success) {
      const msg = await safeSendMessage(chatId, text, {
        parse_mode: "Markdown",
        ...keyboard,
      });
      if (msg) {
        serviceCart.messageId = msg.message_id;
        productCart.messageId = msg.message_id;
      }
    } else {
      serviceCart.messageId = messageId;
      productCart.messageId = messageId;
    }
  } else {
    const msg = await safeSendMessage(chatId, text, {
      parse_mode: "Markdown",
      ...keyboard,
    });
    if (msg) {
      serviceCart.messageId = msg.message_id;
      productCart.messageId = msg.message_id;
    }
  }
};

const showProductOrderMenu = async (chatId, messagePrefix = "") => {
  sessions.resetTimer(chatId);

  const serviceCart = sessions.getServiceCart(chatId);
  const productCart = sessions.getProductCart(chatId);

  let text = messagePrefix ? `${messagePrefix}\n\n` : "";
  text += "🛒 *Keranjang Produk Anda Saat Ini:*\n";

  const serviceTotal = calculateTotal(serviceCart.items);
  const productTotal = calculateTotal(productCart.items);
  const combinedTotal = serviceTotal + productTotal;

  if (productCart.items.length === 0) {
    text += "  _(Kosong)_\n";
  } else {
    productCart.items.forEach((item, index) => {
      const subtotal = item.price * item.quantity;
      text += `  ${index + 1}. ${item.name} (${item.quantity}${
        item.unit
      }) = Rp${formatCurrency(subtotal)}\n`;
    });
  }

  text += `\n*Total Produk: Rp${formatCurrency(productTotal)}*`;
  if (serviceTotal > 0) {
    text += `\n*Total Layanan: Rp${formatCurrency(serviceTotal)}*`;
  }
  text += `\n*💰 Total Keseluruhan: Rp${formatCurrency(combinedTotal)}*`;
  text += "\n\nSilakan pilih produk untuk ditambahkan/dihapus:";

  const keyboard = buildProductsKeyboard(chatId);
  const messageId = productCart.messageId || serviceCart.messageId;

  if (messageId) {
    const success = await safeEditMessage(chatId, messageId, text, {
      parse_mode: "Markdown",
      ...keyboard,
    });

    if (!success) {
      const msg = await safeSendMessage(chatId, text, {
        parse_mode: "Markdown",
        ...keyboard,
      });
      if (msg) {
        serviceCart.messageId = msg.message_id;
        productCart.messageId = msg.message_id;
      }
    } else {
      serviceCart.messageId = messageId;
      productCart.messageId = messageId;
    }
  } else {
    const msg = await safeSendMessage(chatId, text, {
      parse_mode: "Markdown",
      ...keyboard,
    });
    if (msg) {
      serviceCart.messageId = msg.message_id;
      productCart.messageId = msg.message_id;
    }
  }
};

const showServiceQuantitySelector = async (
  chatId,
  serviceName,
  currentQuantity,
  messageId
) => {
  const service = JASA_LAUNDRY[serviceName];
  if (!service) {
    console.error("Layanan tidak ditemukan:", serviceName);
    return;
  }

  sessions.resetTimer(chatId);
  const unit = service.unit;
  const safeName = sanitizeServiceName(serviceName);

  let text = `🧺 Pilih jumlah untuk *${serviceName}*:\n\n*Jumlah Saat Ini: ${currentQuantity} ${unit}*`;
  const keyboard = [];

  const row1 = [];
  const row2 = [];

  if (unit === "kg") {
    row1.push({
      text: "+0.5 kg",
      callback_data: `qty_update_${safeName}_${currentQuantity + 0.5}`,
    });
    row1.push({
      text: "+1 kg",
      callback_data: `qty_update_${safeName}_${currentQuantity + 1}`,
    });
    if (currentQuantity >= 0.5) {
      row2.push({
        text: "-0.5 kg",
        callback_data: `qty_update_${safeName}_${Math.max(
          0,
          currentQuantity - 0.5
        )}`,
      });
    }
    if (currentQuantity >= 1) {
      row2.push({
        text: "-1 kg",
        callback_data: `qty_update_${safeName}_${Math.max(
          0,
          currentQuantity - 1
        )}`,
      });
    }
  } else {
    row1.push({
      text: "+1 pcs",
      callback_data: `qty_update_${safeName}_${currentQuantity + 1}`,
    });
    row1.push({
      text: "+5 pcs",
      callback_data: `qty_update_${safeName}_${currentQuantity + 5}`,
    });
    if (currentQuantity >= 1) {
      row2.push({
        text: "-1 pcs",
        callback_data: `qty_update_${safeName}_${Math.max(
          0,
          currentQuantity - 1
        )}`,
      });
    }
    if (currentQuantity >= 5) {
      row2.push({
        text: "-5 pcs",
        callback_data: `qty_update_${safeName}_${Math.max(
          0,
          currentQuantity - 5
        )}`,
      });
    }
  }

  keyboard.push(row1);
  if (row2.length > 0) keyboard.push(row2);

  if (currentQuantity > 0) {
    keyboard.push([
      {
        text: `✅ Konfirmasi ${currentQuantity} ${unit}`,
        callback_data: `qty_confirm_${safeName}_${currentQuantity}`,
      },
    ]);
  }

  keyboard.push([
    {
      text: "⬅️ Kembali ke Menu Layanan",
      callback_data: "service_item_cancel",
    },
  ]);

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard },
  });
};

const showProductQuantitySelector = async (
  chatId,
  productName,
  productIndex,
  currentQuantity,
  messageId
) => {
  const product = PRODUCTS_DATA[productName];
  if (!product) {
    console.error("Produk tidak ditemukan:", productName);
    await showProductOrderMenu(chatId);
    return;
  }

  sessions.resetTimer(chatId);
  const unit = product.unit;

  let text = `🧴 Pilih jumlah untuk *${productName}*:\n\n*Jumlah Saat Ini: ${currentQuantity} ${unit}*`;
  const keyboard = [];

  const row1 = [
    {
      text: "+1 pcs",
      callback_data: `product_qty_update_${productIndex}_${
        currentQuantity + 1
      }`,
    },
    {
      text: "+5 pcs",
      callback_data: `product_qty_update_${productIndex}_${
        currentQuantity + 5
      }`,
    },
  ];

  const row2 = [];
  if (currentQuantity >= 1) {
    row2.push({
      text: "-1 pcs",
      callback_data: `product_qty_update_${productIndex}_${Math.max(
        0,
        currentQuantity - 1
      )}`,
    });
  }
  if (currentQuantity >= 5) {
    row2.push({
      text: "-5 pcs",
      callback_data: `product_qty_update_${productIndex}_${Math.max(
        0,
        currentQuantity - 5
      )}`,
    });
  }

  keyboard.push(row1);
  if (row2.length > 0) keyboard.push(row2);

  if (currentQuantity > 0) {
    keyboard.push([
      {
        text: `✅ Konfirmasi ${currentQuantity} ${unit}`,
        callback_data: `product_qty_confirm_${productIndex}_${currentQuantity}`,
      },
    ]);
  }

  keyboard.push([
    { text: "⬅️ Kembali ke Menu Produk", callback_data: "product_item_cancel" },
  ]);

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard },
  });
};

const askForContactInfo = async (chatId) => {
  const orderData = sessions.pendingOrders.get(chatId);
  if (!orderData) {
    await safeSendMessage(
      chatId,
      ERROR_MESSAGES.ORDER_EXPIRED,
      getKeyboard("main")
    );
    return;
  }

  sessions.resetTimer(chatId);

  let totalText = "";
  if (typeof orderData.total !== "undefined") {
    totalText = `\n*Total Tagihan Anda (termasuk ongkir): Rp${formatCurrency(
      orderData.total
    )}*`;
  }

  await safeSendMessage(
    chatId,
    `${totalText}

Silakan kirim *Nama*, *Nomor HP*, dan *Alamat Jemput* dalam 1 baris.

*Gunakan tanda titik-koma (;) sebagai pemisah.* Pastikan ada *3 bagian* terpisah.

Contoh:
Joni; 08123456789; Jl. Mawar No. 1, Serpong`,
    { parse_mode: "Markdown" }
  );

  // Handle contact input dengan proper cleanup
  const contactHandler = async (msg) => {
    if (msg.chat.id !== chatId) return;

    sessions.removeListener(chatId);

    if (msg.text === "/start") {
      await sendStartMessage(chatId);
      return;
    }

    const currentOrder = sessions.pendingOrders.get(chatId);
    if (!currentOrder) {
      await safeSendMessage(
        chatId,
        ERROR_MESSAGES.ORDER_EXPIRED,
        getKeyboard("main")
      );
      return;
    }

    // Validasi format
    const parts = msg.text.split(";");
    if (parts.length !== 3) {
      await safeSendMessage(chatId, ERROR_MESSAGES.INVALID_FORMAT);
      await askForContactInfo(chatId);
      return;
    }

    const nama = parts[0]?.trim() || "";
    const hp = parts[1]?.trim() || "";
    const alamat = parts[2]?.trim() || "";

    if (!nama || !alamat) {
      await safeSendMessage(chatId, ERROR_MESSAGES.EMPTY_FIELDS);
      await askForContactInfo(chatId);
      return;
    }

    if (!CONFIG.CONTACT_PATTERN.test(hp.replace(/\s|-/g, ""))) {
      await safeSendMessage(chatId, ERROR_MESSAGES.INVALID_PHONE);
      await askForContactInfo(chatId);
      return;
    }

    // Simpan data yang valid
    currentOrder.contactText = msg.text;
    sessions.pendingOrders.set(chatId, currentOrder);

    await safeSendMessage(
      chatId,
      `Mohon periksa kembali data Anda:

*Nama:*
\`\`\`
${nama}
\`\`\`
*Nomor HP:*
\`\`\`
${hp}
\`\`\`
*Alamat Jemput:*
\`\`\`
${alamat}
\`\`\`

Apakah data di atas sudah benar?`,
      { parse_mode: "Markdown", ...getKeyboard("contactConfirm") }
    );
  };

  sessions.setListener(chatId, contactHandler);
  bot.on("text", contactHandler);
};

const sendFinalConfirmationAndReset = async (chatId, paymentInfoText) => {
  const orderData = sessions.pendingOrders.get(chatId);

  if (
    !orderData ||
    !orderData.contactText ||
    !orderData.details ||
    typeof orderData.total === "undefined"
  ) {
    console.error(`Order data incomplete for chatId: ${chatId}`);
    await safeSendMessage(
      chatId,
      ERROR_MESSAGES.GENERIC_ERROR,
      getKeyboard("main")
    );
    sessions.pendingOrders.delete(chatId);
    return;
  }

  const {
    contactText,
    details,
    total,
    deliveryFee,
    deliveryMethod,
    isConfirmedPayment,
  } = orderData;
  const originalTotal = total - (deliveryFee || 0);

  const parts = contactText.split(";");
  const nama = parts[0]?.trim() || "[Belum diisi]";
  const hp = parts[1]?.trim() || "[Belum diisi]";
  const alamat = parts[2]?.trim() || "[Belum diisi]";

  // Kirim ke admin dengan escaping untuk mencegah auto-link
  if (CONFIG.ADMIN_CHAT_ID) {
    const adminTitle = isConfirmedPayment
      ? "✅ *Pembayaran Dikonfirmasi* ✅"
      : "🔔 *Pesanan Baru Diterima!* 🔔";
    const adminPaymentStatus = orderData.waitingForProof
      ? "(Menunggu Verifikasi Bukti)"
      : isConfirmedPayment
      ? "(TELAH DIKONFIRMASI)"
      : paymentInfoText === PAYMENT_DETAILS.cod
      ? "(Pesanan COD)"
      : "";

    // Escape nomor telepon dan chat ID agar tidak jadi link
    const escapedHp = hp.replace(/(\d)/g, "$1\u200B"); // Zero-width space
    const escapedChatId = chatId.toString().replace(/(\d)/g, "$1\u200B");

    const adminMessage = `${adminTitle}

*Pelanggan:*
Nama: ${nama}
HP: ${escapedHp}
Alamat: ${alamat}

Chat ID: ${escapedChatId}

*Pesanan:*
\`\`\`
${details}
\`\`\`
Subtotal: Rp${formatCurrency(originalTotal)}
Pengiriman: ${deliveryMethod || "Ambil Sendiri"}
*Total: Rp${formatCurrency(total)}*

*Pembayaran:* ${paymentInfoText} ${adminPaymentStatus}`;

    await safeSendMessage(CONFIG.ADMIN_CHAT_ID, adminMessage, {
      parse_mode: "Markdown",
    });
  }

  // Kirim konfirmasi ke user
  let userIntroMessage;
  if (isConfirmedPayment) {
    userIntroMessage =
      "*Pembayaran Anda telah dikonfirmasi!* Pesanan Anda akan segera kami proses.";
  } else if (paymentInfoText === PAYMENT_DETAILS.cod) {
    userIntroMessage =
      "Pesanan (COD) Anda telah kami catat. Admin kami akan segera menghubungi kamu untuk konfirmasi penjemputan.";
  } else {
    userIntroMessage =
      "Pesanan Anda telah kami catat. Admin kami akan segera menghubungi kamu.";
  }

  let finalText = `Terima kasih ${nama.split(" ")[0]}! 🙏

${userIntroMessage}

Berikut adalah *ringkasan pesanan* Anda:
\`\`\`
${details}
\`\`\`
Subtotal Pesanan: Rp${formatCurrency(originalTotal)}
Biaya Antar/Jemput: Rp${formatCurrency(deliveryFee || 0)}
*Total Tagihan: Rp${formatCurrency(total)}*

---
Dan ini adalah *detail kontak* Anda:

*Nama:*
\`\`\`
${nama}
\`\`\`
*Nomor HP:*
\`\`\`
${hp}
\`\`\`
*Alamat Jemput/Pengambilan:*
\`\`\`
${alamat}
\`\`\`

---
*Metode Pembayaran Dipilih:*
\`\`\`
${paymentInfoText}
\`\`\``;

  if (isConfirmedPayment) {
    finalText += "\n\n*(Pembayaran Lunas Diterima)*";
  } else if (paymentInfoText !== PAYMENT_DETAILS.cod) {
    finalText +=
      "\n\n*(Silakan lakukan pembayaran dan kirim bukti transfer ke Admin kami)*";
  }

  finalText += `

---
*Jika ada kendala atau pertanyaan terkait order ini, silakan hubungi admin:*
📞 0811-1222-3333
📧 admin@gabelaundry.com

🧺 Terima kasih sudah order di Gabe Laundry! 💚`;

  await safeSendMessage(chatId, finalText, {
    parse_mode: "Markdown",
    ...getKeyboard("backToStart"),
  });

  sessions.pendingOrders.delete(chatId);
};

// =============================
// BOT COMMAND HANDLERS
// =============================
bot.onText(/\/start/, async (msg) => {
  await sendStartMessage(msg.chat.id);
});

// =============================
// CALLBACK QUERY HANDLER
// =============================
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;
  const messageId = query.message.message_id;

  bot.answerCallbackQuery(query.id);

  // Handle admin actions
  if (
    chatId.toString() === CONFIG.ADMIN_CHAT_ID?.toString() &&
    action.startsWith("admin_")
  ) {
    console.log(`🔍 Admin action received: ${action}`);

    const [, decision, customerChatIdStr] = action.split("_");
    const customerChatId = parseInt(customerChatIdStr); // CONVERT TO NUMBER

    console.log(`👤 Customer Chat ID (parsed as number): ${customerChatId}`);

    // Debug: Lihat isi ordersAwaitingConfirmation
    console.log(
      `📦 Orders awaiting confirmation:`,
      Array.from(sessions.ordersAwaitingConfirmation.keys())
    );

    const orderData = sessions.ordersAwaitingConfirmation.get(customerChatId);

    if (!orderData) {
      console.error(`❌ Order data NOT FOUND for chatId: ${customerChatId}`);
      console.log(
        `🔍 Available keys in map:`,
        Array.from(sessions.ordersAwaitingConfirmation.keys())
      );

      try {
        await bot.editMessageCaption(
          (query.message.caption || "") +
            "\n\n-- *STATUS: TIDAK DITEMUKAN (Mungkin sudah diproses)* --",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
          }
        );
      } catch (e) {
        console.error("Failed to edit admin message (not found):", e.message);
      }
      return;
    }

    console.log(`✅ Order data FOUND for chatId: ${customerChatId}`);
    sessions.ordersAwaitingConfirmation.delete(customerChatId);

    if (decision === "confirm") {
      console.log(`✅ Admin CONFIRMED payment for chatId: ${customerChatId}`);

      try {
        await bot.editMessageCaption(
          (query.message.caption || "") + "\n\n-- *STATUS: ✅ DIKONFIRMASI* --",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
          }
        );
      } catch (e) {
        console.error("Failed to edit admin message (confirm):", e.message);
      }

      orderData.isConfirmedPayment = true;
      orderData.waitingForProof = false;
      sessions.pendingOrders.set(customerChatId, orderData);

      await sendFinalConfirmationAndReset(
        customerChatId,
        orderData.paymentMethod
      );
    } else if (decision === "reject") {
      console.log(`❌ Admin REJECTED payment for chatId: ${customerChatId}`);

      try {
        await bot.editMessageCaption(
          (query.message.caption || "") + "\n\n-- *STATUS: ❌ DITOLAK* --",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
          }
        );
      } catch (e) {
        console.error("Failed to edit admin message (reject):", e.message);
      }

      await safeSendMessage(
        customerChatId,
        `❌ Maaf, pembayaran Anda ditolak oleh admin.

Total Tagihan: *Rp${formatCurrency(orderData.total)}*
Metode: *${orderData.paymentMethod}*

Silakan hubungi admin di 📞 0811-1222-3333 untuk klarifikasi.`,
        { parse_mode: "Markdown", ...getKeyboard("main") }
      );
    }
    return;
  }

  sessions.resetTimer(chatId);

  // Handle remove from cart
  if (action.startsWith("cart_remove_")) {
    const [, , type, indexStr] = action.split("_");
    const index = parseInt(indexStr);

    if (type === "service") {
      const cart = sessions.getServiceCart(chatId);
      if (cart.items[index]) {
        const removedName = cart.items[index].name;
        cart.items.splice(index, 1);
        await showServiceOrderMenu(
          chatId,
          `🗑️ ${removedName} dihapus dari keranjang.`
        );
      }
    } else if (type === "product") {
      const cart = sessions.getProductCart(chatId);
      if (cart.items[index]) {
        const removedName = cart.items[index].name;
        cart.items.splice(index, 1);
        await showProductOrderMenu(
          chatId,
          `🗑️ ${removedName} dihapus dari keranjang.`
        );
      }
    }
    return;
  }

  // Handle service selection and quantity
  if (action.startsWith("order_select_")) {
    const safeName = action.substring("order_select_".length);
    const serviceName = desanitizeServiceName(safeName);

    if (JASA_LAUNDRY[serviceName]) {
      await showServiceQuantitySelector(chatId, serviceName, 0, messageId);
    }
    return;
  }

  if (action.startsWith("qty_update_")) {
    const parts = action.split("_");
    const quantity = parseFloat(parts[parts.length - 1]);
    const safeName = parts.slice(2, -1).join("_");
    const serviceName = desanitizeServiceName(safeName);

    if (!isNaN(quantity) && JASA_LAUNDRY[serviceName]) {
      await showServiceQuantitySelector(
        chatId,
        serviceName,
        quantity,
        messageId
      );
    }
    return;
  }

  if (action.startsWith("qty_confirm_")) {
    const parts = action.split("_");
    const quantity = parseFloat(parts[parts.length - 1]);
    const safeName = parts.slice(2, -1).join("_");
    const serviceName = desanitizeServiceName(safeName);
    const service = JASA_LAUNDRY[serviceName];

    if (service && quantity > 0) {
      const cart = sessions.getServiceCart(chatId);

      if (cart.items.length >= CONFIG.MAX_CART_ITEMS) {
        await safeSendMessage(chatId, ERROR_MESSAGES.CART_FULL);
        return;
      }

      cart.messageId = messageId;
      cart.items.push({
        name: serviceName,
        price: service.price,
        unit: service.unit,
        quantity: quantity,
      });

      await showServiceOrderMenu(
        chatId,
        `✅ ${quantity} ${service.unit} ${serviceName} berhasil ditambahkan!`
      );
    }
    return;
  }

  if (action === "service_item_cancel") {
    await showServiceOrderMenu(chatId);
    return;
  }

  // Handle product selection and quantity
  if (action.startsWith("product_select_")) {
    const indexStr = action.substring("product_select_".length);
    const index = parseInt(indexStr);

    if (index >= 0 && index < PRODUCT_NAMES.length) {
      const productName = PRODUCT_NAMES[index];
      await showProductQuantitySelector(
        chatId,
        productName,
        index,
        0,
        messageId
      );
    }
    return;
  }

  if (action.startsWith("product_qty_update_")) {
    const parts = action.split("_");
    const quantity = parseFloat(parts[parts.length - 1]);
    const index = parseInt(parts[parts.length - 2]);

    if (!isNaN(quantity) && index >= 0 && index < PRODUCT_NAMES.length) {
      const productName = PRODUCT_NAMES[index];
      await showProductQuantitySelector(
        chatId,
        productName,
        index,
        quantity,
        messageId
      );
    }
    return;
  }

  if (action.startsWith("product_qty_confirm_")) {
    const parts = action.split("_");
    const quantity = parseFloat(parts[parts.length - 1]);
    const index = parseInt(parts[parts.length - 2]);

    if (index >= 0 && index < PRODUCT_NAMES.length && quantity > 0) {
      const productName = PRODUCT_NAMES[index];
      const product = PRODUCTS_DATA[productName];
      const cart = sessions.getProductCart(chatId);

      if (cart.items.length >= CONFIG.MAX_CART_ITEMS) {
        await safeSendMessage(chatId, ERROR_MESSAGES.CART_FULL);
        return;
      }

      cart.messageId = messageId;
      cart.items.push({
        name: productName,
        price: product.price,
        unit: product.unit,
        quantity: quantity,
      });

      await showProductOrderMenu(
        chatId,
        `✅ ${quantity} ${product.unit} ${productName} berhasil ditambahkan!`
      );
    }
    return;
  }

  if (action === "product_item_cancel") {
    await showProductOrderMenu(chatId);
    return;
  }

  // Navigation
  if (action === "cart_nav_services") {
    await showServiceOrderMenu(chatId, "Pindah ke menu Layanan Jasa...");
    return;
  }

  if (action === "cart_nav_products") {
    await showProductOrderMenu(chatId, "Pindah ke menu Beli Produk...");
    return;
  }

  if (action === "cart_cancel_all") {
    const serviceCart = sessions.getServiceCart(chatId);
    const productCart = sessions.getProductCart(chatId);

    await safeDeleteMessage(chatId, serviceCart.messageId);
    if (productCart.messageId !== serviceCart.messageId) {
      await safeDeleteMessage(chatId, productCart.messageId);
    }

    sessions.serviceCarts.delete(chatId);
    sessions.productCarts.delete(chatId);

    await safeSendMessage(
      chatId,
      "Semua pesanan dibatalkan.",
      getKeyboard("main")
    );
    return;
  }

  // Checkout process
  if (action === "cart_checkout") {
    const serviceCart = sessions.getServiceCart(chatId);
    const productCart = sessions.getProductCart(chatId);

    if (serviceCart.items.length === 0 && productCart.items.length === 0) {
      await safeSendMessage(
        chatId,
        "Keranjang Anda kosong.",
        getKeyboard("main")
      );
      return;
    }

    let orderDetails = "";
    let total = 0;

    if (serviceCart.items.length > 0) {
      total += calculateTotal(serviceCart.items);
      orderDetails += "*Layanan Jasa:*\n";
      orderDetails += serviceCart.items
        .map(
          (item) =>
            `  - ${item.name} x${item.quantity}${
              item.unit
            } = Rp${formatCurrency(item.price * item.quantity)}`
        )
        .join("\n");
    }

    if (productCart.items.length > 0) {
      total += calculateTotal(productCart.items);
      if (serviceCart.items.length > 0) orderDetails += "\n\n";
      orderDetails += "*Produk:*\n";
      orderDetails += productCart.items
        .map(
          (item) =>
            `  - ${item.name} x${item.quantity}${
              item.unit
            } = Rp${formatCurrency(item.price * item.quantity)}`
        )
        .join("\n");
    }

    sessions.pendingOrders.set(chatId, { details: orderDetails, total });

    await safeDeleteMessage(chatId, serviceCart.messageId);
    if (productCart.messageId !== serviceCart.messageId) {
      await safeDeleteMessage(chatId, productCart.messageId);
    }

    sessions.serviceCarts.delete(chatId);
    sessions.productCarts.delete(chatId);

    await safeSendMessage(
      chatId,
      `✅ Order Gabungan Kamu:
${orderDetails}

💰 *Total Keseluruhan: Rp${formatCurrency(total)}*

*(Total ini belum termasuk biaya antar/jemput)*

Mau lanjut checkout?`,
      { parse_mode: "Markdown", ...getKeyboard("checkout") }
    );
    return;
  }

  // Main menu actions
  const menuActions = {
    menu_utama: () => sendStartMessage(chatId),

    nav_services: async () => {
      await safeSendMessage(
        chatId,
        "Anda memilih *Layanan Jasa*. Silakan pilih:",
        {
          parse_mode: "Markdown",
          ...getKeyboard("services"),
        }
      );
    },

    nav_products: async () => {
      await safeSendMessage(
        chatId,
        "Anda memilih *Beli Produk*. Silakan pilih:",
        {
          parse_mode: "Markdown",
          ...getKeyboard("products"),
        }
      );
    },

    lihat_layanan: async () => {
      let text = "👔 Daftar Layanan Kami:\n\n";
      Object.entries(JASA_LAUNDRY).forEach(([nama, detail]) => {
        text += `👕 ${nama} – Rp${formatCurrency(detail.price)} /${
          detail.unit
        }\n`;
      });
      text += '\nSilakan tekan "Order Laundry" untuk mulai.';
      await safeSendMessage(chatId, text, getKeyboard("services"));
    },

    order_laundry: () =>
      showServiceOrderMenu(chatId, "Selamat datang di menu order!"),

    lihat_produk: async () => {
      let text = "🧴 Daftar Produk Kami:\n\n";
      Object.entries(PRODUCTS_DATA).forEach(([nama, detail]) => {
        text += `🧴 ${nama} – Rp${formatCurrency(detail.price)} /${
          detail.unit
        }\n`;
      });
      text += '\nSilakan tekan "Order Produk" untuk mulai.';
      await safeSendMessage(chatId, text, getKeyboard("products"));
    },

    order_produk: () =>
      showProductOrderMenu(chatId, "Selamat datang di menu order produk!"),

    checkout_confirm: async () => {
      if (!sessions.pendingOrders.has(chatId)) {
        await safeSendMessage(
          chatId,
          ERROR_MESSAGES.ORDER_EXPIRED,
          getKeyboard("main")
        );
        return;
      }
      await safeEditMessage(
        chatId,
        messageId,
        "Pilih *Metode Pengambilan & Pengantaran*:",
        {
          parse_mode: "Markdown",
          ...getKeyboard("delivery"),
        }
      );
    },

    checkout_cancel: async () => {
      sessions.pendingOrders.delete(chatId);
      await safeDeleteMessage(chatId, messageId);
      await safeSendMessage(chatId, "Order dibatalkan.", getKeyboard("main"));
    },

    info_lokasi: async () => {
      await safeSendMessage(
        chatId,
        `🕒 Buka: 08.00–20.00 WIB\n📍 Alamat: Jl. Cucian No. 1\n📌 Maps: [Lokasi](https://bit.ly/gabe-laundry)`,
        { parse_mode: "Markdown", ...getKeyboard("main") }
      );
    },

    hubungi_admin: async () => {
      await safeSendMessage(
        chatId,
        `Kontak Admin:\n📞 0811-1222-3333\n📧 admin@gabelaundry.com`,
        getKeyboard("main")
      );
    },
  };

  // Delivery selection
  if (action.startsWith("delivery_")) {
    const feeKey = action.substring("delivery_".length);
    const orderData = sessions.pendingOrders.get(chatId);

    if (!orderData) {
      await safeSendMessage(
        chatId,
        ERROR_MESSAGES.ORDER_EXPIRED,
        getKeyboard("main")
      );
      return;
    }

    const fee = DELIVERY_FEES[feeKey];
    orderData.total += fee;
    orderData.deliveryFee = fee;
    orderData.deliveryMethod = `${feeKey.replace(
      /_/g,
      " "
    )} (Rp${formatCurrency(fee)})`;
    sessions.pendingOrders.set(chatId, orderData);

    await safeDeleteMessage(chatId, messageId);
    await askForContactInfo(chatId);
    return;
  }

  // Contact confirmation
  if (action === "contact_confirm_yes") {
    if (!sessions.pendingOrders.get(chatId)?.contactText) {
      await safeSendMessage(
        chatId,
        ERROR_MESSAGES.ORDER_EXPIRED,
        getKeyboard("main")
      );
      return;
    }
    await safeEditMessage(
      chatId,
      messageId,
      "Data kontak benar 👍\n\nPilih *metode pembayaran*:",
      {
        parse_mode: "Markdown",
        ...getKeyboard("payment"),
      }
    );
    return;
  }

  if (action === "contact_confirm_no") {
    const orderData = sessions.pendingOrders.get(chatId);
    if (!orderData) {
      await safeSendMessage(
        chatId,
        ERROR_MESSAGES.ORDER_EXPIRED,
        getKeyboard("main")
      );
      return;
    }

    if (orderData.deliveryFee) {
      orderData.total -= orderData.deliveryFee;
      delete orderData.deliveryFee;
      delete orderData.deliveryMethod;
    }
    delete orderData.contactText;
    sessions.pendingOrders.set(chatId, orderData);

    await safeDeleteMessage(chatId, messageId);
    await safeSendMessage(
      chatId,
      "Data direset. Pilih *Metode Pengambilan & Pengantaran*:",
      {
        parse_mode: "Markdown",
        ...getKeyboard("delivery"),
      }
    );
    return;
  }

  // Payment method selection
  if (action === "payment_mbanking") {
    await safeEditMessage(
      chatId,
      messageId,
      "Pilih Bank:",
      getKeyboard("mbanking")
    );
    return;
  }

  if (action === "payment_ewallet") {
    await safeEditMessage(
      chatId,
      messageId,
      "Pilih E-Wallet:",
      getKeyboard("ewallet")
    );
    return;
  }

  if (action === "payment_back_to_main") {
    await safeEditMessage(chatId, messageId, "Pilih *metode pembayaran*:", {
      parse_mode: "Markdown",
      ...getKeyboard("payment"),
    });
    return;
  }

  if (action === "payment_back_to_contact") {
    if (!sessions.pendingOrders.has(chatId)) {
      await safeSendMessage(
        chatId,
        ERROR_MESSAGES.ORDER_EXPIRED,
        getKeyboard("main")
      );
      return;
    }
    await safeDeleteMessage(chatId, messageId);
    await askForContactInfo(chatId);
    return;
  }

  // COD payment
  if (action === "payment_cod") {
    const orderData = sessions.pendingOrders.get(chatId);
    if (orderData) {
      orderData.isConfirmedPayment = false;
      orderData.waitingForProof = false;
      sessions.pendingOrders.set(chatId, orderData);
    }
    await sendFinalConfirmationAndReset(chatId, PAYMENT_DETAILS.cod);
    return;
  }

  // Bank/E-wallet payment
  const paymentMethods = ["bca", "mandiri", "bni", "gopay", "ovo"];
  for (const method of paymentMethods) {
    if (action === `payment_${method}`) {
      const orderData = sessions.pendingOrders.get(chatId);
      if (!orderData) {
        await safeSendMessage(
          chatId,
          ERROR_MESSAGES.ORDER_EXPIRED,
          getKeyboard("main")
        );
        return;
      }

      orderData.waitingForProof = true;
      orderData.paymentMethod = PAYMENT_DETAILS[method];
      sessions.pendingOrders.set(chatId, orderData);

      await safeEditMessage(
        chatId,
        messageId,
        `Silakan transfer sejumlah *Rp${formatCurrency(orderData.total)}* ke:

\`\`\`
${PAYMENT_DETAILS[method]}
\`\`\`

Setelah selesai, silakan *kirim foto bukti transfer* Anda di sini.`,
        { parse_mode: "Markdown" }
      );
      return;
    }
  }

  // Execute menu action if exists
  if (menuActions[action]) {
    await menuActions[action]();
    return;
  }

  // Ignore action (for separator buttons)
  if (action === "ignore") return;

  // Fallback for unknown actions
  if (chatId.toString() !== CONFIG.ADMIN_CHAT_ID?.toString()) {
    await safeSendMessage(
      chatId,
      "Maaf, tombol ini tidak dikenali. Silakan gunakan menu:",
      getKeyboard("main")
    );
  }
});

// =============================
// PHOTO HANDLER (Proof of Payment)
// =============================
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  const orderData = sessions.pendingOrders.get(chatId);

  if (!orderData?.waitingForProof) {
    await safeSendMessage(
      chatId,
      "Maaf, saya tidak mengerti mengapa Anda mengirim foto. Silakan gunakan menu."
    );
    return;
  }

  const {
    paymentMethod,
    contactText,
    details,
    total,
    deliveryFee,
    deliveryMethod,
  } = orderData;
  const photoFileId = msg.photo[msg.photo.length - 1].file_id;

  await safeSendMessage(
    chatId,
    "✅ Bukti transfer diterima! Pesanan Anda akan segera divalidasi oleh Admin."
  );

  // Simpan semua data order untuk konfirmasi admin
  const completeOrderData = {
    ...orderData,
    photoFileId: photoFileId,
    chatId: chatId, // Pastikan chatId tersimpan
  };

  // Pindahkan dari pendingOrders ke ordersAwaitingConfirmation
  sessions.ordersAwaitingConfirmation.set(chatId, completeOrderData);
  sessions.pendingOrders.delete(chatId);

  console.log(`📸 Bukti transfer diterima dari chatId: ${chatId}`);
  console.log(
    `💾 Data disimpan di ordersAwaitingConfirmation:`,
    completeOrderData
  );

  // Send to admin for confirmation
  if (CONFIG.ADMIN_CHAT_ID) {
    const parts = contactText.split(";");
    const nama = parts[0]?.trim() || "[Nama Tdk Ada]";
    const hp = parts[1]?.trim() || "[HP Tdk Ada]";
    const originalTotal = total - (deliveryFee || 0);

    // Escape nomor telepon dan chat ID agar tidak jadi link di Telegram
    const escapedHp = hp.replace(/(\d)/g, "$1\u200B"); // Zero-width space
    const escapedChatId = chatId.toString().replace(/(\d)/g, "$1\u200B");

    const adminCaption = `🔔 *Permintaan Konfirmasi Pembayaran* 🔔
----------------------
Dari: ${nama} (${escapedHp})
Chat ID: ${escapedChatId}
Total: *Rp${formatCurrency(total)}*
Metode: ${paymentMethod}

Pesanan:
\`\`\`
${details}
\`\`\`
Subtotal: Rp${formatCurrency(originalTotal)}
Pengiriman: ${deliveryMethod || "Ambil Sendiri"}`;

    const adminKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Konfirmasi", callback_data: `admin_confirm_${chatId}` },
            { text: "❌ Tolak", callback_data: `admin_reject_${chatId}` },
          ],
        ],
      },
    };

    try {
      await bot.sendPhoto(CONFIG.ADMIN_CHAT_ID, photoFileId, {
        caption: adminCaption,
        parse_mode: "Markdown",
        ...adminKeyboard,
      });
      console.log(`📤 Notifikasi dikirim ke admin untuk chatId: ${chatId}`);
    } catch (error) {
      console.error("Failed to send proof to admin:", error);
      await safeSendMessage(
        CONFIG.ADMIN_CHAT_ID,
        `Gagal menerima foto bukti transfer dari chat ID ${chatId}. Error: ${error.message}`
      );
    }
  }
});

// =============================
// TEXT HANDLER (Fallback)
// =============================
bot.on("text", (msg) => {
  if (msg.text?.startsWith("/start")) return;

  const chatId = msg.chat.id;

  // Ignore admin messages
  if (chatId.toString() === CONFIG.ADMIN_CHAT_ID?.toString()) return;

  // Check if waiting for contact input
  if (sessions.activeListeners.has(chatId)) return;

  // Check if waiting for payment proof
  if (sessions.pendingOrders.get(chatId)?.waitingForProof) {
    safeSendMessage(
      chatId,
      "Saya sedang menunggu *foto* bukti transfer Anda. 📸",
      {
        parse_mode: "Markdown",
      }
    );
    return;
  }

  // Check if waiting for admin confirmation
  if (sessions.ordersAwaitingConfirmation.has(chatId)) {
    safeSendMessage(
      chatId,
      "Pesanan Anda sedang divalidasi oleh Admin. Mohon ditunggu ya... 🙏"
    );
    return;
  }

  // Check if user has active cart
  const hasActiveCart =
    sessions.serviceCarts.has(chatId) || sessions.productCarts.has(chatId);
  if (hasActiveCart) return;

  // Fallback message
  safeSendMessage(
    chatId,
    "Maaf, saya belum paham maksud kamu 😅\nSilakan pilih menu berikut:",
    getKeyboard("main")
  );
});

// =============================
// ERROR HANDLER
// =============================
bot.on("polling_error", (error) => {
  console.error("Polling error:", error.code, error.message);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
});

// =============================
// GRACEFUL SHUTDOWN
// =============================
const gracefulShutdown = () => {
  console.log("\n🛑 Shutting down gracefully...");

  // Clear all timers
  sessions.sessionTimers.forEach((timer) => clearTimeout(timer));
  sessions.sessionTimers.clear();

  // Remove all listeners
  sessions.activeListeners.forEach((listener, chatId) => {
    bot.removeListener("text", listener);
  });
  sessions.activeListeners.clear();

  // Stop polling
  bot.stopPolling();

  console.log("✅ Bot stopped successfully");
  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// =============================
// STARTUP
// =============================
console.log("🤖 GABE LAUNDRY BOT (OPTIMIZED) Sedang berjalan...");
console.log(
  `📊 Config: Session timeout ${
    CONFIG.SESSION_TIMEOUT / 1000
  }s, Max cart items: ${CONFIG.MAX_CART_ITEMS}`
);
console.log(`👤 Admin Chat ID: ${CONFIG.ADMIN_CHAT_ID || "Not set"}`);
console.log("✅ Bot ready to receive messages!\n");
