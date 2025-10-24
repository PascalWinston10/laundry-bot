// =============================
// GABE LAUNDRY BOT 🧺
// Telegram Bot Version
// =============================

require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");

// === TOKEN DIAMBIL DARI .env ===
const token = process.env.TELEGRAM_TOKEN;

// Cek apakah token berhasil dimuat
if (!token) {
  console.error("Error: Token Telegram tidak ditemukan!");
  console.log(
    "Pastikan Anda sudah membuat file .env dan mengisinya dengan TELEGRAM_TOKEN=..."
  );
  process.exit(1); // Hentikan bot jika token tidak ada
}

// Jalankan bot dengan polling
const bot = new TelegramBot(token, { polling: true });

// Objek untuk menyimpan keranjang belanja (dipisah)
let serviceCarts = {}; // Untuk jasa laundry
let productCarts = {}; // Untuk produk

// Objek untuk menyimpan order yang menunggu konfirmasi checkout (Bisa dipakai bersama)
let pendingOrders = {};

// Keyboard untuk konfirmasi checkout
const checkoutKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "✅ Lanjut Checkout", callback_data: "checkout_confirm" },
        { text: "❌ Batal", callback_data: "checkout_cancel" },
      ],
    ],
  },
};

// Keyboard untuk konfirmasi data kontak
const contactConfirmKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "✅ Data Benar", callback_data: "contact_confirm_yes" },
        { text: "✏️ Ulangi Data", callback_data: "contact_confirm_no" },
      ],
    ],
  },
};

// =============================
// Data Layanan & Produk
// =============================
const jasaLaundry = {
  // Nama Jasa (harus unik): { price: HARGA, unit: 'kg' atau 'pcs' }
  "Cuci Setrika": { price: 7000, unit: "kg" },
  "Cuci Kering": { price: 5000, unit: "kg" },
  "Setrika Saja": { price: 4000, unit: "kg" },
  Sepatu: { price: 25000, unit: "pcs" },
  "Boneka Besar": { price: 20000, unit: "pcs" },
};

const productsData = {
  "Pewangi Mawar 1L": { price: 15000, unit: "pcs" },
  "Deterjen Cair 1L": { price: 20000, unit: "pcs" },
  "Pelembut Pakaian 1L": { price: 18000, unit: "pcs" },
};

// =============================
// Inline Keyboard Menu Utama (Navigasi)
// =============================
const mainMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "🧺 Order Layanan Jasa", callback_data: "nav_services" }],
      [{ text: "🧴 Beli Produk", callback_data: "nav_products" }],
      [{ text: "📍 Info Lokasi & Jam Buka", callback_data: "info_lokasi" }],
      [{ text: "📞 Hubungi Admin", callback_data: "hubungi_admin" }],
    ],
  },
};

// =============================
// Keyboard Menu Layanan
// =============================
const servicesMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "👔 Daftar Layanan & Harga", callback_data: "lihat_layanan" }],
      [{ text: "🧺 Order Laundry", callback_data: "order_laundry" }],
      [{ text: "« Kembali ke Menu Utama", callback_data: "menu_utama" }],
    ],
  },
};

// =============================
// Keyboard Menu Produk
// =============================
const productsMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "👕 Daftar Produk & Harga", callback_data: "lihat_produk" }],
      [{ text: "🛒 Order Produk", callback_data: "order_produk" }],
      [{ text: "« Kembali ke Menu Utama", callback_data: "menu_utama" }],
    ],
  },
};

