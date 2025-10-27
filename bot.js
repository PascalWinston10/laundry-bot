// =============================
// GABE LAUNDRY BOT 🧺
// Telegram Bot Version
// =============================

require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");

// === TOKEN DIAMBIL DARI .env ===
const token = process.env.TELEGRAM_TOKEN;
// Ambil ID Admin dari .env
const adminChatId = process.env.ADMIN_CHAT_ID;

if (!token) {
  console.error("Error: Token Telegram tidak ditemukan!");
  console.log(
    "Pastikan Anda sudah membuat file .env dan mengisinya dengan TELEGRAM_TOKEN=..."
  );
  process.exit(1);
}
if (!adminChatId) {
  console.warn(
    "PERINGATAN: ADMIN_CHAT_ID tidak ditemukan di .env. Notifikasi admin tidak akan berfungsi."
  );
}

const bot = new TelegramBot(token, { polling: true });

// Objek untuk menyimpan keranjang belanja (dipisah)
let serviceCarts = {}; // Untuk jasa laundry
let productCarts = {}; // Untuk produk

// Objek untuk menyimpan order yang menunggu konfirmasi checkout
let pendingOrders = {};

// Objek untuk menyimpan order yang menunggu konfirmasi PEMBAYARAN oleh admin
let ordersAwaitingConfirmation = {};

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

// Data Akun Pembayaran (Silakan diganti)
const paymentDetails = {
  bca: "BCA: 1234567890 (a/n Gabe Laundry)",
  mandiri: "Mandiri: 0987654321 (a/n Gabe Laundry)",
  bni: "BNI: 1122334455 (a/n Gabe Laundry)",
  gopay: "Gopay: 0811223344 (a/n Gabe Laundry)",
  ovo: "OVO: 0811223344 (a/n Gabe Laundry)",
  cod: "Bayar di Tempat (Cash on Delivery)",
};

// Data Biaya Antar-Jemput (Silakan diganti)
const deliveryFees = {
  antar_jemput: 10000,
  antar_saja: 5000,
  jemput_saja: 5000,
  ambil_sendiri: 0,
};

