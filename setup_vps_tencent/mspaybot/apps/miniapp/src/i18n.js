// Mini App i18n — mirrors the bot's id/en/zh support. Keep brand names untranslated.
const DICT = {
  id: {
    rel_just_now: 'baru saja', rel_minutes: '{n}m', rel_hours: '{n}j', rel_days: '{n}h',
    tier_vip: 'VIP', tier_gold: 'Gold', tier_silver: 'Silver', tier_bronze: 'Bronze', tier_new: 'New',
    msg_payment_confirmed: 'Pembayaran terkonfirmasi. Mengalihkan ke History...',
    msg_invoice_expired: 'Invoice expired. Silakan checkout ulang untuk membuat invoice baru.',
    msg_order_status_retry: 'Order {status}. Silakan checkout ulang.',
    msg_status_latest: 'Status terbaru: {status}',
    msg_timer_expired: 'Timer pembayaran habis. Silakan checkout ulang.',
    err_select_product_first: 'Pilih produk dulu sebelum checkout.',
    err_single_item_only: 'Versi awal Mini App checkout satu produk per transaksi. Pilih satu item dulu.',
    err_out_of_stock_pick_other: 'Stok produk sudah habis. Silakan pilih produk lain.',
    err_stock_adjusted: 'Stok terbaru hanya tersisa {n}. Jumlah checkout sudah disesuaikan.',
    msg_awaiting_payment: 'Menunggu pembayaran. Sistem akan cek otomatis.',
    dlv_download: 'Download', dlv_open_link: 'Buka Link', dlv_email: 'Email', dlv_username: 'Username',
    dlv_mail_access: 'Akses Mail', dlv_password: 'Password', dlv_info: 'Info', dlv_access_link: 'Link Akses',
    dlv_2fa_code: 'Kode 2FA',
    dlv_2fa_note: '💡 2FA: login seperti biasa, saat diminta OTP buka 2fa.live, masukkan Kode 2FA, lalu pakai 6 digit OTP yang muncul.',
    dlv_data: 'Data', loading_store: 'Memuat storefront...',
    gate_eyebrow: 'TELEGRAM MINI APP', gate_title: 'Buka via Telegram untuk lanjut belanja',
    gate_copy: 'Halaman ini butuh validasi Telegram. Tap tombol di bawah untuk membuka Mini App dari Telegram.',
    gate_open_telegram: 'Buka di Telegram', gate_retry: 'Coba Lagi',
    gate_note: 'Jika tombol belum membuka mini app langsung, buka chat bot dulu lalu jalankan mini app dari menu bot.',
    status_pending: 'PENDING', status_paid: 'PAID', status_delivered: 'DELIVERED',
    status_cancelled: 'CANCELLED', status_expired: 'EXPIRED', status_failed: 'FAILED',
    hero_verified_store: 'Toko Terverifikasi', hero_greeting_named: 'Hai, {name}', hero_greeting_anon: 'Hai',
    hero_sub: 'Belanja produk digital, pengiriman otomatis dalam hitungan detik.',
    stat_products: 'Produk', stat_transactions: 'Transaksi', stat_users: 'Pengguna',
    page_history_title: 'Riwayat Order', page_history_sub: 'Lihat dan kelola pesanan kamu.',
    page_profile_title: 'Profil Saya', page_profile_sub: 'Status keanggotaan dan riwayat belanja.',
    toast_payment_success: 'Pembayaran {code} sukses. Cek detail di History.',
    invoice_eyebrow: 'INVOICE', label_total: 'Total', invoice_pay_before: 'Bayar sebelum',
    crypto_pay: 'Bayar', crypto_address: 'Alamat {coin}', crypto_copy_address: 'Salin Alamat',
    crypto_open_payment_page: 'Buka Halaman Pembayaran',
    crypto_note: 'Bayar pas {amount} {coin} ke alamat di atas, atau buka halaman pembayaran. Order otomatis terkirim setelah pembayaran terkonfirmasi.',
    qris_note: 'Bayar pas {amount}. Sampai 3 digit terakhir agar sistem auto-deteksi.',
    invoice_preparing: 'Menyiapkan instruksi pembayaran… Jika tidak muncul, tekan "Cek Status Sekarang".',
    btn_check_status_now: 'Cek Status Sekarang', confirm_cancel_order: 'Batalkan order ini? Order pending akan dihapus.',
    msg_order_cancelled: 'Order dibatalkan.', err_cancel_failed: 'Gagal membatalkan order.',
    btn_cancel_order: 'Batalkan Order', btn_back_to_store: 'Kembali ke Store',
    security_pill: 'Dilindungi Telegram + Cloudflare',
    search_placeholder: 'Cari produk, akun, atau source code...', aria_product_categories: 'Kategori produk',
    cat_all: 'Semua', empty_no_match_title: 'Tidak ada produk yang cocok',
    empty_no_match_sub: 'Coba kata kunci lain atau kategori berbeda.',
    stock_unlimited: '∞ Tanpa Batas', stock_out: 'Habis', stock_low: 'Sisa {n}', stock_ok: 'Stok {n}',
    cat_general: 'Umum', btn_out_of_stock: 'Stok Habis', btn_add: '+ Tambah',
    aria_decrease_qty: 'Kurangi qty', aria_increase_qty: 'Tambah qty', pager_prev: 'Prev', pager_next: 'Next',
    filter_all: 'Semua ({n})', filter_paid: 'Paid', filter_pending: 'Pending', filter_other: 'Lainnya',
    empty_no_order_title: 'Belum ada order', empty_no_order_sub: 'Mulai belanja dari tab Store, ya.',
    btn_open_store: 'Buka Store', label_qty: 'qty {n}', btn_loading: 'Memuat...', btn_view_account: 'Lihat Akun ›',
    hint_detail: 'Detail ›', label_item_count: '{n} item', delivery_eyebrow: 'DELIVERY', delivery_item_no: 'Item #{n}',
    btn_copied: 'Tersalin', btn_copy: 'Salin', delivery_note_title: '📌 Catatan Khusus',
    btn_view_terms: 'Lihat Syarat & Panduan', btn_close_detail: 'Tutup Detail', detail_order_eyebrow: 'DETAIL ORDER',
    label_product: 'Produk', label_quantity: 'Jumlah', label_date: 'Tanggal', label_method: 'Metode',
    detail_status_pending: '⏳ Menunggu pembayaran. Selesaikan pembayaran agar produk dikirim otomatis.',
    detail_status_cancelled: '❌ Order dibatalkan.',
    detail_status_expired: '⌛ Order kedaluwarsa karena tidak dibayar tepat waktu.',
    detail_status_failed: '⚠️ Pembayaran gagal diproses.', detail_status_default: 'Status order kamu.',
    profile_user_fallback: 'User', profile_member_suffix: 'Member {tier}', profile_total_spent: 'Total Belanja',
    profile_paid_orders: 'Order Lunas', profile_total_orders: 'Total Order',
    profile_action_history: '📦 Lihat Riwayat Order', profile_action_support: '💬 Hubungi Customer Service',
    profile_note: 'Bot ini mendukung produk akun premium, source code, dan file digital lainnya. Semua pengiriman otomatis lewat Telegram.',
    sticky_pay_crypto: '💸 Bayar Crypto', sticky_pay_qris: '🇮🇩 Bayar QRIS',
    nav_store: 'Store', nav_history: 'History', nav_profile: 'Profile',
  },
  en: {
    rel_just_now: 'just now', rel_minutes: '{n}m', rel_hours: '{n}h', rel_days: '{n}d',
    tier_vip: 'VIP', tier_gold: 'Gold', tier_silver: 'Silver', tier_bronze: 'Bronze', tier_new: 'New',
    msg_payment_confirmed: 'Payment confirmed. Redirecting to History...',
    msg_invoice_expired: 'Invoice expired. Please check out again to create a new invoice.',
    msg_order_status_retry: 'Order {status}. Please check out again.',
    msg_status_latest: 'Latest status: {status}',
    msg_timer_expired: 'Payment timer ran out. Please check out again.',
    err_select_product_first: 'Pick a product before checking out.',
    err_single_item_only: 'This version supports one product per checkout. Please select a single item.',
    err_out_of_stock_pick_other: 'This product is sold out. Please pick another one.',
    err_stock_adjusted: 'Only {n} left in stock. Your checkout quantity has been adjusted.',
    msg_awaiting_payment: 'Awaiting payment. The system checks automatically.',
    dlv_download: 'Download', dlv_open_link: 'Open Link', dlv_email: 'Email', dlv_username: 'Username',
    dlv_mail_access: 'Mail Access', dlv_password: 'Password', dlv_info: 'Info', dlv_access_link: 'Access Link',
    dlv_2fa_code: '2FA Code',
    dlv_2fa_note: '💡 2FA: log in as usual, when asked for an OTP open 2fa.live, paste the 2FA Code, then use the 6-digit OTP it shows.',
    dlv_data: 'Data', loading_store: 'Loading store...',
    gate_eyebrow: 'TELEGRAM MINI APP', gate_title: 'Open via Telegram to continue shopping',
    gate_copy: 'This page needs Telegram validation. Tap the button below to open the Mini App from Telegram.',
    gate_open_telegram: 'Open in Telegram', gate_retry: 'Try Again',
    gate_note: 'If the button does not open the mini app directly, open the bot chat first then launch the mini app from the bot menu.',
    status_pending: 'PENDING', status_paid: 'PAID', status_delivered: 'DELIVERED',
    status_cancelled: 'CANCELLED', status_expired: 'EXPIRED', status_failed: 'FAILED',
    hero_verified_store: 'Verified Store', hero_greeting_named: 'Hi, {name}', hero_greeting_anon: 'Hi there',
    hero_sub: 'Shop digital products, delivered automatically in seconds.',
    stat_products: 'Products', stat_transactions: 'Sales', stat_users: 'Users',
    page_history_title: 'Order History', page_history_sub: 'View and manage your orders.',
    page_profile_title: 'My Profile', page_profile_sub: 'Membership status and purchase history.',
    toast_payment_success: 'Payment {code} succeeded. See details in History.',
    invoice_eyebrow: 'INVOICE', label_total: 'Total', invoice_pay_before: 'Pay before',
    crypto_pay: 'Pay', crypto_address: '{coin} Address', crypto_copy_address: 'Copy Address',
    crypto_open_payment_page: 'Open Payment Page',
    crypto_note: 'Send exactly {amount} {coin} to the address above, or open the payment page. Your order is delivered automatically once payment is confirmed.',
    qris_note: 'Pay exactly {amount}. Match the last 3 digits so the system auto-detects it.',
    invoice_preparing: 'Preparing payment instructions… If nothing appears, tap "Check Status Now".',
    btn_check_status_now: 'Check Status Now', confirm_cancel_order: 'Cancel this order? The pending order will be removed.',
    msg_order_cancelled: 'Order cancelled.', err_cancel_failed: 'Failed to cancel the order.',
    btn_cancel_order: 'Cancel Order', btn_back_to_store: 'Back to Store',
    security_pill: 'Protected by Telegram + Cloudflare',
    search_placeholder: 'Search products, accounts, or source code...', aria_product_categories: 'Product categories',
    cat_all: 'All', empty_no_match_title: 'No matching products',
    empty_no_match_sub: 'Try another keyword or a different category.',
    stock_unlimited: '∞ Unlimited', stock_out: 'Sold Out', stock_low: '{n} left', stock_ok: 'Stock {n}',
    cat_general: 'General', btn_out_of_stock: 'Sold Out', btn_add: '+ Add',
    aria_decrease_qty: 'Decrease quantity', aria_increase_qty: 'Increase quantity', pager_prev: 'Prev', pager_next: 'Next',
    filter_all: 'All ({n})', filter_paid: 'Paid', filter_pending: 'Pending', filter_other: 'Other',
    empty_no_order_title: 'No orders yet', empty_no_order_sub: 'Start shopping from the Store tab.',
    btn_open_store: 'Open Store', label_qty: 'qty {n}', btn_loading: 'Loading...', btn_view_account: 'View Account ›',
    hint_detail: 'Details ›', label_item_count: '{n} item', delivery_eyebrow: 'DELIVERY', delivery_item_no: 'Item #{n}',
    btn_copied: 'Copied', btn_copy: 'Copy', delivery_note_title: '📌 Special Note',
    btn_view_terms: 'View Terms & Guide', btn_close_detail: 'Close Detail', detail_order_eyebrow: 'ORDER DETAIL',
    label_product: 'Product', label_quantity: 'Quantity', label_date: 'Date', label_method: 'Method',
    detail_status_pending: '⏳ Awaiting payment. Complete payment so the product is delivered automatically.',
    detail_status_cancelled: '❌ Order cancelled.',
    detail_status_expired: '⌛ Order expired because it was not paid in time.',
    detail_status_failed: '⚠️ Payment failed to process.', detail_status_default: 'Your order status.',
    profile_user_fallback: 'User', profile_member_suffix: '{tier} Member', profile_total_spent: 'Total Spent',
    profile_paid_orders: 'Paid Orders', profile_total_orders: 'Total Orders',
    profile_action_history: '📦 View Order History', profile_action_support: '💬 Contact Customer Service',
    profile_note: 'This bot supports premium accounts, source code, and other digital files. All deliveries are automatic via Telegram.',
    sticky_pay_crypto: '💸 Pay with Crypto', sticky_pay_qris: '🇮🇩 Pay with QRIS',
    nav_store: 'Store', nav_history: 'History', nav_profile: 'Profile',
  },
  zh: {
    rel_just_now: '刚刚', rel_minutes: '{n}分钟', rel_hours: '{n}小时', rel_days: '{n}天',
    tier_vip: 'VIP', tier_gold: '金牌', tier_silver: '银牌', tier_bronze: '铜牌', tier_new: '新会员',
    msg_payment_confirmed: '付款已确认，正在跳转到订单记录...',
    msg_invoice_expired: '账单已过期，请重新结算以生成新账单。',
    msg_order_status_retry: '订单{status}，请重新结算。',
    msg_status_latest: '最新状态：{status}',
    msg_timer_expired: '付款时间已到，请重新结算。',
    err_select_product_first: '请先选择商品再结算。',
    err_single_item_only: '当前版本每次结算仅支持一件商品，请只选择一件。',
    err_out_of_stock_pick_other: '该商品已售罄，请选择其他商品。',
    err_stock_adjusted: '库存仅剩 {n} 件，结算数量已自动调整。',
    msg_awaiting_payment: '等待付款中，系统将自动检测。',
    dlv_download: '下载', dlv_open_link: '打开链接', dlv_email: '邮箱', dlv_username: '用户名',
    dlv_mail_access: '邮箱访问', dlv_password: '密码', dlv_info: '信息', dlv_access_link: '访问链接',
    dlv_2fa_code: '2FA 代码',
    dlv_2fa_note: '💡 2FA：照常登录，当系统要求 OTP 时打开 2fa.live，粘贴 2FA 代码，然后输入显示的 6 位 OTP。',
    dlv_data: '数据', loading_store: '正在加载商店...',
    gate_eyebrow: 'TELEGRAM 小程序', gate_title: '通过 Telegram 打开以继续购物',
    gate_copy: '此页面需要 Telegram 验证。点击下方按钮从 Telegram 打开小程序。',
    gate_open_telegram: '在 Telegram 中打开', gate_retry: '重试',
    gate_note: '如果按钮无法直接打开小程序，请先打开机器人对话，再从机器人菜单启动小程序。',
    status_pending: '待付款', status_paid: '已付款', status_delivered: '已发货',
    status_cancelled: '已取消', status_expired: '已过期', status_failed: '失败',
    hero_verified_store: '认证商店', hero_greeting_named: '你好，{name}', hero_greeting_anon: '你好',
    hero_sub: '购买数字商品，几秒内自动发货。',
    stat_products: '商品', stat_transactions: '成交', stat_users: '用户',
    page_history_title: '订单记录', page_history_sub: '查看并管理你的订单。',
    page_profile_title: '我的资料', page_profile_sub: '会员状态与购买记录。',
    toast_payment_success: '付款 {code} 成功，请在订单记录中查看详情。',
    invoice_eyebrow: '账单', label_total: '合计', invoice_pay_before: '请在以下时间前付款',
    crypto_pay: '支付', crypto_address: '{coin} 地址', crypto_copy_address: '复制地址',
    crypto_open_payment_page: '打开支付页面',
    crypto_note: '请向上方地址支付准确的 {amount} {coin}，或打开支付页面。付款确认后订单将自动发货。',
    qris_note: '请支付准确的 {amount}，需精确到最后 3 位数字以便系统自动识别。',
    invoice_preparing: '正在准备付款说明……如果没有显示，请点击"立即检查状态"。',
    btn_check_status_now: '立即检查状态', confirm_cancel_order: '取消此订单？待付款的订单将被删除。',
    msg_order_cancelled: '订单已取消。', err_cancel_failed: '取消订单失败。',
    btn_cancel_order: '取消订单', btn_back_to_store: '返回商店',
    security_pill: '由 Telegram + Cloudflare 保护',
    search_placeholder: '搜索商品、账号或源码...', aria_product_categories: '商品分类',
    cat_all: '全部', empty_no_match_title: '没有匹配的商品',
    empty_no_match_sub: '换个关键词或其他分类试试。',
    stock_unlimited: '∞ 无限', stock_out: '售罄', stock_low: '剩 {n}', stock_ok: '库存 {n}',
    cat_general: '通用', btn_out_of_stock: '售罄', btn_add: '+ 添加',
    aria_decrease_qty: '减少数量', aria_increase_qty: '增加数量', pager_prev: '上一页', pager_next: '下一页',
    filter_all: '全部 ({n})', filter_paid: '已付款', filter_pending: '待付款', filter_other: '其他',
    empty_no_order_title: '还没有订单', empty_no_order_sub: '从商店标签开始购物吧。',
    btn_open_store: '打开商店', label_qty: '数量 {n}', btn_loading: '加载中...', btn_view_account: '查看账号 ›',
    hint_detail: '详情 ›', label_item_count: '{n} 项', delivery_eyebrow: '发货', delivery_item_no: '商品 #{n}',
    btn_copied: '已复制', btn_copy: '复制', delivery_note_title: '📌 特别说明',
    btn_view_terms: '查看条款与指南', btn_close_detail: '关闭详情', detail_order_eyebrow: '订单详情',
    label_product: '商品', label_quantity: '数量', label_date: '日期', label_method: '方式',
    detail_status_pending: '⏳ 等待付款。完成付款后商品将自动发货。',
    detail_status_cancelled: '❌ 订单已取消。',
    detail_status_expired: '⌛ 订单因未及时付款而过期。',
    detail_status_failed: '⚠️ 付款处理失败。', detail_status_default: '你的订单状态。',
    profile_user_fallback: '用户', profile_member_suffix: '{tier} 会员', profile_total_spent: '累计消费',
    profile_paid_orders: '已付订单', profile_total_orders: '订单总数',
    profile_action_history: '📦 查看订单记录', profile_action_support: '💬 联系客服',
    profile_note: '本机器人支持高级账号、源码及其他数字文件，所有发货均通过 Telegram 自动完成。',
    sticky_pay_crypto: '💸 加密货币支付', sticky_pay_qris: '🇮🇩 QRIS 支付',
    nav_store: '商店', nav_history: '记录', nav_profile: '我的',
  },
};