// =============================
// Fungsi untuk meminta data kontak
// =============================
async function askForContactInfo(chatId) {
  try {
    await bot.sendMessage(
      chatId,
      `
Silakan kirim *Nama*, *Nomor HP*, dan *Alamat Jemput*.

*Mohon kirim dalam 1 pesan, dengan setiap data di baris baru (tekan Enter).*

Contoh:
Joni
08123456789
Jl. Mawar No. 1, Serpong
    `,
      { parse_mode: "Markdown" }
    );

    bot.once("text", async (contact) => {
      if (contact.text === "/start") {
        sendStartMessage(chatId);
        return;
      }
      if (!pendingOrders[chatId]) {
        console.error("Order tidak ditemukan saat handle contact text");
        await bot.sendMessage(
          chatId,
          "Maaf, order Anda sepertinya kedaluwarsa.",
          mainMenu
        );
        return;
      }
      pendingOrders[chatId].contactText = contact.text;
      const lines = contact.text.split("\n");
      const nama = lines[0] || "[Belum diisi]";
      const hp = lines[1] || "[Belum diisi]";
      const alamat = lines.slice(2).join("\n") || "[Belum diisi]";

      await bot.sendMessage(
        chatId,
        `
Mohon periksa kembali data Anda:

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

Apakah data di atas sudah benar?
        `,
        { parse_mode: "Markdown", ...contactConfirmKeyboard }
      );
    });
  } catch (err) {
    console.error("Error di askForContactInfo:", err);
    await bot.sendMessage(
      chatId,
      "Waduh, ada error. Coba ulangi checkout.",
      mainMenu
    );
  }
}

// =============================
// Bagian Fungsi Order LAYANAN JASA
// =============================

function buildServicesKeyboard(chatId) {
  const keyboard = [];
  const cart = serviceCarts[chatId];

  for (const serviceName in jasaLaundry) {
    const safeServiceName = serviceName.replace(/ /g, "-");
    keyboard.push([
      {
        text: `👕 ${serviceName}`,
        callback_data: `order_select_${safeServiceName}`,
      },
    ]);
  }

  if (cart && cart.items.length > 0) {
    keyboard.push([
      {
        text: "✅ Selesai & Checkout",
        callback_data: "order_checkout",
      },
    ]);
  }

  keyboard.push([
    { text: "❌ Batal Order & Kembali", callback_data: "order_cancel" },
  ]);

  return { reply_markup: { inline_keyboard: keyboard } };
}

async function showServiceQuantitySelector(
  chatId,
  serviceName,
  currentQuantity,
  messageId
) {
  const service = jasaLaundry[serviceName];
  if (!service) {
    console.error("Layanan tidak ditemukan:", serviceName);
    return;
  }

  const unit = service.unit;
  let qty = currentQuantity;
  const safeServiceName = serviceName.replace(/ /g, "-");

  let text = `🧺 Pilih jumlah untuk *${serviceName}*:\n\n*Jumlah Saat Ini: ${qty} ${unit}*`;
  let keyboard = [];
  let row1 = [];
  let row2 = [];

  if (unit === "kg") {
    row1.push({
      text: "+0.5 kg",
      callback_data: `qty_update_${safeServiceName}_${qty + 0.5}`,
    });
    row1.push({
      text: "+1 kg",
      callback_data: `qty_update_${safeServiceName}_${qty + 1}`,
    });
    if (qty >= 0.5) {
      row2.push({
        text: "-0.5 kg",
        callback_data: `qty_update_${safeServiceName}_${Math.max(
          0,
          qty - 0.5
        )}`,
      });
    }
    if (qty >= 1) {
      row2.push({
        text: "-1 kg",
        callback_data: `qty_update_${safeServiceName}_${Math.max(0, qty - 1)}`,
      });
    }
  } else {
    // unit === 'pcs'
    row1.push({
      text: "+1 pcs",
      callback_data: `qty_update_${safeServiceName}_${qty + 1}`,
    });
    row1.push({
      text: "+5 pcs",
      callback_data: `qty_update_${safeServiceName}_${qty + 5}`,
    });
    if (qty >= 1) {
      row2.push({
        text: "-1 pcs",
        callback_data: `qty_update_${safeServiceName}_${Math.max(0, qty - 1)}`,
      });
    }
    if (qty >= 5) {
      row2.push({
        text: "-5 pcs",
        callback_data: `qty_update_${safeServiceName}_${Math.max(0, qty - 5)}`,
      });
    }
  }

  keyboard.push(row1);
  if (row2.length > 0) keyboard.push(row2);

  if (qty > 0) {
    keyboard.push([
      {
        text: `✅ Konfirmasi ${qty} ${unit}`,
        callback_data: `qty_confirm_${safeServiceName}_${qty}`,
      },
    ]);
  }

  keyboard.push([
    { text: "⬅️ Kembali ke Menu Layanan", callback_data: "order_cancel_item" },
  ]);

  const keyboardMarkup = { reply_markup: { inline_keyboard: keyboard } };

  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      ...keyboardMarkup,
    });
  } catch (e) {
    if (!e.message.includes("message is not modified")) {
      console.error("Error di showServiceQuantitySelector:", e.message);
    }
  }
}

