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

// Objek untuk menyimpan keranjang belanja user
let userCarts = {};

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

// =============================
// Data Layanan Laundry
// =============================
const jasaLaundry = {
  // Nama Jasa (harus unik): { price: HARGA, unit: 'kg' atau 'pcs' }
  "Cuci Setrika": { price: 7000, unit: "kg" },
  "Cuci Kering": { price: 5000, unit: "kg" },
  "Setrika Saja": { price: 4000, unit: "kg" },
  Sepatu: { price: 25000, unit: "pcs" },
  "Boneka Besar": { price: 20000, unit: "pcs" },
};

// =============================
// Inline Keyboard Menu Utama
// =============================
const mainMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "👔 Daftar Layanan & Harga", callback_data: "lihat_layanan" }],
      [{ text: "🧺 Order Laundry", callback_data: "order_laundry" }],
      [{ text: "📍 Info Lokasi & Jam Buka", callback_data: "info_lokasi" }],
      [{ text: "📞 Hubungi Admin", callback_data: "hubungi_admin" }],
    ],
  },
};

// =============================
// Keyboard KHUSUS Saat Lihat Layanan
// =============================
const menuKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "🧺 Order Sekarang", callback_data: "order_laundry" }],
      [{ text: "« Kembali ke Menu Utama", callback_data: "menu_utama" }],
    ],
  },
};

// =============================
// (UBAH) Fungsi untuk Membuat Keyboard Layanan (Dinamis)
// =============================
function buildServicesKeyboard(chatId) {
  const keyboard = [];
  const cart = userCarts[chatId];

  // Tambahkan tombol untuk setiap layanan
  for (const serviceName in jasaLaundry) {
    // (UBAH) Ganti spasi dengan '-' agar aman untuk callback_data
    const safeServiceName = serviceName.replace(/ /g, "-");
    keyboard.push([
      {
        text: `👕 ${serviceName}`,
        callback_data: `order_select_${safeServiceName}`,
      },
    ]);
  }

  // Hanya tampilkan tombol checkout jika keranjang tidak kosong
  if (cart && cart.items.length > 0) {
    keyboard.push([
      {
        text: "✅ Selesai & Checkout",
        callback_data: "order_checkout",
      },
    ]);
  }

  // Tombol untuk membatalkan seluruh order
  keyboard.push([
    { text: "❌ Batal Order & Kembali", callback_data: "order_cancel" },
  ]);

  return { reply_markup: { inline_keyboard: keyboard } };
}

// =============================
// (BARU) Fungsi untuk Menampilkan Pemilih Kuantitas
// =============================
async function showQuantitySelector(
  chatId,
  serviceName,
  currentQuantity,
  messageId
) {
  const service = jasaLaundry[serviceName];
  if (!service) {
    console.error(
      "Layanan tidak ditemukan di showQuantitySelector:",
      serviceName
    );
    return;
  }

  const unit = service.unit;
  const minQuantity = unit === "kg" ? 0.5 : 1; // Kuantitas minimum

  // Pastikan kuantitas saat ini tidak di bawah minimum
  let qty = Math.max(minQuantity, currentQuantity);

  // Buat serviceName yang aman untuk callback
  const safeServiceName = serviceName.replace(/ /g, "-");

  let text = `🧺 Pilih jumlah untuk *${serviceName}*:\n\n*Jumlah Saat Ini: ${qty} ${unit}*`;

  let keyboard = [];
  let row1 = []; // Baris untuk menambah
  let row2 = []; // Baris untuk mengurangi

  if (unit === "kg") {
    row1.push({
      text: "+0.5 kg",
      callback_data: `qty_update_${safeServiceName}_${qty + 0.5}`,
    });
    row1.push({
      text: "+1 kg",
      callback_data: `qty_update_${safeServiceName}_${qty + 1}`,
    });
    if (qty > 0.5) {
      row2.push({
        text: "-0.5 kg",
        callback_data: `qty_update_${safeServiceName}_${Math.max(
          minQuantity,
          qty - 0.5
        )}`,
      });
    }
    if (qty > 1) {
      row2.push({
        text: "-1 kg",
        callback_data: `qty_update_${safeServiceName}_${Math.max(
          minQuantity,
          qty - 1
        )}`,
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
    if (qty > 1) {
      row2.push({
        text: "-1 pcs",
        callback_data: `qty_update_${safeServiceName}_${Math.max(
          minQuantity,
          qty - 1
        )}`,
      });
    }
    if (qty > 5) {
      row2.push({
        text: "-5 pcs",
        callback_data: `qty_update_${safeServiceName}_${Math.max(
          minQuantity,
          qty - 5
        )}`,
      });
    }
  }

  keyboard.push(row1);
  if (row2.length > 0) keyboard.push(row2);

  // Baris Konfirmasi dan Batal
  keyboard.push([
    {
      text: `✅ Konfirmasi ${qty} ${unit}`,
      callback_data: `qty_confirm_${safeServiceName}_${qty}`,
    },
  ]);
  keyboard.push([{ text: "⬅️ Kembali ke Menu", callback_data: "qty_cancel" }]);

  const keyboardMarkup = { reply_markup: { inline_keyboard: keyboard } };

  try {
    // Kita harus *mengedit* pesan (bukan mengirim baru)
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId, // messageId dari tombol yg ditekan
      parse_mode: "Markdown",
      ...keyboardMarkup,
    });
  } catch (e) {
    console.error("Error di showQuantitySelector editMessageText:", e.message);
    // Jika gagal (misal, pesan terlalu tua), kirim pesan baru sebagai fallback
    await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      ...keyboardMarkup,
    });
  }
}