// Keyboard Pilihan Metode Pengantaran
const deliveryMethodMenu = {
  reply_markup: {
    inline_keyboard: [
      [
        {
          text: `🛵 Antar & Jemput (Rp${deliveryFees.antar_jemput.toLocaleString(
            "id-ID"
          )})`,
          callback_data: "delivery_antar_jemput",
        },
      ],
      [
        {
          text: `🚚 Antar Saja (Rp${deliveryFees.antar_saja.toLocaleString(
            "id-ID"
          )})`,
          callback_data: "delivery_antar_saja",
        },
      ],
      [
        {
          text: `🛍️ Jemput Saja (Rp${deliveryFees.jemput_saja.toLocaleString(
            "id-ID"
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
};

// Keyboard Pilihan Metode Pembayaran
const paymentMethodMenu = {
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
};

// Keyboard Pilihan Bank
const mbankingMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "BCA", callback_data: "payment_bca" }],
      [{ text: "Mandiri", callback_data: "payment_mandiri" }],
      [{ text: "BNI", callback_data: "payment_bni" }],
      [{ text: "« Kembali", callback_data: "payment_back_to_main" }],
    ],
  },
};

// Keyboard Pilihan E-Wallet
const ewalletMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "Gopay", callback_data: "payment_gopay" }],
      [{ text: "OVO", callback_data: "payment_ovo" }],
      [{ text: "« Kembali", callback_data: "payment_back_to_main" }],
    ],
  },
};

// =============================
// Data Layanan & Produk
// =============================
const jasaLaundry = {
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

const productsData = {
  "Deterjen Bubuk 650Gr": { price: 25000, unit: "pcs" },
  "Deterjen Cair 1L": { price: 20000, unit: "pcs" },
  "Pelembut Pakaian 1L": { price: 18000, unit: "pcs" },
  "Pewangi Pakaian (Mawar/Melati/Sakura) 1L": { price: 50000, unit: "pcs" },
};

// =============================
// Keyboard Menu Utama (Navigasi)
// =============================
const mainMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "🧺 Order Layanan Jasa", callback_data: "order_laundry" }],
      [{ text: "🧴 Beli Produk", callback_data: "order_produk" }],
      [{ text: "📍 Info Lokasi & Jam Buka", callback_data: "info_lokasi" }],
      [{ text: "📞 Hubungi Admin", callback_data: "hubungi_admin" }],
    ],
  },
};

// =============================
// Keyboard Menu Layanan (Dipanggil dari /start)
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
// Keyboard Menu Produk (Dipanggil dari /start)
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
// Fungsi untuk meminta data kontak (dengan validasi)
// =============================
async function askForContactInfo(chatId) {
  try {
    const orderData = pendingOrders[chatId];
    let totalText = "";
    if (orderData && typeof orderData.total !== "undefined") {
      totalText = `\n*Total Tagihan Anda (termasuk ongkir): Rp${orderData.total.toLocaleString(
        "id-ID"
      )}*`;
    }

    await bot.sendMessage(
      chatId,
      `
${totalText}

Silakan kirim *Nama*, *Nomor HP*, dan *Alamat Jemput* dalam 1 baris.

*Gunakan tanda titik-koma (;) sebagai pemisah.* Pastikan ada *3 bagian* terpisah.

Contoh:
Joni; 08123456789; Jl. Mawar No. 1, Serpong
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

      // Validasi Input
      const parts = contact.text.split(";");
      if (parts.length !== 3) {
        await bot.sendMessage(
          chatId,
          "Format salah. Pastikan Anda memasukkan Nama; Nomor HP; Alamat (3 bagian dipisah titik-koma). Silakan coba lagi."
        );
        askForContactInfo(chatId); // Minta ulang
        return;
      }

      const nama = parts[0] ? parts[0].trim() : "";
      const hp = parts[1] ? parts[1].trim() : "";
      const alamat = parts[2] ? parts[2].trim() : "";

      if (!nama || !alamat) {
        await bot.sendMessage(
          chatId,
          "Nama dan Alamat tidak boleh kosong. Silakan coba lagi."
        );
        askForContactInfo(chatId); // Minta ulang
        return;
      }
      if (!/^\+?\d{7,}$/.test(hp.replace(/\s|-/g, ""))) {
        await bot.sendMessage(
          chatId,
          "Nomor HP tidak valid (minimal 7 digit angka). Silakan coba lagi."
        );
        askForContactInfo(chatId); // Minta ulang
        return;
      }

      // Simpan jika valid
      pendingOrders[chatId].contactText = contact.text;

      // Tampilkan konfirmasi
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
// Bagian Fungsi Order LAYANAN JASA (Dengan Hapus Item)
// =============================

function buildServicesKeyboard(chatId) {
  const keyboard = [];
  const serviceCart = serviceCarts[chatId];
  const productCart = productCarts[chatId];

  if (serviceCart && serviceCart.items.length > 0) {
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

  for (const serviceName in jasaLaundry) {
    const safeServiceName = serviceName.replace(/ /g, "-").replace(/\//g, "_"); // Ganti / juga
    keyboard.push([
      {
        text: `👕 ${serviceName}`,
        callback_data: `order_select_${safeServiceName}`,
      },
    ]);
  }

  keyboard.push([
    { text: "🧴 Tambah/Lihat Produk", callback_data: "cart_nav_products" },
  ]);

  const hasServiceItems = serviceCart && serviceCart.items.length > 0;
  const hasProductItems = productCart && productCart.items.length > 0;

  if (hasServiceItems || hasProductItems) {
    keyboard.push([
      {
        text: "✅ Checkout Sekarang (Gabungan)",
        callback_data: "cart_checkout",
      },
    ]);
  }

  keyboard.push([
    {
      text: "❌ Batalkan Semua & Kembali",
      callback_data: "cart_cancel_all",
    },
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
  const safeServiceName = serviceName.replace(/ /g, "-").replace(/\//g, "_"); // Ganti / juga

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
    {
      text: "⬅️ Kembali ke Menu Layanan",
      callback_data: "service_item_cancel",
    },
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
  if (!productCarts[chatId]) {
    productCarts[chatId] = { items: [], messageId: null };
  }

  const serviceCart = serviceCarts[chatId];
  const productCart = productCarts[chatId];

  let text = messagePrefix ? `${messagePrefix}\n\n` : "";
  text += "🛒 *Keranjang Layanan Anda Saat Ini:*\n";

  let serviceTotal = 0;
  if (serviceCart.items.length === 0) {
    text += "  _(Kosong)_\n";
  } else {
    serviceCart.items.forEach((item, index) => {
      const subtotal = item.price * item.quantity;
      serviceTotal += subtotal;
      text += `  ${index + 1}. ${item.name} (${item.quantity}${
        item.unit
      }) = Rp${subtotal.toLocaleString("id-ID")}\n`;
    });
  }

  const productTotal = productCart ? calculateTotal(productCart.items) : 0;
  const combinedTotal = serviceTotal + productTotal;

  text += `\n*Total Layanan: Rp${serviceTotal.toLocaleString("id-ID")}*`;
  if (productTotal > 0) {
    text += `\n*Total Produk: Rp${productTotal.toLocaleString("id-ID")}*`;
  }
  text += `\n*💰 Total Keseluruhan: Rp${combinedTotal.toLocaleString(
    "id-ID"
  )}*`;

  text += "\n\nSilakan pilih layanan untuk ditambahkan/dihapus:";

  const keyboard = buildServicesKeyboard(chatId);
  const messageIdToUse = serviceCart.messageId || productCart.messageId;

  try {
    if (messageIdToUse) {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageIdToUse,
        parse_mode: "Markdown",
        ...keyboard,
      });
      serviceCart.messageId = messageIdToUse;
      productCart.messageId = messageIdToUse;
    } else {
      const sentMessage = await bot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        ...keyboard,
      });
      serviceCart.messageId = sentMessage.message_id;
      productCart.messageId = sentMessage.message_id;
    }
  } catch (error) {
    console.error("Error di showServiceOrderMenu:", error.message);
    if (
      error.code === "ETELEGRAM" &&
      error.message.includes("message is not modified")
    ) {
      // Abaikan
    } else if (
      error.code === "ETELEGRAM" &&
      error.message.includes("message to edit not found")
    ) {
      console.log("Pesan lama tidak ditemukan, mengirim pesan baru.");
      const sentMessage = await bot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        ...keyboard,
      });
      if (serviceCarts[chatId])
        serviceCarts[chatId].messageId = sentMessage.message_id;
      if (productCarts[chatId])
        productCarts[chatId].messageId = sentMessage.message_id;
    } else {
      try {
        const sentMessage = await bot.sendMessage(chatId, text, {
          parse_mode: "Markdown",
          ...keyboard,
        });
        if (serviceCarts[chatId])
          serviceCarts[chatId].messageId = sentMessage.message_id;
        if (productCarts[chatId])
          productCarts[chatId].messageId = sentMessage.message_id;
      } catch (fallbackError) {
        console.error("Error saat mengirim pesan fallback:", fallbackError);
      }
    }
  }
}

// =============================
// Bagian Fungsi Order PRODUK (Dengan Hapus Item & Index Callback)
// =============================

function buildProductsKeyboard(chatId) {
  const keyboard = [];
  const serviceCart = serviceCarts[chatId];
  const productCart = productCarts[chatId];

  if (productCart && productCart.items.length > 0) {
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

  // Gunakan Object.keys untuk mendapatkan array nama produk
  // lalu gunakan forEach untuk mendapatkan indeksnya
  const productNames = Object.keys(productsData);
  productNames.forEach((productName, index) => {
    // Callback data sekarang menggunakan indeks: 'product_select_0', 'product_select_1', dst.
    keyboard.push([
      {
        text: `🧴 ${productName}`,
        callback_data: `product_select_${index}`, // Gunakan index
      },
    ]);
  });

  keyboard.push([
    {
      text: "🧺 Tambah/Lihat Layanan Jasa",
      callback_data: "cart_nav_services",
    },
  ]);

  const hasServiceItems = serviceCart && serviceCart.items.length > 0;
  const hasProductItems = productCart && productCart.items.length > 0;

  if (hasServiceItems || hasProductItems) {
    keyboard.push([
      {
        text: "✅ Checkout Sekarang (Gabungan)",
        callback_data: "cart_checkout",
      },
    ]);
  }

  keyboard.push([
    {
      text: "❌ Batalkan Semua & Kembali",
      callback_data: "cart_cancel_all",
    },
  ]);

  return { reply_markup: { inline_keyboard: keyboard } };
}

async function showProductQuantitySelector(
  chatId,
  productName, // Nama produk asli tetap dibutuhkan untuk teks
  productIndex, // Tambahkan parameter index
  currentQuantity,
  messageId
) {
  const product = productsData[productName];
  if (!product) {
    console.error("Produk tidak ditemukan saat show selector:", productName);
    await bot.sendMessage(
      chatId,
      `Maaf, terjadi kesalahan saat memilih produk: ${productName}`
    );
    await showProductOrderMenu(chatId); // Kembali ke menu produk
    return;
  }

  const unit = product.unit;
  let qty = currentQuantity;

  let text = `🧴 Pilih jumlah untuk *${productName}*:\n\n*Jumlah Saat Ini: ${qty} ${unit}*`;
  let keyboard = [];
  let row1 = [];
  let row2 = [];

  // Callback data sekarang menggunakan productIndex
  row1.push({
    text: "+1 pcs",
    callback_data: `product_qty_update_${productIndex}_${qty + 1}`, // Gunakan index
  });
  row1.push({
    text: "+5 pcs",
    callback_data: `product_qty_update_${productIndex}_${qty + 5}`, // Gunakan index
  });
  if (qty >= 1) {
    row2.push({
      text: "-1 pcs",
      callback_data: `product_qty_update_${productIndex}_${Math.max(
        0,
        qty - 1
      )}`, // Gunakan index
    });
  }
  if (qty >= 5) {
    row2.push({
      text: "-5 pcs",
      callback_data: `product_qty_update_${productIndex}_${Math.max(
        0,
        qty - 5
      )}`, // Gunakan index
    });
  }

  keyboard.push(row1);
  if (row2.length > 0) keyboard.push(row2);

  if (qty > 0) {
    keyboard.push([
      {
        text: `✅ Konfirmasi ${qty} ${unit}`,
        callback_data: `product_qty_confirm_${productIndex}_${qty}`, // Gunakan index
      },
    ]);
  }

  keyboard.push([
    {
      text: "⬅️ Kembali ke Menu Produk",
      callback_data: "product_item_cancel",
    },
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
    // Tangani error BUTTON_DATA_INVALID jika masih muncul saat mengedit
    else if (e.message.includes("BUTTON_DATA_INVALID")) {
      console.error(
        "BUTTON_DATA_INVALID saat edit di showProductQuantitySelector:",
        e.message
      );
      // Mungkin kirim pesan baru sebagai fallback
      try {
        await bot.sendMessage(chatId, text, {
          parse_mode: "Markdown",
          ...keyboardMarkup,
        });
        await bot.deleteMessage(chatId, messageId); // Hapus yang lama jika berhasil kirim baru
      } catch (sendErr) {
        console.error(
          "Gagal mengirim pesan fallback setelah BUTTON_DATA_INVALID:",
          sendErr
        );
      }
    }
  }
}

async function showProductOrderMenu(chatId, messagePrefix = "") {
  if (!serviceCarts[chatId]) {
    serviceCarts[chatId] = { items: [], messageId: null };
  }
  if (!productCarts[chatId]) {
    productCarts[chatId] = { items: [], messageId: null };
  }

  const serviceCart = serviceCarts[chatId];
  const productCart = productCarts[chatId];

  let text = messagePrefix ? `${messagePrefix}\n\n` : "";
  text += "🛒 *Keranjang Produk Anda Saat Ini:*\n";

  let productTotal = 0;
  if (productCart.items.length === 0) {
    text += "  _(Kosong)_\n";
  } else {
    productCart.items.forEach((item, index) => {
      const subtotal = item.price * item.quantity;
      productTotal += subtotal;
      text += `  ${index + 1}. ${item.name} (${item.quantity}${
        item.unit
      }) = Rp${subtotal.toLocaleString("id-ID")}\n`;
    });
  }

  const serviceTotal = serviceCart ? calculateTotal(serviceCart.items) : 0;
  const combinedTotal = serviceTotal + productTotal;

  text += `\n*Total Produk: Rp${productTotal.toLocaleString("id-ID")}*`;
  if (serviceTotal > 0) {
    text += `\n*Total Layanan: Rp${serviceTotal.toLocaleString("id-ID")}*`;
  }
  text += `\n*💰 Total Keseluruhan: Rp${combinedTotal.toLocaleString(
    "id-ID"
  )}*`;

  text += "\n\nSilakan pilih produk untuk ditambahkan/dihapus:";

  const keyboard = buildProductsKeyboard(chatId);
  const messageIdToUse = productCart.messageId || serviceCart.messageId;

  try {
    if (messageIdToUse) {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageIdToUse,
        parse_mode: "Markdown",
        ...keyboard,
      });
      // Pastikan kedua cart merujuk ke messageId yang sama jika salah satunya null
      if (serviceCarts[chatId]) serviceCarts[chatId].messageId = messageIdToUse;
      if (productCarts[chatId]) productCarts[chatId].messageId = messageIdToUse;
    } else {
      const sentMessage = await bot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        ...keyboard,
      });
      if (serviceCarts[chatId])
        serviceCarts[chatId].messageId = sentMessage.message_id;
      if (productCarts[chatId])
        productCarts[chatId].messageId = sentMessage.message_id;
    }
  } catch (error) {
    console.error("Error di showProductOrderMenu:", error.message);
    if (
      error.code === "ETELEGRAM" &&
      error.message.includes("message is not modified")
    ) {
      // Abaikan
    } else if (
      (error.code === "ETELEGRAM" &&
        error.message.includes("message to edit not found")) ||
      error.message.includes("message identifier is not specified") // Handle jika messageId somehow null
    ) {
      console.log(
        "Pesan lama tidak ditemukan atau ID tidak valid, mengirim pesan baru."
      );
      try {
        const sentMessage = await bot.sendMessage(chatId, text, {
          parse_mode: "Markdown",
          ...keyboard,
        });
        if (serviceCarts[chatId])
          serviceCarts[chatId].messageId = sentMessage.message_id;
        if (productCarts[chatId])
          productCarts[chatId].messageId = sentMessage.message_id;
      } catch (fallbackError) {
        console.error(
          "Error saat mengirim pesan fallback di showProductOrderMenu:",
          fallbackError
        );
      }
    } else {
      try {
        console.log(
          "Error lain di showProductOrderMenu, mengirim pesan baru sebagai fallback."
        );
        const sentMessage = await bot.sendMessage(chatId, text, {
          parse_mode: "Markdown",
          ...keyboard,
        });
        if (serviceCarts[chatId])
          serviceCarts[chatId].messageId = sentMessage.message_id;
        if (productCarts[chatId])
          productCarts[chatId].messageId = sentMessage.message_id;
      } catch (fallbackError) {
        console.error(
          "Error saat mengirim pesan fallback final di showProductOrderMenu:",
          fallbackError
        );
      }
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
// Fungsi Konfirmasi Akhir (Gabungan, Notif Admin)
// =============================
async function sendFinalConfirmationAndReset(chatId, paymentInfoText) {
  try {
    const orderData = pendingOrders[chatId];

    if (
      !orderData ||
      !orderData.contactText ||
      !orderData.details ||
      typeof orderData.total === "undefined"
    ) {
      console.error(
        `[sendFinalConfirmationAndReset] chatId: ${chatId}, Order data incomplete!`,
        JSON.stringify(orderData, null, 2)
      );
      await bot.sendMessage(
        chatId,
        "Maaf, terjadi kesalahan. Data order tidak lengkap. Silakan ulangi dari /start.",
        mainMenu
      );
      if (orderData) delete pendingOrders[chatId];
      return;
    }

    const {
      contactText,
      details: orderDetails,
      total,
      deliveryFee,
      deliveryMethod,
      isConfirmedPayment,
    } = orderData;
    const originalTotal = total - (deliveryFee || 0);

    const parts = contactText.split(";");
    const nama = parts[0] ? parts[0].trim() : "[Belum diisi]";
    const hp = parts[1] ? parts[1].trim() : "[Belum diisi]";
    const alamat = parts[2] ? parts[2].trim() : "[Belum diisi]";

    const adminTitle = isConfirmedPayment
      ? "✅ *Pembayaran Dikonfirmasi* ✅"
      : "🔔 *Pesanan Baru Diterima!* 🔔";

    const adminPaymentStatus = orderData.waitingForProof
      ? "(Menunggu Verifikasi Bukti)"
      : isConfirmedPayment
      ? "(TELAH DIKONFIRMASI)"
      : paymentInfoText === paymentDetails.cod
      ? "(Pesanan COD)"
      : "";

    const adminMessage = `
${adminTitle}

*Pelanggan:*
Nama: \`${nama}\`
HP: \`${hp}\`
Alamat: \`${alamat}\`

*Pesanan:*
\`\`\`
${orderDetails}
\`\`\`
Subtotal: Rp${originalTotal.toLocaleString("id-ID")}
Pengiriman: ${deliveryMethod || "Ambil Sendiri"}
*Total: Rp${total.toLocaleString("id-ID")}*

*Pembayaran:* \`${paymentInfoText}\` ${adminPaymentStatus}
`;

    let userIntroMessage;
    if (isConfirmedPayment) {
      userIntroMessage =
        "*Pembayaran Anda telah dikonfirmasi!* Pesanan Anda akan segera kami proses.";
    } else if (paymentInfoText === paymentDetails.cod) {
      userIntroMessage =
        "Pesanan (COD) Anda telah kami catat. Admin kami akan segera menghubungi kamu untuk konfirmasi penjemputan.";
    } else {
      userIntroMessage =
        "Pesanan Anda telah kami catat. Admin kami akan segera menghubungi kamu.";
    }

    let finalText = `
Terima kasih ${nama.split(" ")[0]}! 🙏

${userIntroMessage}

Berikut adalah *ringkasan pesanan* Anda:
\`\`\`
${orderDetails}
\`\`\`
Subtotal Pesanan: Rp${originalTotal.toLocaleString("id-ID")}
Biaya Antar/Jemput: Rp${(deliveryFee || 0).toLocaleString("id-ID")}
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
*Metode Pembayaran Dipilih:*
\`\`\`
${paymentInfoText}
\`\`\`
`;

    if (isConfirmedPayment) {
      finalText += `
*(Pembayaran Lunas Diterima)*
`;
    } else if (paymentInfoText !== paymentDetails.cod) {
      finalText += `
*(Silakan lakukan pembayaran dan kirim bukti transfer ke Admin kami)*
`;
    }

    finalText += `
---
*Jika ada kendala atau pertanyaan terkait order ini, silakan hubungi admin:*
📞 0811-1222-3333
📧 admin@gabelaundry.com

🧺 Terima kasih sudah order di Gabe Laundry! 💚
`;

    const backToStartKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "↩️ Kembali ke Menu Awal", callback_data: "menu_utama" }],
        ],
      },
    };

    await bot.sendMessage(chatId, finalText, {
      parse_mode: "Markdown",
      ...backToStartKeyboard,
    });

    if (adminChatId) {
      try {
        await bot.sendMessage(adminChatId, adminMessage, {
          parse_mode: "Markdown",
        });
      } catch (adminError) {
        console.error("Gagal mengirim notifikasi ke admin:", adminError);
      }
    }
  } catch (error) {
    console.error("Error di sendFinalConfirmationAndReset:", error);
    await bot.sendMessage(
      chatId,
      "Terjadi error saat mengirim konfirmasi akhir. Mohon hubungi admin."
    );
  } finally {
    if (pendingOrders[chatId]) {
      delete pendingOrders[chatId];
    }
  }
}