async function showServiceOrderMenu(chatId, messagePrefix = "") {
  if (!serviceCarts[chatId]) {
    serviceCarts[chatId] = { items: [], messageId: null };
  }
  const cart = serviceCarts[chatId];

  let text = messagePrefix ? `${messagePrefix}\n\n` : "";
  text += "🛒 *Keranjang Layanan Anda Saat Ini:*\n";

  if (cart.items.length === 0) {
    text += "  _(Kosong)_\n";
  } else {
    let total = 0;
    for (const item of cart.items) {
      const subtotal = item.price * item.quantity;
      total += subtotal;
      text += `  - ${item.name} (${item.quantity} ${
        item.unit
      }) = Rp${subtotal.toLocaleString("id-ID")}\n`;
    }
    text += `\n*Total Estimasi: Rp${total.toLocaleString("id-ID")}*`;
  }
  text += "\n\nSilakan pilih layanan untuk ditambahkan ke keranjang:";

  const keyboard = buildServicesKeyboard(chatId);

  try {
    if (cart.messageId) {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: cart.messageId,
        parse_mode: "Markdown",
        ...keyboard,
      });
    } else {
      const sentMessage = await bot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        ...keyboard,
      });
      cart.messageId = sentMessage.message_id;
    }
  } catch (error) {
    console.error("Error di showServiceOrderMenu:", error.message);
    if (
      error.message.includes("message to edit not found") ||
      error.message.includes("message is not modified")
    ) {
      if (
        cart.messageId &&
        !error.message.includes("message is not modified")
      ) {
        try {
          await bot.deleteMessage(chatId, cart.messageId);
        } catch (e) {}
      }
      const sentMessage = await bot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        ...keyboard,
      });
      cart.messageId = sentMessage.message_id;
    }
  }
}

// =============================
// Bagian Fungsi Order PRODUK
// =============================

function buildProductsKeyboard(chatId) {
  const keyboard = [];
  const cart = productCarts[chatId];

  for (const productName in productsData) {
    const safeProductName = productName.replace(/ /g, "-");
    keyboard.push([
      {
        text: `🧴 ${productName}`,
        callback_data: `product_select_${safeProductName}`,
      },
    ]);
  }

  if (cart && cart.items.length > 0) {
    keyboard.push([
      {
        text: "✅ Selesai & Checkout Produk",
        callback_data: "product_checkout",
      },
    ]);
  }

  keyboard.push([
    { text: "❌ Batal Order & Kembali", callback_data: "product_cancel" },
  ]);

  return { reply_markup: { inline_keyboard: keyboard } };
}

async function showProductQuantitySelector(
  chatId,
  productName,
  currentQuantity,
  messageId
) {
  const product = productsData[productName];
  if (!product) {
    console.error("Produk tidak ditemukan:", productName);
    return;
  }

  const unit = product.unit;
  let qty = currentQuantity;
  const safeProductName = productName.replace(/ /g, "-");

  let text = `🧴 Pilih jumlah untuk *${productName}*:\n\n*Jumlah Saat Ini: ${qty} ${unit}*`;
  let keyboard = [];
  let row1 = [];
  let row2 = [];

  row1.push({
    text: "+1 pcs",
    callback_data: `product_qty_update_${safeProductName}_${qty + 1}`,
  });
  row1.push({
    text: "+5 pcs",
    callback_data: `product_qty_update_${safeProductName}_${qty + 5}`,
  });
  if (qty >= 1) {
    row2.push({
      text: "-1 pcs",
      callback_data: `product_qty_update_${safeProductName}_${Math.max(
        0,
        qty - 1
      )}`,
    });
  }
  if (qty >= 5) {
    row2.push({
      text: "-5 pcs",
      callback_data: `product_qty_update_${safeProductName}_${Math.max(
        0,
        qty - 5
      )}`,
    });
  }

  keyboard.push(row1);
  if (row2.length > 0) keyboard.push(row2);

  if (qty > 0) {
    keyboard.push([
      {
        text: `✅ Konfirmasi ${qty} ${unit}`,
        callback_data: `product_qty_confirm_${safeProductName}_${qty}`,
      },
    ]);
  }

  keyboard.push([
    { text: "⬅️ Kembali ke Menu Produk", callback_data: "product_cancel_item" },
  ]);

  const keyboardMarkup = { reply_markup: { inline_keyboard: keyboard } };

  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      ...keyboardMarkup,
    });
  } catch (e) {
    if (!e.message.includes("message is not modified")) {
      console.error("Error di showProductQuantitySelector:", e.message);
    }
  }
}

