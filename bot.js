// =============================
// GABE LAUNDRY BOT 🧺
// Telegram Bot Version
// =============================

require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");

// === TOKEN DIAMBIL DARI .env ===
const token = process.env.TELEGRAM_TOKEN;

if (!token) {
  console.error("Error: Token Telegram tidak ditemukan!");
  console.log(
    "Pastikan Anda sudah membuat file .env dan mengisinya dengan TELEGRAM_TOKEN=..."
  );
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Objek untuk menyimpan keranjang belanja (dipisah)
let serviceCarts = {}; // Untuk jasa laundry
let productCarts = {}; // Untuk produk

// Objek untuk menyimpan order yang menunggu konfirmasi checkout
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
// Fungsi untuk meminta data kontak
// =============================
async function askForContactInfo(chatId) {
  try {
    const orderData = pendingOrders[chatId];
    let totalText = "";
    if (orderData && orderData.total) {
      totalText = `\n*Total Tagihan Anda (termasuk ongkir): Rp${orderData.total.toLocaleString(
        "id-ID"
      )}*`;
    }

    await bot.sendMessage(
      chatId,
      `
${totalText}

Silakan kirim *Nama*, *Nomor HP*, dan *Alamat Jemput* dalam 1 baris.

*Gunakan tanda titik-koma (;) sebagai pemisah.*

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

      pendingOrders[chatId].contactText = contact.text;

      const parts = contact.text.split(";");
      const nama = parts[0] ? parts[0].trim() : "[Belum diisi]";
      const hp = parts[1] ? parts[1].trim() : "[Belum diisi]";
      const alamat = parts[2] ? parts[2].trim() : "[Belum diisi]";

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

// (Kode fungsi buildServicesKeyboard, showServiceQuantitySelector, showServiceOrderMenu tidak berubah)
function buildServicesKeyboard(chatId) {
  const keyboard = [];
  const serviceCart = serviceCarts[chatId];
  const productCart = productCarts[chatId];

  for (const serviceName in jasaLaundry) {
    const safeServiceName = serviceName.replace(/ /g, "-");
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
  text += "🛒 *Keranjang Layanan Anda:*\n";

  let serviceTotal = 0;
  if (serviceCart.items.length === 0) {
    text += "  _(Kosong)_\n";
  } else {
    for (const item of serviceCart.items) {
      const subtotal = item.price * item.quantity;
      serviceTotal += subtotal;
      text += `  - ${item.name} (${item.quantity} ${
        item.unit
      }) = Rp${subtotal.toLocaleString("id-ID")}\n`;
    }
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

  text += "\n\nSilakan pilih layanan untuk ditambahkan:";

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
      error.message.includes("message to edit not found") ||
      error.message.includes("message is not modified")
    ) {
      const sentMessage = await bot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        ...keyboard,
      });
      serviceCart.messageId = sentMessage.message_id;
      productCart.messageId = sentMessage.message_id;
    }
  }
}

// =============================
// Bagian Fungsi Order PRODUK
// =============================

// (Kode fungsi buildProductsKeyboard, showProductQuantitySelector, showProductOrderMenu tidak berubah)
function buildProductsKeyboard(chatId) {
  const keyboard = [];
  const serviceCart = serviceCarts[chatId];
  const productCart = productCarts[chatId];

  for (const productName in productsData) {
    const safeProductName = productName.replace(/ /g, "-");
    keyboard.push([
      {
        text: `🧴 ${productName}`,
        callback_data: `product_select_${safeProductName}`,
      },
    ]);
  }

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
  text += "🛒 *Keranjang Produk Anda:*\n";

  let productTotal = 0;
  if (productCart.items.length === 0) {
    text += "  _(Kosong)_\n";
  } else {
    for (const item of productCart.items) {
      const subtotal = item.price * item.quantity;
      productTotal += subtotal;
      text += `  - ${item.name} (${item.quantity} ${
        item.unit
      }) = Rp${subtotal.toLocaleString("id-ID")}\n`;
    }
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

  text += "\n\nSilakan pilih produk untuk ditambahkan:";

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
    console.error("Error di showProductOrderMenu:", error.message);
    if (
      error.message.includes("message to edit not found") ||
      error.message.includes("message is not modified")
    ) {
      const sentMessage = await bot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        ...keyboard,
      });
      serviceCart.messageId = sentMessage.message_id;
      productCart.messageId = sentMessage.message_id;
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
// Fungsi Konfirmasi Akhir (Gabungan)
// =============================
async function sendFinalConfirmationAndReset(chatId, paymentInfoText) {
  try {
    const orderData = pendingOrders[chatId];
    // console.log(`[sendFinalConfirmationAndReset] chatId: ${chatId}, Received orderData:`, JSON.stringify(orderData, null, 2)); // Dihapus setelah debug

    if (
      !orderData ||
      !orderData.contactText ||
      !orderData.details || // Check details
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

    // (UBAH) Gunakan alias 'details: orderDetails' untuk memperbaiki typo
    const {
      contactText,
      details: orderDetails,
      total,
      deliveryFee,
    } = orderData;
    const originalTotal = total - (deliveryFee || 0);

    // console.log(`[sendFinalConfirmationAndReset] chatId: ${chatId}, Final orderDetails value before message:`, orderDetails); // Dihapus setelah debug

    const parts = contactText.split(";");
    const nama = parts[0] ? parts[0].trim() : "[Belum diisi]";
    const hp = parts[1] ? parts[1].trim() : "[Belum diisi]";
    const alamat = parts[2] ? parts[2].trim() : "[Belum diisi]";

    let finalText = `
Terima kasih ${nama.split(" ")[0]}! 🙏  

Pesanan Anda telah kami catat. Admin kami akan segera menghubungi kamu.

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

    if (orderData.waitingForProof) {
      finalText += `
*(Bukti transfer Anda telah diterima dan akan segera diperiksa oleh admin)*
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

    await bot.sendMessage(chatId, finalText, { parse_mode: "Markdown" });
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
    sendStartMessage(chatId);
  }
}

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

  if (action === "service_item_cancel") {
    await showServiceOrderMenu(chatId);
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

  if (action === "product_item_cancel") {
    await showProductOrderMenu(chatId);
    return bot.answerCallbackQuery(query.id);
  }

  // ===================================
  // HANDLER NAVIGASI & CHECKOUT TERPADU
  // ===================================

  if (action === "cart_nav_services") {
    await showServiceOrderMenu(chatId, "Pindah ke menu Layanan Jasa...");
    return bot.answerCallbackQuery(query.id);
  }

  if (action === "cart_nav_products") {
    await showProductOrderMenu(chatId, "Pindah ke menu Beli Produk...");
    return bot.answerCallbackQuery(query.id);
  }

  if (action === "cart_cancel_all") {
    try {
      const serviceCart = serviceCarts[chatId];
      const productCart = productCarts[chatId];
      const messageIdToUse =
        (serviceCart && serviceCart.messageId) ||
        (productCart && productCart.messageId);

      if (messageIdToUse) {
        await bot.deleteMessage(chatId, messageIdToUse);
      }
      if (serviceCart) delete serviceCarts[chatId];
      if (productCart) delete productCarts[chatId];

      await bot.sendMessage(chatId, "Semua pesanan dibatalkan.", mainMenu);
    } catch (e) {
      console.error("Gagal batalkan semua order:", e.message);
      sendStartMessage(chatId);
    }
    return bot.answerCallbackQuery(query.id);
  }

  if (action === "cart_checkout") {
    const serviceCart = serviceCarts[chatId];
    const productCart = productCarts[chatId];
    const hasServiceItems = serviceCart && serviceCart.items.length > 0;
    const hasProductItems = productCart && productCart.items.length > 0;

    if (!hasServiceItems && !hasProductItems) {
      await bot.sendMessage(chatId, "Keranjang Anda kosong.", mainMenu);
      return bot.answerCallbackQuery(query.id);
    }
    let orderDetails = "";
    let total = 0;
    let serviceTotal = 0;
    let productTotal = 0;

    if (hasServiceItems) {
      serviceTotal = calculateTotal(serviceCart.items);
      total += serviceTotal;
      orderDetails += "*Layanan Jasa:*\n";
      orderDetails += serviceCart.items
        .map((item) => {
          const subtotal = item.price * item.quantity;
          return `  - ${item.name} x${item.quantity}${
            item.unit
          } = Rp${subtotal.toLocaleString("id-ID")}`;
        })
        .join("\n");
    }
    if (hasProductItems) {
      productTotal = calculateTotal(productCart.items);
      total += productTotal;
      if (hasServiceItems) orderDetails += "\n\n";
      orderDetails += "*Produk:*\n";
      orderDetails += productCart.items
        .map((item) => {
          const subtotal = item.price * item.quantity;
          return `  - ${item.name} x${item.quantity}${
            item.unit
          } = Rp${subtotal.toLocaleString("id-ID")}`;
        })
        .join("\n");
    }

    // console.log(`[cart_checkout] chatId: ${chatId}, Calculated orderDetails:`, orderDetails); // Dihapus setelah debug
    // console.log(`[cart_checkout] chatId: ${chatId}, Calculated total (before delivery):`, total); // Dihapus setelah debug

    pendingOrders[chatId] = {
      details: orderDetails,
      total: total, // Simpan total asli SEBELUM ongkir
    };

    try {
      const messageIdToUse =
        (serviceCart && serviceCart.messageId) ||
        (productCart && productCart.messageId);
      if (messageIdToUse) {
        await bot.deleteMessage(chatId, messageIdToUse);
      }
    } catch (e) {
      console.error("Gagal hapus pesan menu:", e.message);
    }

    if (serviceCart) delete serviceCarts[chatId];
    if (productCart) delete productCarts[chatId];

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
    return bot.answerCallbackQuery(query.id);
  }

  // ===================================
  // HANDLER TOMBOL MENU UTAMA
  // ===================================
  try {
    // Helper function to process delivery selection
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

      // Update total in pendingOrders
      pendingOrders[chatId].total += fee; // Tambah biaya antar
      pendingOrders[chatId].deliveryFee = fee;
      pendingOrders[chatId].deliveryMethod = feeText;

      // Hapus pesan pilihan delivery
      try {
        await bot.deleteMessage(chatId, messageId);
      } catch (e) {}

      // Sekarang panggil askForContactInfo
      await askForContactInfo(chatId);
    };

    // Fungsi helper untuk meminta bukti bayar
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

      // Set state
      pendingOrders[chatId].waitingForProof = true;
      pendingOrders[chatId].paymentMethod = paymentInfoText;

      await bot.editMessageText(
        `Silakan transfer sejumlah *Rp${total.toLocaleString("id-ID")}* ke:
                  
\`\`\`
${paymentInfoText}
\`\`\`
                  
Setelah selesai, silakan *kirim foto bukti transfer* Anda di sini.`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
        }
      );
    };

    switch (action) {
      // Tombol Navigasi /start
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
        await showServiceOrderMenu(chatId, "Selamat datang di menu order!");
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
      // ALUR CHECKOUT
      // ===================================
      case "checkout_confirm":
        if (!pendingOrders[chatId]) {
          await bot.sendMessage(
            chatId,
            "Maaf, order ini sudah kedaluwarsa atau selesai.",
            mainMenu
          );
          break;
        }
        await bot.editMessageText(
          "Silakan pilih *Metode Pengambilan & Pengantaran* untuk pesanan Anda:",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            ...deliveryMethodMenu,
          }
        );
        break;

      // Handler untuk Pilihan Delivery
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

      case "contact_confirm_yes":
        if (!pendingOrders[chatId] || !pendingOrders[chatId].contactText) {
          await bot.sendMessage(
            chatId,
            "Maaf, order ini sudah kedaluwarsa.",
            mainMenu
          );
          break;
        }
        await bot.editMessageText(
          "Data kontak Anda sudah benar. 👍\n\nSilakan pilih *metode pembayaran*:",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            ...paymentMethodMenu,
          }
        );
        break;

      case "contact_confirm_no":
        if (!pendingOrders[chatId]) {
          await bot.sendMessage(
            chatId,
            "Maaf, order ini sudah kedaluwarsa.",
            mainMenu
          );
          break;
        }
        if (pendingOrders[chatId].deliveryFee) {
          pendingOrders[chatId].total -= pendingOrders[chatId].deliveryFee;
          delete pendingOrders[chatId].deliveryFee;
          delete pendingOrders[chatId].deliveryMethod;
        }
        if (pendingOrders[chatId].contactText) {
          delete pendingOrders[chatId].contactText;
        }

        await bot.sendMessage(
          chatId,
          "Baik, data Anda direset. Kita ulangi dari pemilihan metode pengantaran."
        );
        await bot.sendMessage(
          chatId,
          "Silakan pilih *Metode Pengambilan & Pengantaran*:",
          {
            parse_mode: "Markdown",
            ...deliveryMethodMenu,
          }
        );
        break;

      // ===================================
      // ALUR METODE PEMBAYARAN
      // ===================================
      case "payment_mbanking":
        await bot.editMessageText("Silakan pilih Bank:", {
          chat_id: chatId,
          message_id: messageId,
          ...mbankingMenu,
        });
        break;

      case "payment_ewallet":
        await bot.editMessageText("Silakan pilih E-Wallet:", {
          chat_id: chatId,
          message_id: messageId,
          ...ewalletMenu,
        });
        break;

      case "payment_back_to_main":
        await bot.editMessageText("Silakan pilih *metode pembayaran*:", {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          ...paymentMethodMenu,
        });
        break;

      case "payment_cod":
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

      // ===================================
      // ALUR INFO
      // ===================================

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

  // Hapus pesan 'loading' dari tombol
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
  if (pendingOrders[chatId] && pendingOrders[chatId].waitingForProof) {
    return; // Jangan kirim fallback
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

// Global Photo Handler
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;

  if (pendingOrders[chatId] && pendingOrders[chatId].waitingForProof) {
    const paymentInfoText = pendingOrders[chatId].paymentMethod;

    await bot.sendMessage(
      chatId,
      "✅ Bukti transfer diterima! Pesanan Anda sedang kami proses."
    );

    await sendFinalConfirmationAndReset(chatId, paymentInfoText);
  } else {
    await bot.sendMessage(
      chatId,
      "Maaf, saya tidak mengerti mengapa Anda mengirim foto. Silakan gunakan menu."
    );
  }
});

// Global Text Handler untuk fallback
bot.on("text", (msg) => {
  if (msg.text.startsWith("/start")) {
    return;
  }

  const chatId = msg.chat.id;

  if (pendingOrders[chatId] && pendingOrders[chatId].waitingForProof) {
    bot.sendMessage(
      chatId,
      "Saya sedang menunggu *foto* bukti transfer Anda. Silakan kirimkan fotonya. 📸"
    );
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
    fallback(chatId);
  }
});

console.log("🤖 GABE LAUNDRY BOT Sedang berjalan...");