// =============================
// HANDLER CALLBACK BUTTON (DIPERBARUI DENGAN INDEX PRODUK)
// =============================
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;
  const messageId = query.message.message_id;

  bot.answerCallbackQuery(query.id);

  const isAdminAction =
    action.startsWith("admin_confirm_") || action.startsWith("admin_reject_");

  if (chatId.toString() === adminChatId.toString() && isAdminAction) {
    const parts = action.split("_");
    const decision = parts[1];
    const customerChatId = parts[2];

    const orderData = ordersAwaitingConfirmation[customerChatId];

    if (!orderData) {
      try {
        await bot.editMessageCaption(
          (query.message.caption || "") + // Tambahkan cek caption null
            "\n\n-- *STATUS: TIDAK DITEMUKAN (Mungkin sudah diproses)* --",
          {
            chat_id: adminChatId,
            message_id: messageId,
            parse_mode: "Markdown",
          }
        );
      } catch (e) {}
      return;
    }

    delete ordersAwaitingConfirmation[customerChatId];

    const paymentInfoText = orderData.paymentMethod;

    if (decision === "confirm") {
      try {
        await bot.editMessageCaption(
          (query.message.caption || "") + "\n\n-- *STATUS: ✅ DIKONFIRMASI* --",
          {
            chat_id: adminChatId,
            message_id: messageId,
            parse_mode: "Markdown",
          }
        );
      } catch (e) {
        console.error("Gagal edit caption admin (confirm):", e);
      }

      orderData.isConfirmedPayment = true;
      orderData.waitingForProof = false;
      pendingOrders[customerChatId] = orderData;

      await sendFinalConfirmationAndReset(customerChatId, paymentInfoText);
    } else if (decision === "reject") {
      try {
        await bot.editMessageCaption(
          (query.message.caption || "") + "\n\n-- *STATUS: ❌ DITOLAK* --",
          {
            chat_id: adminChatId,
            message_id: messageId,
            parse_mode: "Markdown",
          }
        );
      } catch (e) {
        console.error("Gagal edit caption admin (reject):", e);
      }

      try {
        await bot.sendMessage(
          customerChatId,
          `
❌ Maaf, pembayaran Anda ditolak oleh admin.

Total Tagihan: *Rp${orderData.total.toLocaleString("id-ID")}*
Metode: *${paymentInfoText}*

Silakan hubungi admin di 📞 0811-1222-3333 untuk klarifikasi.
Mohon jangan kirim ulang bukti transfer kecuali diminta.
          `,
          { parse_mode: "Markdown", ...mainMenu }
        );
      } catch (e) {
        console.error("Gagal kirim pesan penolakan ke user:", e);
      }
    }
    return;
  }

  // Handler Hapus Item
  if (action.startsWith("cart_remove_")) {
    const parts = action.split("_");
    const type = parts[2];
    const indexToRemove = parseInt(parts[3]);

    let cart;
    let updateFunction;
    let itemRemovedName = "Item";

    if (type === "service" && serviceCarts[chatId]) {
      cart = serviceCarts[chatId];
      updateFunction = showServiceOrderMenu;
    } else if (type === "product" && productCarts[chatId]) {
      cart = productCarts[chatId];
      updateFunction = showProductOrderMenu;
    }

    if (cart && cart.items && cart.items[indexToRemove]) {
      itemRemovedName = cart.items[indexToRemove].name;
      cart.items.splice(indexToRemove, 1);
      await updateFunction(
        chatId,
        `🗑️ ${itemRemovedName} dihapus dari keranjang.`
      );
    } else {
      console.warn(
        `Gagal menghapus item: type=${type}, index=${indexToRemove}, cart exists=${!!cart}`
      );
      if (updateFunction) await updateFunction(chatId, "Gagal menghapus item.");
    }
    return;
  }

  // Alur Order Layanan (Tetap sama, menggunakan safe name)
  if (action.startsWith("order_select_")) {
    const safeServiceName = action.substring("order_select_".length);
    const serviceName = safeServiceName.replace(/-/g, " ").replace(/_/g, "/");
    const service = jasaLaundry[serviceName];
    if (!service) {
      await bot.sendMessage(chatId, "Maaf, layanan itu tidak ditemukan.");
      return;
    }
    await showServiceQuantitySelector(chatId, serviceName, 0, messageId);
    return;
  }

  if (action.startsWith("qty_update_")) {
    const parts = action.split("_");
    const quantity = parseFloat(parts[parts.length - 1]);
    const safeServiceName = parts.slice(2, -1).join("_");
    const serviceName = safeServiceName.replace(/-/g, " ").replace(/_/g, "/");
    if (isNaN(quantity) || !jasaLaundry[serviceName]) {
      // Tambah cek serviceName valid
      console.error(
        "Error parsing quantity atau serviceName tidak valid (service update):",
        action
      );
      await showServiceOrderMenu(chatId, `Terjadi Kesalahan.`); // Kembali ke menu
      return;
    }
    await showServiceQuantitySelector(chatId, serviceName, quantity, messageId);
    return;
  }

  if (action.startsWith("qty_confirm_")) {
    const parts = action.split("_");
    const quantity = parseFloat(parts[parts.length - 1]);
    const safeServiceName = parts.slice(2, -1).join("_");
    const serviceName = safeServiceName.replace(/-/g, " ").replace(/_/g, "/");
    const service = jasaLaundry[serviceName];
    if (!service || isNaN(quantity) || quantity <= 0) {
      console.error(
        "Error service tidak valid atau qty (service confirm):",
        action
      );
      await showServiceOrderMenu(
        chatId,
        `Jumlah tidak valid atau service error.`
      );
      return;
    }
    if (!serviceCarts[chatId])
      serviceCarts[chatId] = { items: [], messageId: messageId };
    serviceCarts[chatId].messageId = messageId; // Update messageId
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
    return;
  }

  if (action === "service_item_cancel") {
    await showServiceOrderMenu(chatId);
    return;
  }

  // Alur Order Produk (Menggunakan Index)
  if (action.startsWith("product_select_")) {
    const productIndexStr = action.substring("product_select_".length);
    const productIndex = parseInt(productIndexStr);
    const productNames = Object.keys(productsData);

    if (
      isNaN(productIndex) ||
      productIndex < 0 ||
      productIndex >= productNames.length
    ) {
      console.error(
        `Indeks produk tidak valid dari callback: ${productIndexStr}`
      );
      await bot.sendMessage(chatId, `Maaf, produk tidak ditemukan.`);
      await showProductOrderMenu(chatId);
      return;
    }
    const productName = productNames[productIndex];
    const product = productsData[productName]; // Seharusnya selalu ada

    await showProductQuantitySelector(
      chatId,
      productName,
      productIndex,
      0,
      messageId
    );
    return;
  }

  if (action.startsWith("product_qty_update_")) {
    const parts = action.split("_");
    if (parts.length < 5) {
      // product_qty_update_INDEX_QTY -> min 5 parts
      console.error("Format callback product_qty_update_ tidak valid:", action);
      await showProductOrderMenu(chatId, `Terjadi Kesalahan.`);
      return;
    }
    const quantity = parseFloat(parts[parts.length - 1]);
    const productIndex = parseInt(parts[parts.length - 2]);
    const productNames = Object.keys(productsData);

    if (
      isNaN(quantity) ||
      isNaN(productIndex) ||
      productIndex < 0 ||
      productIndex >= productNames.length
    ) {
      console.error(
        "Error parsing quantity atau index (product update):",
        action
      );
      await bot.sendMessage(chatId, `Maaf, terjadi kesalahan.`);
      await showProductOrderMenu(chatId);
      return;
    }
    const productName = productNames[productIndex];

    await showProductQuantitySelector(
      chatId,
      productName,
      productIndex,
      quantity,
      messageId
    );
    return;
  }

  if (action.startsWith("product_qty_confirm_")) {
    const parts = action.split("_");
    if (parts.length < 5) {
      // product_qty_confirm_INDEX_QTY -> min 5 parts
      console.error(
        "Format callback product_qty_confirm_ tidak valid:",
        action
      );
      await showProductOrderMenu(chatId, `Terjadi Kesalahan.`);
      return;
    }
    const quantity = parseFloat(parts[parts.length - 1]);
    const productIndex = parseInt(parts[parts.length - 2]);
    const productNames = Object.keys(productsData);

    if (
      isNaN(quantity) ||
      isNaN(productIndex) ||
      productIndex < 0 ||
      productIndex >= productNames.length
    ) {
      console.error(`Indeks produk tidak valid saat konfirmasi qty: ${action}`);
      await showProductOrderMenu(chatId, `Produk error.`);
      return;
    }
    const productName = productNames[productIndex];
    const product = productsData[productName];

    if (!product || quantity <= 0) {
      // Cukup cek quantity > 0
      console.error(
        `Produk atau quantity tidak valid saat konfirmasi qty: ${productName}`,
        product,
        quantity
      );
      await showProductOrderMenu(
        chatId,
        `Jumlah tidak valid atau produk error.`
      );
      return;
    }
    if (!productCarts[chatId])
      productCarts[chatId] = { items: [], messageId: messageId };
    productCarts[chatId].messageId = messageId; // Update messageId
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
    return;
  }

  if (action === "product_item_cancel") {
    await showProductOrderMenu(chatId);
    return;
  }

  // Navigasi & Checkout
  if (action === "cart_nav_services") {
    await showServiceOrderMenu(chatId, "Pindah ke menu Layanan Jasa...");
    return;
  }
  if (action === "cart_nav_products") {
    await showProductOrderMenu(chatId, "Pindah ke menu Beli Produk...");
    return;
  }

  if (action === "cart_cancel_all") {
    try {
      // Coba hapus kedua messageId jika ada dan berbeda
      const msgIdSvc = serviceCarts[chatId]?.messageId;
      const msgIdProd = productCarts[chatId]?.messageId;
      if (msgIdSvc) {
        await bot
          .deleteMessage(chatId, msgIdSvc)
          .catch((e) => console.warn("Gagal hapus msg Svc:", e.message));
      }
      if (msgIdProd && msgIdProd !== msgIdSvc) {
        // Hanya hapus jika ada dan beda
        await bot
          .deleteMessage(chatId, msgIdProd)
          .catch((e) => console.warn("Gagal hapus msg Prod:", e.message));
      }
      delete serviceCarts[chatId];
      delete productCarts[chatId];
      await bot.sendMessage(chatId, "Semua pesanan dibatalkan.", mainMenu);
    } catch (e) {
      console.error("Error di cart_cancel_all:", e.message);
      // Tetap coba reset state
      delete serviceCarts[chatId];
      delete productCarts[chatId];
      sendStartMessage(chatId); // Kirim menu utama sebagai fallback
    }
    return;
  }

  if (action === "cart_checkout") {
    const serviceCart = serviceCarts[chatId];
    const productCart = productCarts[chatId];
    const hasServiceItems = serviceCart && serviceCart.items.length > 0;
    const hasProductItems = productCart && productCart.items.length > 0;

    if (!hasServiceItems && !hasProductItems) {
      await bot.sendMessage(chatId, "Keranjang Anda kosong.", mainMenu);
      return;
    }
    let orderDetails = "";
    let total = 0;

    if (hasServiceItems) {
      total += calculateTotal(serviceCart.items);
      orderDetails += "*Layanan Jasa:*\n";
      orderDetails += serviceCart.items
        .map(
          (item) =>
            `  - ${item.name} x${item.quantity}${item.unit} = Rp${(
              item.price * item.quantity
            ).toLocaleString("id-ID")}`
        )
        .join("\n");
    }
    if (hasProductItems) {
      total += calculateTotal(productCart.items);
      if (hasServiceItems) orderDetails += "\n\n";
      orderDetails += "*Produk:*\n";
      orderDetails += productCart.items
        .map(
          (item) =>
            `  - ${item.name} x${item.quantity}${item.unit} = Rp${(
              item.price * item.quantity
            ).toLocaleString("id-ID")}`
        )
        .join("\n");
    }

    pendingOrders[chatId] = { details: orderDetails, total: total };

    try {
      // Coba hapus kedua messageId jika ada dan berbeda
      const msgIdSvc = serviceCarts[chatId]?.messageId;
      const msgIdProd = productCarts[chatId]?.messageId;
      if (msgIdSvc) {
        await bot
          .deleteMessage(chatId, msgIdSvc)
          .catch((e) =>
            console.warn("Gagal hapus msg Svc (checkout):", e.message)
          );
      }
      if (msgIdProd && msgIdProd !== msgIdSvc) {
        // Hanya hapus jika ada dan beda
        await bot
          .deleteMessage(chatId, msgIdProd)
          .catch((e) =>
            console.warn("Gagal hapus msg Prod (checkout):", e.message)
          );
      }
    } catch (e) {
      console.error("Error saat menghapus pesan menu (checkout):", e.message);
    }

    delete serviceCarts[chatId];
    delete productCarts[chatId];

    await bot.sendMessage(
      chatId,
      `
✅ Order Gabungan Kamu:
${orderDetails}

💰 *Total Keseluruhan: Rp${total.toLocaleString("id-ID")}*

*(Total ini belum termasuk biaya antar/jemput)*

Mau lanjut checkout?
  `,
      { parse_mode: "Markdown", ...checkoutKeyboard }
    );
    return;
  }

  // Handler Menu Utama & Alur Checkout Lanjutan
  try {
    const handleDeliverySelection = async (chatId, messageId, feeKey) => {
      if (!pendingOrders[chatId]) {
        await bot.sendMessage(
          chatId,
          "Maaf, order Anda kedaluwarsa.",
          mainMenu
        );
        return;
      }
      const fee = deliveryFees[feeKey];
      const feeText = `${feeKey.replace(/_/g, " ")} (Rp${fee.toLocaleString(
        "id-ID"
      )})`;
      pendingOrders[chatId].total += fee;
      pendingOrders[chatId].deliveryFee = fee;
      pendingOrders[chatId].deliveryMethod = feeText;
      try {
        await bot.deleteMessage(chatId, messageId);
      } catch (e) {}
      await askForContactInfo(chatId);
    };

    const askForProof = async (chatId, messageId, paymentKey) => {
      const paymentInfoText = paymentDetails[paymentKey];
      if (!pendingOrders[chatId]) {
        await bot.sendMessage(
          chatId,
          "Maaf, order Anda kedaluwarsa.",
          mainMenu
        );
        return;
      }
      const total = pendingOrders[chatId].total;
      pendingOrders[chatId].waitingForProof = true;
      pendingOrders[chatId].paymentMethod = paymentInfoText;
      try {
        // Bungkus editMessageText dengan try-catch
        await bot.editMessageText(
          `Silakan transfer sejumlah *Rp${total.toLocaleString(
            "id-ID"
          )}* ke:\n\n\`\`\`\n${paymentInfoText}\n\`\`\`\n\nSetelah selesai, silakan *kirim foto bukti transfer* Anda di sini.`,
          { chat_id: chatId, message_id: messageId, parse_mode: "Markdown" }
        );
      } catch (e) {
        console.error(
          `Gagal edit pesan saat askForProof (${paymentKey}):`,
          e.message
        );
        // Fallback: Kirim pesan baru jika edit gagal
        await bot.sendMessage(
          chatId,
          `Silakan transfer sejumlah *Rp${total.toLocaleString(
            "id-ID"
          )}* ke:\n\n\`\`\`\n${paymentInfoText}\n\`\`\`\n\nSetelah selesai, silakan *kirim foto bukti transfer* Anda di sini.`,
          { parse_mode: "Markdown" }
        );
      }
    };

    // --- Sisa switch case disingkat ---
    switch (action) {
      case "nav_services":
        await bot.sendMessage(
          chatId,
          "Anda memilih *Layanan Jasa*. Silakan pilih:",
          { parse_mode: "Markdown", ...servicesMenu }
        );
        break;
      case "nav_products":
        await bot.sendMessage(
          chatId,
          "Anda memilih *Beli Produk*. Silakan pilih:",
          { parse_mode: "Markdown", ...productsMenu }
        );
        break;
      case "menu_utama":
        sendStartMessage(chatId);
        break; // Ini tetap perlu
      case "lihat_layanan": {
        let layananText = "👔 Daftar Layanan Kami:\n\n";
        Object.entries(jasaLaundry).forEach(([nama, detail]) => {
          layananText += `👕 ${nama} – Rp${detail.price.toLocaleString(
            "id-ID"
          )} /${detail.unit}\n`;
        });
        await bot.sendMessage(
          chatId,
          layananText + `\nSilakan tekan "Order Laundry" untuk mulai.`,
          { ...servicesMenu }
        );
        break;
      }
      case "order_laundry":
        await showServiceOrderMenu(chatId, "Selamat datang di menu order!");
        break;
      case "lihat_produk": {
        let produkText = "🧴 Daftar Produk Kami:\n\n";
        Object.entries(productsData).forEach(([nama, detail]) => {
          produkText += `🧴 ${nama} – Rp${detail.price.toLocaleString(
            "id-ID"
          )} /${detail.unit}\n`;
        });
        await bot.sendMessage(
          chatId,
          produkText + `\nSilakan tekan "Order Produk" untuk mulai.`,
          { ...productsMenu }
        );
        break;
      }
      case "order_produk":
        await showProductOrderMenu(
          chatId,
          "Selamat datang di menu order produk!"
        );
        break;
      case "checkout_confirm": {
        if (!pendingOrders[chatId]) {
          await bot.sendMessage(chatId, "Order kedaluwarsa.", mainMenu);
          break;
        }
        try {
          await bot.editMessageText(
            "Pilih *Metode Pengambilan & Pengantaran*:",
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: "Markdown",
              ...deliveryMethodMenu,
            }
          );
        } catch (e) {
          console.error("Gagal edit checkout_confirm:", e.message);
          await bot.sendMessage(
            chatId,
            "Pilih *Metode Pengambilan & Pengantaran*:",
            { parse_mode: "Markdown", ...deliveryMethodMenu }
          );
        }
        break;
      }
      case "delivery_antar_jemput":
        await handleDeliverySelection(chatId, messageId, "antar_jemput");
        break;
      case "delivery_antar_saja":
        await handleDeliverySelection(chatId, messageId, "antar_saja");
        break;
      case "delivery_jemput_saja":
        await handleDeliverySelection(chatId, messageId, "jemput_saja");
        break;
      case "delivery_ambil_sendiri":
        await handleDeliverySelection(chatId, messageId, "ambil_sendiri");
        break;
      case "checkout_cancel": {
        if (pendingOrders[chatId]) delete pendingOrders[chatId];
        try {
          await bot.deleteMessage(chatId, messageId);
        } catch (e) {}
        await bot.sendMessage(chatId, "Order dibatalkan.", mainMenu);
        break;
      }
      case "contact_confirm_yes": {
        if (!pendingOrders[chatId]?.contactText) {
          await bot.sendMessage(chatId, "Order kedaluwarsa.", mainMenu);
          break;
        }
        try {
          await bot.editMessageText(
            "Data kontak benar 👍\n\nPilih *metode pembayaran*:",
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: "Markdown",
              ...paymentMethodMenu,
            }
          );
        } catch (e) {
          console.error("Gagal edit contact_confirm_yes:", e.message);
          await bot.sendMessage(chatId, "Pilih *metode pembayaran*:", {
            parse_mode: "Markdown",
            ...paymentMethodMenu,
          });
        }
        break;
      }
      case "contact_confirm_no": {
        if (!pendingOrders[chatId]) {
          await bot.sendMessage(chatId, "Order kedaluwarsa.", mainMenu);
          break;
        }
        if (pendingOrders[chatId].deliveryFee) {
          pendingOrders[chatId].total -= pendingOrders[chatId].deliveryFee;
          delete pendingOrders[chatId].deliveryFee;
          delete pendingOrders[chatId].deliveryMethod;
        }
        if (pendingOrders[chatId].contactText)
          delete pendingOrders[chatId].contactText;
        try {
          await bot.deleteMessage(chatId, messageId);
        } catch (e) {}
        await bot.sendMessage(
          chatId,
          "Data direset. Pilih *Metode Pengambilan & Pengantaran*:",
          { parse_mode: "Markdown", ...deliveryMethodMenu }
        );
        break;
      }
      case "payment_mbanking":
        try {
          await bot.editMessageText("Pilih Bank:", {
            chat_id: chatId,
            message_id: messageId,
            ...mbankingMenu,
          });
        } catch (e) {
          console.error("Gagal edit payment_mbanking:", e.message);
          await bot.sendMessage(chatId, "Pilih Bank:", mbankingMenu);
        }
        break;
      case "payment_ewallet":
        try {
          await bot.editMessageText("Pilih E-Wallet:", {
            chat_id: chatId,
            message_id: messageId,
            ...ewalletMenu,
          });
        } catch (e) {
          console.error("Gagal edit payment_ewallet:", e.message);
          await bot.sendMessage(chatId, "Pilih E-Wallet:", ewalletMenu);
        }
        break;
      case "payment_back_to_main":
        try {
          await bot.editMessageText("Pilih *metode pembayaran*:", {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            ...paymentMethodMenu,
          });
        } catch (e) {
          console.error("Gagal edit payment_back_to_main:", e.message);
          await bot.sendMessage(chatId, "Pilih *metode pembayaran*:", {
            parse_mode: "Markdown",
            ...paymentMethodMenu,
          });
        }
        break;
      case "payment_back_to_contact": {
        if (!pendingOrders[chatId]) {
          await bot.sendMessage(chatId, "Order kedaluwarsa.", mainMenu);
          break;
        }
        try {
          await bot.deleteMessage(chatId, messageId);
        } catch (e) {}
        await askForContactInfo(chatId); // Panggil ulang untuk menampilkan data
        break;
      }
      case "payment_cod":
        if (pendingOrders[chatId]) {
          pendingOrders[chatId].isConfirmedPayment = false;
          pendingOrders[chatId].waitingForProof = false;
        }
        await sendFinalConfirmationAndReset(chatId, paymentDetails.cod);
        break;
      case "payment_bca":
        await askForProof(chatId, messageId, "bca");
        break;
      case "payment_mandiri":
        await askForProof(chatId, messageId, "mandiri");
        break;
      case "payment_bni":
        await askForProof(chatId, messageId, "bni");
        break;
      case "payment_gopay":
        await askForProof(chatId, messageId, "gopay");
        break;
      case "payment_ovo":
        await askForProof(chatId, messageId, "ovo");
        break;
      case "info_lokasi":
        await bot.sendMessage(
          chatId,
          `🕒 Buka: 08.00–20.00 WIB\n📍 Alamat: Jl. Cucian No. 1\n📌 Maps: [Lokasi](https://bit.ly/gabe-laundry)`,
          { parse_mode: "Markdown", ...mainMenu }
        );
        break;
      case "hubungi_admin":
        await bot.sendMessage(
          chatId,
          `Kontak Admin:\n📞 0811-1222-3333\n📧 admin@gabelaundry.com`,
          { ...mainMenu }
        );
        break;
      default:
        if (
          action !== "ignore" &&
          chatId.toString() !== adminChatId.toString()
        ) {
          fallback(chatId);
        }
    }
    // --- Akhir switch case ---
  } catch (error) {
    console.error("Error di dalam callback_query (lanjutan):", error);
    if (chatId)
      bot.sendMessage(
        chatId,
        "Waduh, ada sedikit error di sistem kami. Coba lagi ya."
      );
  }
});