async function showProductOrderMenu(chatId, messagePrefix = "") {
  if (!productCarts[chatId]) {
    productCarts[chatId] = { items: [], messageId: null };
  }
  const cart = productCarts[chatId];

  let text = messagePrefix ? `${messagePrefix}\n\n` : "";
  text += "🛒 *Keranjang Produk Anda Saat Ini:*\n";

  if (cart.items.length === 0) {
    text += "  _(Kosong)_\n";
  } else {
    let total = 0;
    for (const item of cart.items) {
      const subtotal = item.price * item.quantity;
      total += subtotal;
      text += `  - ${item.name} (${item.quantity} ${
        item.unit
      }) = Rp${subtotal.toLocaleString("id-ID")}\n`;
    }
    text += `\n*Total Estimasi: Rp${total.toLocaleString("id-ID")}*`;
  }
  text += "\n\nSilakan pilih produk untuk ditambahkan ke keranjang:";

  const keyboard = buildProductsKeyboard(chatId);

  try {
    if (cart.messageId) {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: cart.messageId,
        parse_mode: "Markdown",
        ...keyboard,
      });
    } else {
      const sentMessage = await bot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        ...keyboard,
      });
      cart.messageId = sentMessage.message_id;
    }
  } catch (error) {
    console.error("Error di showProductOrderMenu:", error.message);
    if (
      error.message.includes("message to edit not found") ||
      error.message.includes("message is not modified")
    ) {
      if (
        cart.messageId &&
        !error.message.includes("message is not modified")
      ) {
        try {
          await bot.deleteMessage(chatId, cart.messageId);
        } catch (e) {}
      }
      const sentMessage = await bot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        ...keyboard,
      });
      cart.messageId = sentMessage.message_id;
    }
  }
}

// =============================
// Teks /start (DIBUAT JADI FUNGSI)
// =============================
function sendStartMessage(chatId) {
  if (serviceCarts[chatId]) {
    delete serviceCarts[chatId];
  }
  if (productCarts[chatId]) {
    delete productCarts[chatId];
  }

  bot.sendMessage(
    chatId,
    `
🧺 Halo, selamat datang di Gabe Laundry!  
Saya LaundryBot, siap bantu kamu laundry pakaian bersih, wangi, dan rapi ✨

Silakan pilih menu di bawah ini:
  `,
    { parse_mode: "Markdown", ...mainMenu }
  );
}

// =============================
// COMMAND /START
// =============================
bot.onText(/\/start/, (msg) => {
  sendStartMessage(msg.chat.id);
});