export function normalizeLang(code) {
  const c = String(code || '').toLowerCase().split('-')[0];
  if (c === 'id') return 'id';
  if (c === 'zh') return 'zh';
  if (c === 'en') return 'en';
  return 'en';
}

export function t(lang, key, vars) {
  const L = DICT[lang] || DICT.en;
  let s = L[key] ?? DICT.en[key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.replaceAll(`{${k}}`, String(vars[k]));
    }
  }
  return s;
}

// id => Rp (raw IDR). en/zh => USD with intl markup, mirroring the bot's localizedPrice + formatMoney.
// Use for BASE prices (product card, cart subtotal) that have NOT been marked up yet.
export function formatMoney(idrAmount, lang, usdRate, multiplier) {
  const idr = Number(idrAmount || 0);
  if (lang === 'en' || lang === 'zh') {
    const m = Number(multiplier) > 0 ? Number(multiplier) : 1.5;
    const marked = Math.round((idr * m) / 1000) * 1000;
    const rate = Number(usdRate) > 0 ? Number(usdRate) : 16000;
    return `$${(marked / rate).toFixed(2)}`;
  }
  return `Rp ${idr.toLocaleString('id-ID')}`;
}

// For FINAL amounts already localized server-side (checkout.amount, order.price, totalSpent):
// id => Rp; en/zh => convert IDR→USD WITHOUT re-applying the markup (worker already did it).
export function formatMoneyFinal(idrAmount, lang, usdRate) {
  const idr = Number(idrAmount || 0);
  if (lang === 'en' || lang === 'zh') {
    const rate = Number(usdRate) > 0 ? Number(usdRate) : 16000;
    return `$${(idr / rate).toFixed(2)}`;
  }
  return `Rp ${idr.toLocaleString('id-ID')}`;
}