// =============================
// Fungsi Hitung Total
// =============================
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// =============================
// Fallback
// =============================
function fallback(chatId) {
  if (serviceCarts[chatId] || productCarts[chatId]) return;
  if (pendingOrders[chatId]?.waitingForProof) return;
  if (ordersAwaitingConfirmation[chatId]) return;
  bot.sendMessage(
    chatId,
    "Maaf, saya belum paham maksud kamu 😅\nSilakan pilih menu berikut:",
    mainMenu
  );
}

// =============================
// Handler Foto (Bukti Transfer)
// =============================
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;

  if (pendingOrders[chatId]?.waitingForProof) {
    const orderData = pendingOrders[chatId];
    const {
      paymentMethod,
      contactText,
      details,
      total,
      deliveryFee,
      deliveryMethod,
    } = orderData;
    const originalTotal = total - (deliveryFee || 0);
    const photoFileId = msg.photo[msg.photo.length - 1].file_id;

    await bot.sendMessage(
      chatId,
      "✅ Bukti transfer diterima! Pesanan Anda akan segera divalidasi oleh Admin."
    );

    orderData.photoFileId = photoFileId;
    ordersAwaitingConfirmation[chatId] = orderData;
    delete pendingOrders[chatId];

    if (adminChatId) {
      try {
        const parts = contactText.split(";");
        const nama = parts[0]?.trim() || "[Nama Tdk Ada]";
        const hp = parts[1]?.trim() || "[HP Tdk Ada]";

        const adminCaption = `
🔔 *Permintaan Konfirmasi Pembayaran* 🔔
----------------------
Dari: ${nama} (${hp})
Chat ID: \`${chatId}\`
Total: *Rp${total.toLocaleString("id-ID")}*
Metode: ${paymentMethod}

Pesanan:
\`\`\`
${details}
\`\`\`
Subtotal: Rp${originalTotal.toLocaleString("id-ID")}
Pengiriman: ${deliveryMethod || "Ambil Sendiri"}
`;

        const adminConfirmKeyboard = {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Konfirmasi",
                  callback_data: `admin_confirm_${chatId}`,
                },
                { text: "❌ Tolak", callback_data: `admin_reject_${chatId}` },
              ],
            ],
          },
        };

        await bot.sendPhoto(adminChatId, photoFileId, {
          caption: adminCaption,
          parse_mode: "Markdown",
          ...adminConfirmKeyboard,
        });
      } catch (e) {
        console.error("Gagal kirim bukti transfer ke admin:", e);
        try {
          await bot.sendMessage(
            adminChatId,
            `Gagal menerima foto bukti transfer dari chat ID ${chatId}. Error: ${e.message}.`
          );
        } catch (e2) {}
      }
    }
    // Jangan panggil sendStartMessage di sini agar user tidak langsung dapat menu
  } else {
    await bot.sendMessage(
      chatId,
      "Maaf, saya tidak mengerti mengapa Anda mengirim foto. Silakan gunakan menu."
    );
  }
});