// =============================
// HANDLER CALLBACK BUTTON (DIPERBARUI)
// =============================
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;
  const messageId = query.message.message_id;

  // ===================================
  // ALUR ORDER LAYANAN (SERVICES)
  // ===================================
  if (action.startsWith("order_select_")) {
    const safeServiceName = action.substring("order_select_".length);
    const serviceName = safeServiceName.replace(/-/g, " ");
    const service = jasaLaundry[serviceName];

    if (!service) {
      await bot.sendMessage(chatId, "Maaf, layanan itu tidak ditemukan.");
      return bot.answerCallbackQuery(query.id);
    }

    const defaultQty = 0;
    await showServiceQuantitySelector(
      chatId,
      serviceName,
      defaultQty,
      messageId
    );
    return bot.answerCallbackQuery(query.id);
  }

  if (action.startsWith("qty_update_")) {
    const parts = action.split("_");
    const quantity = parseFloat(parts[parts.length - 1]);
    const safeServiceName = parts.slice(2, -1).join("_");
    const serviceName = safeServiceName.replace(/-/g, " ");
    if (isNaN(quantity)) {
      console.error("Error parsing quantity dari callback:", action);
      return bot.answerCallbackQuery(query.id, { text: "Error jumlah!" });
    }
    await showServiceQuantitySelector(chatId, serviceName, quantity, messageId);
    return bot.answerCallbackQuery(query.id);
  }

  if (action.startsWith("qty_confirm_")) {
    const parts = action.split("_");
    const quantity = parseFloat(parts[parts.length - 1]);
    const safeServiceName = parts.slice(2, -1).join("_");
    const serviceName = safeServiceName.replace(/-/g, " ");
    const service = jasaLaundry[serviceName];

    if (!service || isNaN(quantity) || quantity <= 0) {
      await showServiceOrderMenu(chatId, `Jumlah tidak valid.`);
      return bot.answerCallbackQuery(query.id);
    }
    if (!serviceCarts[chatId]) {
      serviceCarts[chatId] = { items: [], messageId: messageId };
    } else {
      serviceCarts[chatId].messageId = messageId;
    }
    serviceCarts[chatId].items.push({
      name: serviceName,
      price: service.price,
      unit: service.unit,
      quantity: quantity,
    });
    await showServiceOrderMenu(
      chatId,
      `✅ ${quantity} ${service.unit} ${serviceName} berhasil ditambahkan!`
    );
    return bot.answerCallbackQuery(query.id);
  }

  if (action === "order_cancel_item") {
    await showServiceOrderMenu(chatId);
    return bot.answerCallbackQuery(query.id);
  }

  if (action === "order_checkout") {
    const cart = serviceCarts[chatId];
    if (!cart || cart.items.length === 0) {
      await bot.sendMessage(chatId, "Keranjang layanan Anda kosong.", mainMenu);
      return bot.answerCallbackQuery(query.id);
    }
    const total = calculateTotal(cart.items);
    const orderDetails = cart.items
      .map((item) => {
        const subtotal = item.price * item.quantity;
        return `  - ${item.name} x${item.quantity}${
          item.unit
        } = Rp${subtotal.toLocaleString("id-ID")}`;
      })
      .join("\n");

    pendingOrders[chatId] = {
      details: orderDetails,
      total: total,
    };
    try {
      if (cart.messageId) {
        await bot.deleteMessage(chatId, cart.messageId);
      }
    } catch (e) {
      console.error("Gagal hapus pesan menu:", e.message);
    }
    delete serviceCarts[chatId];

    await bot.sendMessage(
      chatId,
      `
✅ Order Layanan Kamu:
${orderDetails}

💰 Total Estimasi: Rp${total.toLocaleString("id-ID")}

*(Total final akan dikonfirmasi admin setelah penimbangan ulang di toko)*

Mau lanjut checkout?
  `,
      { parse_mode: "Markdown", ...checkoutKeyboard }
    );
    return bot.answerCallbackQuery(query.id);
  }

  if (action === "order_cancel") {
    try {
      if (serviceCarts[chatId]) {
        if (serviceCarts[chatId].messageId) {
          await bot.deleteMessage(chatId, serviceCarts[chatId].messageId);
        }
        delete serviceCarts[chatId];
      }
      await bot.sendMessage(chatId, "Order layanan dibatalkan.", mainMenu);
    } catch (e) {
      console.error("Gagal batalkan order:", e.message);
      sendStartMessage(chatId);
    }
    return bot.answerCallbackQuery(query.id);
  }

  // ===================================
  // ALUR ORDER PRODUK (PRODUCTS)
  // ===================================

  if (action.startsWith("product_select_")) {
    const safeProductName = action.substring("product_select_".length);
    const productName = safeProductName.replace(/-/g, " ");
    const product = productsData[productName];

    if (!product) {
      await bot.sendMessage(chatId, "Maaf, produk itu tidak ditemukan.");
      return bot.answerCallbackQuery(query.id);
    }

    const defaultQty = 0;
    await showProductQuantitySelector(
      chatId,
      productName,
      defaultQty,
      messageId
    );
    return bot.answerCallbackQuery(query.id);
  }

  if (action.startsWith("product_qty_update_")) {
    const parts = action.split("_");
    const quantity = parseFloat(parts[parts.length - 1]);
    const safeProductName = parts.slice(3, -1).join("_");
    const productName = safeProductName.replace(/-/g, " ");
    if (isNaN(quantity)) {
      console.error("Error parsing quantity dari callback:", action);
      return bot.answerCallbackQuery(query.id, { text: "Error jumlah!" });
    }
    await showProductQuantitySelector(chatId, productName, quantity, messageId);
    return bot.answerCallbackQuery(query.id);
  }

  if (action.startsWith("product_qty_confirm_")) {
    const parts = action.split("_");
    const quantity = parseFloat(parts[parts.length - 1]);
    const safeProductName = parts.slice(3, -1).join("_");
    const productName = safeProductName.replace(/-/g, " ");
    const product = productsData[productName];

    if (!product || isNaN(quantity) || quantity <= 0) {
      await showProductOrderMenu(chatId, `Jumlah tidak valid.`);
      return bot.answerCallbackQuery(query.id);
    }
    if (!productCarts[chatId]) {
      productCarts[chatId] = { items: [], messageId: messageId };
    } else {
      productCarts[chatId].messageId = messageId;
    }
    productCarts[chatId].items.push({
      name: productName,
      price: product.price,
      unit: product.unit,
      quantity: quantity,
    });
    await showProductOrderMenu(
      chatId,
      `✅ ${quantity} ${product.unit} ${productName} berhasil ditambahkan!`
    );
    return bot.answerCallbackQuery(query.id);
  }

  if (action === "product_cancel_item") {
    await showProductOrderMenu(chatId);
    return bot.answerCallbackQuery(query.id);
  }

  if (action === "product_checkout") {
    const cart = productCarts[chatId];
    if (!cart || cart.items.length === 0) {
      await bot.sendMessage(chatId, "Keranjang produk Anda kosong.", mainMenu);
      return bot.answerCallbackQuery(query.id);
    }
    const total = calculateTotal(cart.items);
    const orderDetails = cart.items
      .map((item) => {
        const subtotal = item.price * item.quantity;
        return `  - ${item.name} x${item.quantity}${
          item.unit
        } = Rp${subtotal.toLocaleString("id-ID")}`;
      })
      .join("\n");

    pendingOrders[chatId] = {
      details: orderDetails,
      total: total,
    };
    try {
      if (cart.messageId) {
        await bot.deleteMessage(chatId, cart.messageId);
      }
    } catch (e) {
      console.error("Gagal hapus pesan menu:", e.message);
    }
    delete productCarts[chatId];

    await bot.sendMessage(
      chatId,
      `
✅ Order Produk Kamu:
${orderDetails}

💰 Total Tagihan: Rp${total.toLocaleString("id-ID")}

*(Produk bisa diambil di kasir atau diantar bersama cucian)*

Mau lanjut checkout?
  `,
      { parse_mode: "Markdown", ...checkoutKeyboard }
    );
    return bot.answerCallbackQuery(query.id);
  }

  if (action === "product_cancel") {
    try {
      if (productCarts[chatId]) {
        if (productCarts[chatId].messageId) {
          await bot.deleteMessage(chatId, productCarts[chatId].messageId);
        }
        delete productCarts[chatId];
      }
      await bot.sendMessage(chatId, "Order produk dibatalkan.", mainMenu);
    } catch (e) {
      console.error("Gagal batalkan order:", e.message);
      sendStartMessage(chatId);
    }
    return bot.answerCallbackQuery(query.id);
  }

  // ===================================
  // HANDLER TOMBOL MENU UTAMA
  // ===================================
  try {
    switch (action) {
      // Tombol Navigasi
      case "nav_services":
        await bot.sendMessage(
          chatId,
          "Anda memilih *Layanan Jasa*. Silakan pilih:",
          {
            parse_mode: "Markdown",
            ...servicesMenu,
          }
        );
        break;
      case "nav_products":
        await bot.sendMessage(
          chatId,
          "Anda memilih *Beli Produk*. Silakan pilih:",
          {
            parse_mode: "Markdown",
            ...productsMenu,
          }
        );
        break;

      // === FLOW: KEMBALI KE MENU UTAMA ===
      case "menu_utama":
        sendStartMessage(chatId);
        break;

      // === FLOW LAYANAN ===
      case "lihat_layanan":
        let layananText = "👔 Daftar Layanan Kami:\n\n";
        for (const [namaJasa, detail] of Object.entries(jasaLaundry)) {
          const hargaString = detail.price.toLocaleString("id-ID");
          layananText += `👕 ${namaJasa} – Rp${hargaString} /${detail.unit}\n`;
        }
        layananText += `\nSilakan tekan "Order Sekarang" untuk mulai order.`;
        await bot.sendMessage(chatId, layananText, {
          parse_mode: "Markdown",
          ...servicesMenu,
        });
        break;
      case "order_laundry":
        await showServiceOrderMenu(
          chatId,
          "Selamat datang di menu order layanan!"
        );
        break;

      // FLOW PRODUK
      case "lihat_produk":
        let produkText = "🧴 Daftar Produk Kami:\n\n";
        for (const [namaProduk, detail] of Object.entries(productsData)) {
          const hargaString = detail.price.toLocaleString("id-ID");
          produkText += `👕 ${namaProduk} – Rp${hargaString} /${detail.unit}\n`;
        }
        produkText += `\nSilakan tekan "Order Produk" untuk mulai order.`;
        await bot.sendMessage(chatId, produkText, {
          parse_mode: "Markdown",
          ...productsMenu,
        });
        break;
      case "order_produk":
        await showProductOrderMenu(
          chatId,
          "Selamat datang di menu order produk!"
        );
        break;

      // ===================================
      // ALUR CHECKOUT (Generik)
      // ===================================

      // === FLOW 3.2: KONFIRMASI CHECKOUT (YA) ===
      case "checkout_confirm":
        if (!pendingOrders[chatId]) {
          await bot.sendMessage(
            chatId,
            "Maaf, order ini sudah kedaluwarsa atau selesai.",
            mainMenu
          );
          break;
        }
        await askForContactInfo(chatId);
        break;

      // === FLOW 3.3: BATALKAN CHECKOUT (TIDAK) ===
      case "checkout_cancel":
        if (!pendingOrders[chatId]) {
          await bot.sendMessage(
            chatId,
            "Maaf, order ini sudah kedaluwarsa atau dibatalkan.",
            mainMenu
          );
          break;
        }
        delete pendingOrders[chatId];
        try {
          await bot.sendMessage(
            chatId,
            "Baik, order dibatalkan. Silakan lihat layanan lain atau kembali ke menu utama.",
            mainMenu
          );
        } catch (err) {
          console.error("Error di 'checkout_cancel':", err);
        }
        break;

      // === FLOW 3.4: KONFIRMASI DATA KONTAK (BENAR) ===
      // (UBAH) Menambahkan detail pesanan
      case "contact_confirm_yes":
        if (!pendingOrders[chatId] || !pendingOrders[chatId].contactText) {
          await bot.sendMessage(
            chatId,
            "Maaf, order ini sudah kedaluwarsa.",
            mainMenu
          );
          break;
        }
        try {
          // (UBAH) Ambil semua data dari pendingOrders
          const orderData = pendingOrders[chatId];
          const contactText = orderData.contactText;
          const orderDetails = orderData.details;
          const total = orderData.total;

          if (!orderDetails || !total) {
            await bot.sendMessage(
              chatId,
              "Maaf, data order tidak lengkap. Coba lagi.",
              mainMenu
            );
            delete pendingOrders[chatId];
            break;
          }

          const lines = contactText.split("\n");
          const nama = lines[0] || "[Belum diisi]";
          const hp = lines[1] || "[Belum diisi]";
          const alamat = lines.slice(2).join("\n") || "[Belum diisi]";

          // ===========================================
          // (UBAH) PESAN KONFIRMASI DENGAN DETAIL PESANAN
          // ===========================================
          await bot.sendMessage(
            chatId,
            `
Terima kasih ${nama.split(" ")[0]}! 🙏  

Pesanan Anda telah kami catat. Admin kami akan segera menghubungi kamu.

Berikut adalah *ringkasan pesanan* Anda:
\`\`\`
${orderDetails}
\`\`\`
*Total Tagihan: Rp${total.toLocaleString("id-ID")}*

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
*Jika ada kendala atau pertanyaan terkait order ini, silakan hubungi admin:*
📞 0811-1222-3333
📧 admin@gabelaundry.com

🧺 Terima kasih sudah order di Gabe Laundry! 💚
        `,
            { parse_mode: "Markdown" }
          );
          // ===========================================
          // AKHIR DARI BAGIAN YANG DIMODIFIKASI
          // ===========================================

          delete pendingOrders[chatId];
          sendStartMessage(chatId);
        } catch (err) {
          console.error("Error di 'contact_confirm_yes':", err);
        }
        break;

      // === FLOW 3.5: KONFIRMASI DATA KONTAK (ULANGI) ===
      case "contact_confirm_no":
        if (!pendingOrders[chatId]) {
          await bot.sendMessage(
            chatId,
            "Maaf, order ini sudah kedaluwarsa.",
            mainMenu
          );
          break;
        }
        if (pendingOrders[chatId].contactText) {
          delete pendingOrders[chatId].contactText;
        }
        await bot.sendMessage(
          chatId,
          "Baik, silakan masukkan kembali data Anda dengan benar."
        );
        await askForContactInfo(chatId);
        break;

      // ===================================
      // ALUR INFO
      // ===================================

      // === FLOW 4: INFO LOKASI ===
      case "info_lokasi":
        await bot.sendMessage(
          chatId,
          `
🕒 Kami buka setiap hari pukul 08.00–20.00 WIB  
📍 Alamat: Jl. Cucian No. 1, Jakarta Bersih  
📌 Google Maps: [bit.ly/gabe-laundry](https://bit.ly/gabe-laundry) 
(Link Ganti Sesuai Lokasi Asli)
      `,
          { parse_mode: "Markdown", ...mainMenu }
        );
        break;

      // === FLOW 5: HUBUNGI ADMIN ===
      case "hubungi_admin":
        await bot.sendMessage(
          chatId,
          `
Untuk pertanyaan, komplain, atau laundry partai besar:
📞 0811-1222-3333  
📧 admin@gabelaundry.com

Kami siap membantu Anda! 🧺
      `,
          { parse_mode: "Markdown", ...mainMenu }
        );
        break;

      default:
        if (chatId) {
          fallback(chatId);
        }
    }
  } catch (error) {
    console.error("Error di dalam callback_query:", error);
    if (chatId) {
      bot.sendMessage(
        chatId,
        "Waduh, ada sedikit error di sistem kami. Coba lagi ya."
      );
    }
  }

  bot.answerCallbackQuery(query.id);
});

// =============================
// Fungsi Hitung Total (TETAP DIPAKAI)
// =============================
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// =============================
// FLOW 6: FALLBACK
// =============================
function fallback(chatId) {
  if (serviceCarts[chatId] || productCarts[chatId]) {
    return;
  }
  bot.sendMessage(
    chatId,
    `
Maaf, saya belum paham maksud kamu 😅  
Silakan pilih menu berikut:
  `,
    mainMenu
  );
}

// Global Text Handler untuk fallback
bot.on("text", (msg) => {
  if (msg.text.startsWith("/start")) {
    return;
  }

  const listeners = bot.listeners("text");
  let hasOnceListener = false;
  for (const listener of listeners) {
    if (listener.toString().includes("onceWrapper")) {
      hasOnceListener = true;
      break;
    }
  }

  if (!hasOnceListener) {
    fallback(msg.chatId);
  }
});

console.log("🤖 GABE LAUNDRY BOT Sedang berjalan...");