// =============================
// Fungsi untuk Menampilkan Menu Order
// =============================
async function showOrderMenu(chatId, messagePrefix = "") {
  // Pastikan keranjang ada
  if (!userCarts[chatId]) {
    userCarts[chatId] = { items: [], messageId: null };
  }
  const cart = userCarts[chatId];

  // 1. Buat Teks Pesan
  let text = messagePrefix ? `${messagePrefix}\n\n` : "";
  text += "🛒 *Keranjang Anda Saat Ini:*\n";

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

  // 2. Buat Keyboard
  const keyboard = buildServicesKeyboard(chatId);

  // 3. Kirim atau Edit Pesan
  try {
    if (cart.messageId) {
      // Jika sudah ada pesan menu, edit pesan itu
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: cart.messageId,
        parse_mode: "Markdown",
        ...keyboard,
      });
    } else {
      // Jika belum ada, kirim pesan baru dan simpan ID-nya
      const sentMessage = await bot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        ...keyboard,
      });
      cart.messageId = sentMessage.message_id;
    }
  } catch (error) {
    console.error("Error di showOrderMenu:", error.message);
    if (
      error.message.includes("message to edit not found") ||
      error.message.includes("message is not modified")
    ) {
      // Jika messageId tidak valid (misal, terlalu tua), kirim pesan baru
      // Atau jika pesan tidak dimodifikasi (misal, batal lalu panggil showOrderMenu lagi)
      // Kita kirim ulang saja agar tidak error
      if (
        cart.messageId &&
        !error.message.includes("message is not modified")
      ) {
        // Hapus pesan lama jika bisa, agar tidak duplikat
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
  // Bersihkan keranjang belanja jika user /start
  if (userCarts[chatId]) {
    delete userCarts[chatId];
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
// HANDLER CALLBACK BUTTON (DIPERBARUI TOTAL)
// =============================
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;
  const messageId = query.message.message_id; // Kita butuh ini untuk mengedit pesan

  // (UBAH) Cek jika ini adalah tombol pemilihan layanan
  if (action.startsWith("order_select_")) {
    const safeServiceName = action.substring("order_select_".length);
    const serviceName = safeServiceName.replace(/-/g, " "); // 'Cuci-Setrika' -> 'Cuci Setrika'
    const service = jasaLaundry[serviceName];

    if (!service) {
      await bot.sendMessage(chatId, "Maaf, layanan itu tidak ditemukan.");
      return bot.answerCallbackQuery(query.id);
    }

    // (UBAH) Tidak lagi minta teks, panggil pemilih kuantitas
    const defaultQty = service.unit === "kg" ? 0.5 : 1;
    await showQuantitySelector(chatId, serviceName, defaultQty, messageId);

    return bot.answerCallbackQuery(query.id);
  }

  // (BARU) Handler untuk tombol update kuantitas (+0.5, -1, dll)
  if (action.startsWith("qty_update_")) {
    const parts = action.split("_"); // cth: [qty, update, Cuci-Setrika, 1.5]
    const quantity = parseFloat(parts[parts.length - 1]);
    const safeServiceName = parts.slice(2, -1).join("_"); // Menangani nama jika ada '_'
    const serviceName = safeServiceName.replace(/-/g, " ");

    if (isNaN(quantity)) {
      console.error("Error parsing quantity dari callback:", action);
      return bot.answerCallbackQuery(query.id, { text: "Error jumlah!" });
    }

    await showQuantitySelector(chatId, serviceName, quantity, messageId);
    return bot.answerCallbackQuery(query.id);
  }

  // (BARU) Handler untuk tombol konfirmasi kuantitas
  if (action.startsWith("qty_confirm_")) {
    const parts = action.split("_");
    const quantity = parseFloat(parts[parts.length - 1]);
    const safeServiceName = parts.slice(2, -1).join("_");
    const serviceName = safeServiceName.replace(/-/g, " ");

    const service = jasaLaundry[serviceName];

    if (!service || isNaN(quantity) || quantity <= 0) {
      await showOrderMenu(chatId, `Jumlah tidak valid.`);
      return bot.answerCallbackQuery(query.id);
    }

    // Pastikan cart ada
    if (!userCarts[chatId]) {
      userCarts[chatId] = { items: [], messageId: messageId };
    } else {
      userCarts[chatId].messageId = messageId; // Update messageId
    }

    // Tambahkan ke keranjang
    userCarts[chatId].items.push({
      name: serviceName,
      price: service.price,
      unit: service.unit,
      quantity: quantity,
    });

    // Tampilkan menu order lagi dengan pesan sukses
    await showOrderMenu(
      chatId,
      `✅ ${quantity} ${service.unit} ${serviceName} berhasil ditambahkan!`
    );
    return bot.answerCallbackQuery(query.id);
  }

  // (BARU) Handler untuk tombol batal dari pemilih kuantitas
  if (action === "qty_cancel") {
    // Cukup panggil ulang menu order
    await showOrderMenu(chatId);
    return bot.answerCallbackQuery(query.id);
  }

  // Cek jika ini adalah tombol checkout dari keranjang
  if (action === "order_checkout") {
    const cart = userCarts[chatId];

    if (!cart || cart.items.length === 0) {
      await bot.sendMessage(chatId, "Keranjang Anda kosong.", mainMenu);
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
    delete userCarts[chatId];

    await bot.sendMessage(
      chatId,
      `
✅ Order Kamu:
${orderDetails}

💰 Total Estimasi: Rp${total.toLocaleString("id-ID")}

*(Total final akan dikonfirmasi admin setelah penimbangan ulang di toko)*

Mau lanjut checkout?
  `,
      { parse_mode: "Markdown", ...checkoutKeyboard }
    );

    return bot.answerCallbackQuery(query.id);
  }

  // Cek jika ini adalah tombol batal dari keranjang
  if (action === "order_cancel") {
    try {
      if (userCarts[chatId]) {
        if (userCarts[chatId].messageId) {
          await bot.deleteMessage(chatId, userCarts[chatId].messageId);
        }
        delete userCarts[chatId];
      }
      await bot.sendMessage(chatId, "Order dibatalkan.", mainMenu);
    } catch (e) {
      console.error("Gagal batalkan order:", e.message);
      sendStartMessage(chatId); // Fallback
    }
    return bot.answerCallbackQuery(query.id);
  }

  // Handler untuk tombol-tombol lainnya (Menu Utama)
  try {
    switch (action) {
      // === FLOW 2: LIHAT LAYANAN ===
      case "lihat_layanan":
        let layananText = "👔 Daftar Layanan Kami:\n\n";
        for (const [namaJasa, detail] of Object.entries(jasaLaundry)) {
          const hargaString = detail.price.toLocaleString("id-ID");
          layananText += `👕 ${namaJasa} – Rp${hargaString} /${detail.unit}\n`;
        }
        layananText += `\nSilakan tekan "Order Sekarang" untuk mulai order.`;

        await bot.sendMessage(chatId, layananText, {
          parse_mode: "Markdown",
          ...menuKeyboard,
        });
        break;

      // === FLOW 3: ORDER LAUNDRY (UBAH) ===
      case "order_laundry":
        // Panggil fungsi menu
        await showOrderMenu(chatId, "Selamat datang di menu order!");
        break;

      // === FLOW: KEMBALI KE MENU UTAMA ===
      case "menu_utama":
        sendStartMessage(chatId);
        break;

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
        delete pendingOrders[chatId];

        try {
          await bot.sendMessage(
            chatId,
            "Silakan kirim *Nama*, *Nomor HP*, dan *Alamat Jemput*.",
            { parse_mode: "Markdown" }
          );

          bot.once("text", async (contact) => {
            if (contact.text === "/start") {
              sendStartMessage(chatId);
              return;
            }
            try {
              await bot.sendMessage(
                chatId,
                `
Terima kasih ${contact.text.split(" ")[0]}! 🙏  
Admin kami akan segera menghubungi kamu untuk konfirmasi order dan jadwal jemput.

🧺 Terima kasih sudah order di Gabe Laundry! 💚
        `,
                { parse_mode: "Markdown", ...mainMenu }
              );
            } catch (err) {
              console.error("Error di listener 'contact':", err);
            }
          });
        } catch (err) {
          console.error("Error di 'checkout_confirm':", err);
        }
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
  if (userCarts[chatId]) {
    // Jika user ada di alur order, jangan kirim fallback
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

// (BARU) Global Text Handler untuk fallback
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
    fallback(msg.chat.id);
  }
});

console.log("🤖 GABE LAUNDRY BOT Sedang berjalan...");