// =============================
// Handler Teks (Fallback & Menunggu Bukti)
// =============================
bot.on("text", (msg) => {
  if (msg.text.startsWith("/start")) return; // Ditangani oleh onText /start

  const chatId = msg.chat.id;

  if (chatId.toString() === adminChatId.toString()) return; // Abaikan teks dari admin

  // Cek apakah sedang menunggu input kontak (ada listener 'once')
  const listeners = bot.listeners("text");
  let isWaitingForContact = false;
  for (const listener of listeners) {
    if (
      listener.name === "onceWrapper" ||
      listener.toString().includes("onceWrapper")
    ) {
      isWaitingForContact = true;
      break;
    }
  }

  // Jika sedang menunggu input kontak, jangan lakukan apa-apa di handler global ini
  if (isWaitingForContact) {
    return;
  }

  // Jika sedang menunggu bukti foto
  if (pendingOrders[chatId]?.waitingForProof) {
    bot.sendMessage(
      chatId,
      "Saya sedang menunggu *foto* bukti transfer Anda. 📸",
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Jika sedang menunggu konfirmasi admin
  if (ordersAwaitingConfirmation[chatId]) {
    bot.sendMessage(
      chatId,
      "Pesanan Anda sedang divalidasi oleh Admin. Mohon ditunggu ya... 🙏"
    );
    return;
  }

  // Jika tidak dalam state menunggu apapun, panggil fallback
  fallback(chatId);
});

console.log("🤖 GABE LAUNDRY BOT Sedang berjalan...");
