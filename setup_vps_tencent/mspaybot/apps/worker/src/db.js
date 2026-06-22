function nowIso() {
  return new Date().toISOString();
}

export function createDb(env) {
  const db = env.DB;

  return {
    async upsertUser(user) {
      await db
        .prepare(
          `INSERT INTO users (user_id, username, first_name, last_active)
           VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(user_id) DO UPDATE SET
             username = excluded.username,
             first_name = excluded.first_name,
             last_active = excluded.last_active,
             is_blocked = 0,
             blocked_at = NULL`
        )
        .bind(user.id, user.username || '', user.first_name || '', nowIso())
        .run();
    },

    async getUserById(userId) {
      const row = await db.prepare('SELECT * FROM users WHERE user_id = ?1 LIMIT 1').bind(userId).first();
      return row || null;
    },

    async setUserLanguage(userId, lang) {
      await db.prepare('UPDATE users SET language_code = ?2 WHERE user_id = ?1').bind(userId, lang).run();
    },

    async getTranslation(cacheKey) {
      const row = await db.prepare('SELECT translated_text FROM translation_cache WHERE cache_key = ?1 LIMIT 1').bind(cacheKey).first();
      return row?.translated_text || null;
    },

    async setTranslation(cacheKey, targetLang, sourceText, translatedText) {
      await db
        .prepare(`INSERT INTO translation_cache (cache_key, target_lang, source_text, translated_text)
                  VALUES (?1, ?2, ?3, ?4)
                  ON CONFLICT(cache_key) DO UPDATE SET translated_text = excluded.translated_text`)
        .bind(cacheKey, targetLang, sourceText, translatedText)
        .run();
    },

    async addWalletPoints(userId, points) {
      await db
        .prepare('UPDATE users SET wallet_points = wallet_points + ?2 WHERE user_id = ?1')
        .bind(userId, points)
        .run();
    },

    async getWalletPoints(userId) {
      const row = await db
        .prepare('SELECT wallet_points FROM users WHERE user_id = ?1 LIMIT 1')
        .bind(userId)
        .first();
      return Number(row?.wallet_points) || 0;
    },

    async getWalletBalance(userId) {
      const row = await db.prepare('SELECT wallet_balance FROM users WHERE user_id = ?1 LIMIT 1').bind(userId).first();
      return Number(row?.wallet_balance) || 0;
    },

    async addWalletBalance(userId, amount) {
      await db.prepare('UPDATE users SET wallet_balance = wallet_balance + ?2 WHERE user_id = ?1')
        .bind(userId, Math.round(amount)).run();
    },

    // Conditional debit: only deducts if balance is sufficient, in one atomic statement.
    // Returns true if the debit happened. Guards against double-tap overdraft where a
    // read-then-write (getWalletBalance + addWalletBalance) could drive balance negative.
    async debitWalletIfSufficient(userId, amount) {
      const amt = Math.round(amount);
      if (amt <= 0) return true;
      const result = await db
        .prepare('UPDATE users SET wallet_balance = wallet_balance - ?2 WHERE user_id = ?1 AND wallet_balance >= ?2')
        .bind(userId, amt)
        .run();
      return (result?.meta?.changes || 0) > 0;
    },

    // Idempotent refund of the wallet portion applied to an order. Used on cancel/expire/fail
    // paths so a buyer who paid via internal balance is made whole. The wallet_refunded flag
    // is flipped atomically FIRST (flip-first: a crash before the credit under-refunds once,
    // which is safer than the double-credit a credit-first ordering would risk). Returns the
    // amount credited (0 if nothing to refund / already refunded).
    async refundOrderWallet(orderId) {
      const order = await db
        .prepare('SELECT user_id, wallet_applied, wallet_refunded FROM orders WHERE id = ?1 LIMIT 1')
        .bind(orderId)
        .first();
      const applied = Math.round(Number(order?.wallet_applied) || 0);
      if (!order || applied <= 0 || order.wallet_refunded) return 0;
      const claim = await db
        .prepare('UPDATE orders SET wallet_refunded = 1 WHERE id = ?1 AND wallet_refunded = 0 AND wallet_applied > 0')
        .bind(orderId)
        .run();
      if (!(claim?.meta?.changes > 0)) return 0;
      await db
        .prepare('UPDATE users SET wallet_balance = wallet_balance + ?2 WHERE user_id = ?1')
        .bind(order.user_id, applied)
        .run();
      return applied;
    },

    async countPaidOrders(userId) {
      const row = await db
        .prepare("SELECT COUNT(*) AS n FROM orders WHERE user_id = ?1 AND status IN ('paid', 'delivered')")
        .bind(userId)
        .first();
      return Number(row?.n) || 0;
    },

    async createRefundRequest(orderId, userId, reason = '') {
      const result = await db
        .prepare(`INSERT INTO refund_requests (order_id, user_id, reason) VALUES (?1, ?2, ?3)`)
        .bind(orderId, userId, reason)
        .run();
      return result?.meta?.last_row_id || null;
    },

    // Atomic refund approval: flip refund_requested→refunded in one statement so a
    // double-tapped Approve can only credit once. Returns true for the winning caller.
    // Also flips wallet_refunded=1 so the wallet portion can't be re-credited later via
    // refundOrderWallet (shared idempotency flag across both refund mechanisms).
    async claimRefundApproval(orderId) {
      const result = await db
        .prepare("UPDATE orders SET status = 'refunded', wallet_refunded = 1 WHERE id = ?1 AND status = 'refund_requested'")
        .bind(orderId)
        .run();
      return (result?.meta?.changes || 0) > 0;
    },

    // Atomic refund rejection: flip refund_requested→delivered only if still pending review.
    // Prevents a concurrent reject from clobbering an order that approve already moved to
    // 'refunded' (which would re-open it for a second refund). Returns true for the winner.
    async claimRefundRejection(orderId) {
      const result = await db
        .prepare("UPDATE orders SET status = 'delivered' WHERE id = ?1 AND status = 'refund_requested'")
        .bind(orderId)
        .run();
      return (result?.meta?.changes || 0) > 0;
    },

    // Update the latest refund_requests row for an order (approved | rejected), preserving
    // historical rows so reject→re-request→approve keeps an accurate audit trail.
    async updateRefundStatus(orderId, status) {
      await db
        .prepare("UPDATE refund_requests SET status = ?2, updated_at = datetime('now') WHERE id = (SELECT id FROM refund_requests WHERE order_id = ?1 ORDER BY id DESC LIMIT 1)")
        .bind(orderId, status)
        .run();
    },

    async getProducts(limit = 100) {
      // Untuk produk unlimited (digital file), stock_count selalu 999999 (UI menampilkan ∞).
      const lim = Math.max(1, Math.min(Number(limit) || 100, 500));
      const sql = `
        SELECT p.*, CASE
          WHEN p.is_unlimited_stock = 1 THEN 999999
          ELSE (
            SELECT COUNT(*) FROM stock_items s
            WHERE s.product_id = p.id AND s.is_sold = 0
          )
        END AS stock_count,
        (
          SELECT COUNT(*) FROM orders o
          WHERE o.product_id = p.id AND (o.status = 'paid' OR o.status = 'delivered')
        ) AS sales_count
        FROM products p
        WHERE p.is_active = 1
        ORDER BY p.id ASC
        LIMIT ?1`;
      const { results } = await db.prepare(sql).bind(lim).all();
      return results || [];
    },

    async getProductsByPopular(limit = 100) {
      // Sort by jumlah penjualan (order paid/delivered) desc, lalu id asc.
      const lim = Math.max(1, Math.min(Number(limit) || 100, 500));
      const sql = `
        SELECT p.*, CASE
          WHEN p.is_unlimited_stock = 1 THEN 999999
          ELSE (
            SELECT COUNT(*) FROM stock_items s
            WHERE s.product_id = p.id AND s.is_sold = 0
          )
        END AS stock_count,
        (
          SELECT COUNT(*) FROM orders o
          WHERE o.product_id = p.id AND (o.status = 'paid' OR o.status = 'delivered')
        ) AS sales_count
        FROM products p
        WHERE p.is_active = 1
        ORDER BY sales_count DESC, p.id ASC
        LIMIT ?1`;
      const { results } = await db.prepare(sql).bind(lim).all();
      return results || [];
    },

    async searchProducts(keyword, limit = 100) {
      const kw = `%${String(keyword || '').trim()}%`;
      const lim = Math.max(1, Math.min(Number(limit) || 100, 500));
      const sql = `
        SELECT p.*, CASE
          WHEN p.is_unlimited_stock = 1 THEN 999999
          ELSE (
            SELECT COUNT(*) FROM stock_items s
            WHERE s.product_id = p.id AND s.is_sold = 0
          )
        END AS stock_count
        FROM products p
        WHERE p.is_active = 1 AND (p.name LIKE ?1 OR p.description LIKE ?1 OR p.category LIKE ?1)
        ORDER BY p.id ASC
        LIMIT ?2`;
      const { results } = await db.prepare(sql).bind(kw, lim).all();
      return results || [];
    },


    async getProductById(id) {
      const sql = `
        SELECT p.*, CASE
          WHEN p.is_unlimited_stock = 1 THEN 999999
          ELSE (
            SELECT COUNT(*) FROM stock_items s
            WHERE s.product_id = p.id AND s.is_sold = 0
          )
        END AS stock_count
        FROM products p
        WHERE p.id = ?1
        LIMIT 1`;
      const row = await db.prepare(sql).bind(id).first();
      return row || null;
    },

    async addProduct({ name, description, price, category, product_image_url = null, is_unlimited_stock = 0, digital_file_pointer = null, delivery_note = null, terms_url = null }) {
      const result = await db
        .prepare(
          `INSERT INTO products (name, description, price, category, product_image_url, is_unlimited_stock, digital_file_pointer, delivery_note, terms_url, is_active, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, ?10)`
        )
        .bind(
          name,
          description || '',
          price,
          category || 'Umum',
          product_image_url,
          is_unlimited_stock ? 1 : 0,
          is_unlimited_stock ? (digital_file_pointer || null) : null,
          delivery_note || null,
          terms_url || null,
          nowIso(),
        )
        .run();
      return result.meta.last_row_id;
    },

    // Import produk supplier ke katalog buyer (dengan markup + link supplier).
    async addSupplierProductToCatalog({ name, description, price, category, supplier_id, supplier_external_id }) {
      const result = await db
        .prepare(`INSERT INTO products (name, description, price, category, is_unlimited_stock, is_active, supplier_id, supplier_external_id, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, 1, 1, ?5, ?6, ?7, ?7)`)
        .bind(name, description || '', price, category || 'Aggregator', supplier_id, supplier_external_id, nowIso())
        .run();
      return result.meta.last_row_id;
    },

    // Cek produk katalog yg udah ke-link ke supplier_external_id tertentu (anti-duplikat).
    async findCatalogBySupplierExt(supplierId, extId) {
      return await db.prepare('SELECT * FROM products WHERE supplier_id = ?1 AND supplier_external_id = ?2 LIMIT 1')
        .bind(supplierId, extId).first();
    },

    // Update harga produk katalog yg udah ter-link supplier (buat re-import termurah).
    async updateCatalogPrice(productId, price) {
      await db.prepare("UPDATE products SET price = ?2, updated_at = datetime('now') WHERE id = ?1")
        .bind(productId, price).run();
    },

    async updateProductName(productId, name) {
      await db.prepare("UPDATE products SET name = ?2, updated_at = datetime('now') WHERE id = ?1")
        .bind(productId, name).run();
    },

    // Cari produk katalog by judul (buat filtering termurah lintas-supplier).
    async findCatalogByTitle(title) {
      return await db.prepare('SELECT * FROM products WHERE name = ?1 LIMIT 1').bind(title).first();
    },

    // Re-link produk katalog ke supplier lain (yg lebih murah) + update harga.
    async relinkCatalogProduct(productId, supplierId, extId, price) {
      await db.prepare("UPDATE products SET supplier_id = ?2, supplier_external_id = ?3, price = ?4, updated_at = datetime('now') WHERE id = ?1")
        .bind(productId, supplierId, extId, price).run();
    },

    async updateProduct(id, data) {
      await db
        .prepare(
          `UPDATE products
            SET name = ?1, description = ?2, price = ?3, category = ?4, product_image_url = ?5,
                is_unlimited_stock = ?6, digital_file_pointer = ?7,
                delivery_note = ?8, terms_url = ?9, updated_at = ?10
            WHERE id = ?11`
        )
        .bind(
          data.name,
          data.description || '',
          data.price,
          data.category || 'Umum',
          data.product_image_url || null,
          data.is_unlimited_stock ? 1 : 0,
          data.is_unlimited_stock ? (data.digital_file_pointer || null) : null,
          data.delivery_note || null,
          data.terms_url || null,
          nowIso(),
          id,
        )
        .run();
    },

    async deleteProduct(id) {
      await db.prepare('DELETE FROM products WHERE id = ?1').bind(id).run();
    },

    async listStock(productId) {
      const { results } = await db
        .prepare('SELECT * FROM stock_items WHERE product_id = ?1 ORDER BY is_sold ASC, id DESC')
        .bind(productId)
        .all();
      return results || [];
    },

    async addStockItems(productId, items) {
      const statements = items.map((item) =>
        db.prepare('INSERT INTO stock_items (product_id, data, is_sold, created_at) VALUES (?1, ?2, 0, ?3)').bind(productId, item, nowIso())
      );
      if (statements.length > 0) {
        await db.batch(statements);
      }
      return items.length;
    },

    async deleteUnsoldStockById(stockId) {
      await db.prepare('DELETE FROM stock_items WHERE id = ?1 AND is_sold = 0').bind(stockId).run();
    },

    // Atomic claim: SQLite serializes writes, so concurrent calls flip DISJOINT rows in Step 1.
    // The race was only in Step 2 reading shared is_sold=2 state — scoped now via sold_in_order_id.
    async reserveStock(productId, quantity, orderId = null) {
      // Step 1: claim N oldest unsold rows (is_sold=2) AND tag them with this order.
      await db
        .prepare(
          `UPDATE stock_items SET is_sold = 2, sold_in_order_id = ?3
           WHERE id IN (
             SELECT id FROM stock_items
             WHERE product_id = ?1 AND is_sold = 0
             ORDER BY id ASC LIMIT ?2
           )`
        )
        .bind(productId, quantity, orderId)
        .run();
      // Step 2: fetch ONLY the rows THIS call reserved (scoped by order id),
      // never another concurrent buyer's reserved rows → no double-claim/double-delivery.
      const { results } = await db
        .prepare('SELECT id, data FROM stock_items WHERE product_id = ?1 AND is_sold = 2 AND sold_in_order_id = ?2 ORDER BY id ASC LIMIT ?3')
        .bind(productId, orderId, quantity)
        .all();
      return results || [];
    },

    async markStockSold(stockIds, userId, orderId = null) {
      if (!stockIds.length) return;
      const stamp = nowIso();
      const statements = stockIds.map((id) =>
        db
          .prepare('UPDATE stock_items SET is_sold = 1, sold_to_user_id = ?1, sold_at = ?2, sold_in_order_id = ?3 WHERE id = ?4 AND is_sold = 2')
          .bind(userId, stamp, orderId, id)
      );
      await db.batch(statements);
    },

    async markStockUnsold(stockIds) {
      if (!stockIds.length) return;
      const statements = stockIds.map((id) =>
        db
          .prepare('UPDATE stock_items SET is_sold = 0, sold_to_user_id = NULL, sold_at = NULL, sold_in_order_id = NULL WHERE id = ?1')
          .bind(id)
      );
      await db.batch(statements);
    },

    // Lepas reservasi basi: baris is_sold=2 (reserved) yang order-nya udah failed/expired/cancelled
    // ATAU order-nya udah gak ada (NULL/yatim) → balikin ke is_sold=0 biar stok gak nyangkut selamanya.
    // Dipanggil cron. Mengembalikan jumlah baris yang dibebaskan.
    async releaseStaleReservations() {
      const result = await db
        .prepare(
          `UPDATE stock_items
             SET is_sold = 0, sold_to_user_id = NULL, sold_at = NULL, sold_in_order_id = NULL
           WHERE is_sold = 2 AND (
             sold_in_order_id IS NULL
             OR sold_in_order_id NOT IN (SELECT id FROM orders)
             OR sold_in_order_id IN (
               SELECT id FROM orders WHERE status IN ('failed','expired','cancelled')
             )
           )`
        )
        .run();
      return result?.meta?.changes || 0;
    },

    async createOrderIfStockAvailable(order) {
      const now = nowIso();
      // Untuk produk unlimited (digital file), tidak ada cek stock_items karena stok = unlimited.
      // Cek pendingnya tetap dilakukan secara terpisah di handler (existing pending guard).
      const result = await db
        .prepare(
          `INSERT INTO orders (
            user_id, username, first_name, product_id, product_name,
            quantity, unit_price, price, payment_provider, transaction_id, qr_string,
            status, created_at, expires_at, wallet_applied
          )
          SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'pending', ?12, ?13, ?15
          WHERE (
            SELECT is_unlimited_stock FROM products WHERE id = ?4
          ) = 1
          OR (
            (
              SELECT COUNT(*)
              FROM stock_items s
              WHERE s.product_id = ?4 AND s.is_sold = 0
            ) - (
              SELECT COALESCE(SUM(o.quantity), 0)
              FROM orders o
              WHERE o.product_id = ?4
                AND o.status = 'pending'
                AND (o.expires_at IS NULL OR o.expires_at > ?14)
            )
          ) >= ?6`
        )
        .bind(
          order.user_id,
          order.username || '',
          order.first_name || '',
          order.product_id,
          order.product_name,
          order.quantity,
          order.unit_price,
          order.price,
          order.payment_provider || 'violet',
          order.transaction_id || null,
          order.qr_string || null,
          now,
          order.expires_at,
          now,
          Math.round(Number(order.wallet_applied) || 0)
        )
        .run();

      if (!result?.meta?.changes) {
        return null;
      }

      return result.meta.last_row_id;
    },

    async updateOrderStatus(orderId, status) {
      const paidAt = status === 'paid' ? nowIso() : null;
      const deliveredAt = status === 'delivered' ? nowIso() : null;
      await db
        .prepare('UPDATE orders SET status = ?1, paid_at = COALESCE(?2, paid_at), delivered_at = COALESCE(?3, delivered_at) WHERE id = ?4')
        .bind(status, paidAt, deliveredAt, orderId)
        .run();
    },

    // Atomic cancel: only flips pending→cancelled in one statement. Returns true if it claimed
    // the row. Prevents a TOCTOU where cron/webhook delivers the order between the caller's
    // snapshot read and the cancel — an unconditional UPDATE would clobber 'delivered'→'cancelled'
    // and let refundOrderWallet credit a buyer who already got the product.
    async cancelOrderIfPending(orderId) {
      const result = await db
        .prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?1 AND status = 'pending'")
        .bind(orderId)
        .run();
      return (result?.meta?.changes || 0) > 0;
    },

    // Atomic delivery claim: flip pending→paid in one statement. SQLite serializes writes,
    // so when the webhook and cron race the same order, only ONE call changes a row.
    // Returns true only for the caller that won the claim → guards against double-delivery.
    async claimOrderForDelivery(orderId) {
      const result = await db
        .prepare("UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, ?2) WHERE id = ?1 AND status = 'pending'")
        .bind(orderId, nowIso())
        .run();
      return (result?.meta?.changes || 0) > 0;
    },

    async setOrderDeliveryPayload(orderId, payload) {
      await db
        .prepare('UPDATE orders SET delivery_payload = ?1 WHERE id = ?2')
        .bind(payload ? JSON.stringify(payload) : null, orderId)
        .run();
    },

    async getOrderById(orderId) {
      return db.prepare('SELECT * FROM orders WHERE id = ?1 LIMIT 1').bind(orderId).first();
    },

    async getOrderDeliveryByUser(orderId, userId) {
      const row = await db
        .prepare('SELECT id, status, delivery_payload, delivered_at FROM orders WHERE id = ?1 AND user_id = ?2 LIMIT 1')
        .bind(orderId, userId)
        .first();
      return row || null;
    },

    async createDownloadToken({ token, orderId, userId, objectKey, expiresAt, maxDownloads = 5 }) {
      await db
        .prepare(
          `INSERT INTO download_tokens (token, order_id, user_id, object_key, expires_at, max_downloads, download_count, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)`
        )
        .bind(token, orderId, userId, objectKey, expiresAt, maxDownloads, nowIso())
        .run();
    },

    async getDownloadToken(token) {
      const row = await db
        .prepare('SELECT * FROM download_tokens WHERE token = ?1 LIMIT 1')
        .bind(token)
        .first();
      return row || null;
    },

    async incrementDownloadCount(token) {
      await db
        .prepare('UPDATE download_tokens SET download_count = download_count + 1 WHERE token = ?1')
        .bind(token)
        .run();
    },

    async getOrderByTransactionId(txId) {
      return db.prepare('SELECT * FROM orders WHERE transaction_id = ?1 LIMIT 1').bind(txId).first();
    },

    async getOrdersByUser(userId, limit = 10) {
      const { results } = await db
        .prepare('SELECT * FROM orders WHERE user_id = ?1 ORDER BY id DESC LIMIT ?2')
        .bind(userId, limit)
        .all();
      return results || [];
    },

    // Ambil daftar buyer unique dari produk tertentu yang status order-nya
    // paid/delivered (legit buyer). Dipakai untuk fitur auto-notify update.
    async getProductBuyers(productId) {
      const { results } = await db
        .prepare(
          `SELECT DISTINCT user_id, MAX(id) AS latest_order_id, MAX(first_name) AS first_name, MAX(username) AS username
           FROM orders
           WHERE product_id = ?1
             AND (status = 'paid' OR status = 'delivered')
           GROUP BY user_id
           ORDER BY user_id ASC`,
        )
        .bind(productId)
        .all();
      return results || [];
    },

    async getAllOrders(limit = 100) {
      const { results } = await db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT ?1').bind(limit).all();
      return results || [];
    },

    async getPendingOrdersForSync() {
      const { results } = await db
        .prepare("SELECT * FROM orders WHERE status = 'pending' ORDER BY id ASC")
        .all();
      return results || [];
    },

    // Pending QRIS (Violet) orders for admin manual-confirm. Violet has no status
    // re-query API, so a missed webhook strands a paid order; this lets the owner
    // recover it. Excludes already-expired orders.
    async getPendingVioletOrders(limit = 20) {
      const { results } = await db
        .prepare(
          `SELECT * FROM orders
             WHERE status = 'pending'
               AND LOWER(payment_provider) = 'violet'
               AND (expires_at IS NULL OR expires_at > ?2)
             ORDER BY id DESC LIMIT ?1`
        )
        .bind(limit, nowIso())
        .all();
      return results || [];
    },

    async getSetting(key, fallback = '') {
      const row = await db.prepare('SELECT value FROM settings WHERE key = ?1 LIMIT 1').bind(key).first();
      return row?.value ?? fallback;
    },

    async setSetting(key, value) {
      await db
        .prepare(
          `INSERT INTO settings (key, value) VALUES (?1, ?2)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        )
        .bind(key, value)
        .run();
    },

    async getDashboardStats() {
      // Periode rolling untuk perbandingan dashboard.
      const now = new Date();
      const startOfTodayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfYesterdayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
      const startOf7dIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const startOf14dIso = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

      const [
        products,
        users,
        pendingOrders,
        paidOrders,
        revenue,
        revenueToday,
        revenueYesterday,
        ordersToday,
        revenue7d,
        ordersLast7d,
        sparkRows,
        newUsers7d,
      ] = await Promise.all([
        db.prepare('SELECT COUNT(*) AS count FROM products WHERE is_active = 1').first(),
        db.prepare('SELECT COUNT(*) AS count FROM users').first(),
        db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'pending'").first(),
        db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'paid' OR status = 'delivered'").first(),
        db.prepare("SELECT COALESCE(SUM(price), 0) AS total FROM orders WHERE status = 'paid' OR status = 'delivered'").first(),
        db
          .prepare(
            `SELECT COALESCE(SUM(price), 0) AS total
             FROM orders
             WHERE (status = 'paid' OR status = 'delivered')
               AND created_at >= ?1`,
          )
          .bind(startOfTodayIso)
          .first(),
        db
          .prepare(
            `SELECT COALESCE(SUM(price), 0) AS total
             FROM orders
             WHERE (status = 'paid' OR status = 'delivered')
               AND created_at >= ?1 AND created_at < ?2`,
          )
          .bind(startOfYesterdayIso, startOfTodayIso)
          .first(),
        db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM orders
             WHERE created_at >= ?1`,
          )
          .bind(startOfTodayIso)
          .first(),
        db
          .prepare(
            `SELECT COALESCE(SUM(price), 0) AS total
             FROM orders
             WHERE (status = 'paid' OR status = 'delivered')
               AND created_at >= ?1`,
          )
          .bind(startOf7dIso)
          .first(),
        db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM orders
             WHERE (status = 'paid' OR status = 'delivered')
               AND created_at >= ?1`,
          )
          .bind(startOf7dIso)
          .first(),
        db
          .prepare(
            `SELECT substr(created_at, 1, 10) AS day, COALESCE(SUM(price), 0) AS revenue, COUNT(*) AS orders
             FROM orders
             WHERE (status = 'paid' OR status = 'delivered')
               AND created_at >= ?1
             GROUP BY day
             ORDER BY day ASC`,
          )
          .bind(startOf14dIso)
          .all(),
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM users WHERE created_at >= ?1`,
          )
          .bind(startOf7dIso)
          .first(),
      ]);

      // Build 14 day sparkline series, isi 0 untuk hari yang tidak ada transaksi.
      const sparkMap = Object.fromEntries((sparkRows?.results || []).map((r) => [r.day, r]));
      const spark = [];
      for (let i = 13; i >= 0; i -= 1) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const day = d.toISOString().slice(0, 10);
        const row = sparkMap[day];
        spark.push({
          day,
          label: day.slice(5),
          revenue: Number(row?.revenue || 0),
          orders: Number(row?.orders || 0),
        });
      }

      return {
        totalProducts: Number(products?.count || 0),
        totalUsers: Number(users?.count || 0),
        pendingOrders: Number(pendingOrders?.count || 0),
        paidOrders: Number(paidOrders?.count || 0),
        totalRevenue: Number(revenue?.total || 0),
        revenueToday: Number(revenueToday?.total || 0),
        revenueYesterday: Number(revenueYesterday?.total || 0),
        ordersToday: Number(ordersToday?.count || 0),
        revenue7d: Number(revenue7d?.total || 0),
        ordersLast7d: Number(ordersLast7d?.count || 0),
        newUsers7d: Number(newUsers7d?.count || 0),
        spark,
      };
    },

    // Agregasi laporan DI SQL (bukan di browser) — lepas dari cap orders 200.
    // Mengembalikan shape yang identik dengan reportSummary lama di admin App.jsx.
    async getReportAggregates(period = '30d') {
      const paid = "(status = 'paid' OR status = 'delivered')";
      const now = new Date();
      const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : null;
      const periodStartDate = periodDays ? new Date(now.getTime() - periodDays * 86400000) : null;
      const prevStartDate = periodDays ? new Date(now.getTime() - periodDays * 2 * 86400000) : null;
      // periodStart epoch = "all time"; prevStart == periodStart bikin window sebelumnya kosong.
      const periodStart = periodStartDate ? periodStartDate.toISOString() : '1970-01-01T00:00:00.000Z';
      const prevStart = prevStartDate ? prevStartDate.toISOString() : periodStart;
      const useDaily = !periodDays || periodDays <= 30;

      const [cur, prev, totalOrdersRow, statusRows, seriesRows, topRows] = await Promise.all([
        db.prepare(`SELECT COALESCE(SUM(price),0) AS total, COUNT(*) AS cnt FROM orders WHERE ${paid} AND created_at >= ?1`).bind(periodStart).first(),
        db.prepare(`SELECT COALESCE(SUM(price),0) AS total, COUNT(*) AS cnt FROM orders WHERE ${paid} AND created_at >= ?1 AND created_at < ?2`).bind(prevStart, periodStart).first(),
        db.prepare('SELECT COUNT(*) AS cnt FROM orders WHERE created_at >= ?1').bind(periodStart).first(),
        db.prepare('SELECT status, COUNT(*) AS cnt FROM orders WHERE created_at >= ?1 GROUP BY status').bind(periodStart).all(),
        db.prepare(`SELECT substr(created_at,1,${useDaily ? 10 : 7}) AS k, COALESCE(SUM(price),0) AS revenue, COUNT(*) AS orders FROM orders WHERE ${paid} AND created_at >= ?1 GROUP BY k`).bind(periodStart).all(),
        db.prepare(`SELECT product_name AS name, product_id, COALESCE(SUM(price),0) AS revenue, COUNT(*) AS orders FROM orders WHERE ${paid} AND created_at >= ?1 GROUP BY product_name, product_id ORDER BY revenue DESC LIMIT 5`).bind(periodStart).all(),
      ]);

      const paidRevenue = Number(cur?.total || 0);
      const paidOrders = Number(cur?.cnt || 0);
      const previousRevenue = Number(prev?.total || 0);
      const previousPaidOrders = Number(prev?.cnt || 0);
      const totalOrders = Number(totalOrdersRow?.cnt || 0);
      const aov = paidOrders ? Math.round(paidRevenue / paidOrders) : 0;
      const conversionRate = totalOrders ? Math.round((paidOrders / totalOrders) * 1000) / 10 : 0;
      const calcGrowth = (c, p) => (!p ? (c ? 100 : 0) : Math.round(((c - p) / p) * 1000) / 10);

      // Bangun skeleton time-series zero-filled lalu isi dari hasil GROUP BY.
      const bucket = Object.fromEntries((seriesRows?.results || []).map((r) => [r.k, r]));
      const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const series = [];
      if (useDaily) {
        const days = periodDays || 30;
        for (let i = days - 1; i >= 0; i -= 1) {
          const d = new Date(now.getTime() - i * 86400000);
          const key = d.toISOString().slice(0, 10);
          const row = bucket[key];
          series.push({ key, label: key.slice(5), revenue: Number(row?.revenue || 0), orders: Number(row?.orders || 0), ts: d.getTime() });
        }
      } else {
        const months = periodDays === 90 ? 3 : 12;
        const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
        for (let i = 0; i < months; i += 1) {
          const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const row = bucket[key];
          series.push({ key, label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, revenue: Number(row?.revenue || 0), orders: Number(row?.orders || 0), ts: d.getTime() });
        }
      }
      const peak = series.reduce((best, c) => (c.revenue > best.revenue ? c : best), { revenue: 0, label: '-' });
      const statusCount = Object.fromEntries((statusRows?.results || []).map((r) => [r.status, Number(r.cnt || 0)]));
      const topProducts = (topRows?.results || []).map((r) => ({ name: r.name || `#${r.product_id}`, revenue: Number(r.revenue || 0), orders: Number(r.orders || 0) }));

      return {
        periodDays,
        paidRevenue,
        previousRevenue,
        revenueGrowth: calcGrowth(paidRevenue, previousRevenue),
        paidOrders,
        previousPaidOrders,
        ordersGrowth: calcGrowth(paidOrders, previousPaidOrders),
        aov,
        conversionRate,
        totalOrders,
        series,
        seriesMode: useDaily ? 'daily' : 'monthly',
        peak,
        topProducts,
        statusCount,
      };
    },

    async getPublicStats() {
      const [products, users, paidOrders] = await Promise.all([
        db.prepare('SELECT COUNT(*) AS count FROM products WHERE is_active = 1').first(),
        db.prepare('SELECT COUNT(*) AS count FROM users').first(),
        db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'paid' OR status = 'delivered'").first(),
      ]);
      return {
        totalProducts: Number(products?.count || 0),
        totalUsers: Number(users?.count || 0),
        totalSales: Number(paidOrders?.count || 0),
      };
    },
    async getAllUsers(limit = 5000) {
      const safeLimit = Math.min(10000, Math.max(1, Number(limit || 5000)));
      const { results } = await db
        .prepare('SELECT user_id, username, first_name FROM users ORDER BY last_active DESC LIMIT ?1')
        .bind(safeLimit)
        .all();
      return results || [];
    },

    // Stream user aktif (belum block bot) per page untuk broadcast.
    // Pakai keyset pagination via user_id agar konsisten saat dipanggil berulang.
    async getActiveUsersPage({ afterUserId = 0, pageSize = 500 } = {}) {
      const safePageSize = Math.min(2000, Math.max(1, Number(pageSize || 500)));
      const cursor = Number(afterUserId) || 0;
      const { results } = await db
        .prepare(
          `SELECT user_id, username, first_name
           FROM users
           WHERE is_blocked = 0 AND user_id > ?1
           ORDER BY user_id ASC
           LIMIT ?2`,
        )
        .bind(cursor, safePageSize)
        .all();
      return results || [];
    },

    async countActiveUsers() {
      const row = await db.prepare('SELECT COUNT(*) AS count FROM users WHERE is_blocked = 0').first();
      return Number(row?.count || 0);
    },

    async markUserBlocked(userId) {
      await db
        .prepare('UPDATE users SET is_blocked = 1, blocked_at = ?1 WHERE user_id = ?2')
        .bind(nowIso(), userId)
        .run();
    },

    async createBroadcastJob({ message, buttonText, buttonUrl, recipients }) {
      const result = await db
        .prepare(
          `INSERT INTO broadcast_jobs (status, message, button_text, button_url, recipients, created_at)
           VALUES ('queued', ?1, ?2, ?3, ?4, ?5)`,
        )
        .bind(message, buttonText || null, buttonUrl || null, recipients, nowIso())
        .run();
      return result.meta.last_row_id;
    },

    async markBroadcastJobRunning(jobId) {
      await db
        .prepare("UPDATE broadcast_jobs SET status = 'running', started_at = ?1 WHERE id = ?2")
        .bind(nowIso(), jobId)
        .run();
    },

    async incrementBroadcastJobCounters(jobId, { sent = 0, failed = 0, blocked = 0 } = {}) {
      if (!sent && !failed && !blocked) return;
      await db
        .prepare(
          `UPDATE broadcast_jobs
            SET sent = sent + ?1, failed = failed + ?2, blocked = blocked + ?3
            WHERE id = ?4`,
        )
        .bind(Number(sent || 0), Number(failed || 0), Number(blocked || 0), jobId)
        .run();
    },

    async finishBroadcastJob(jobId, { status = 'done', lastError = null } = {}) {
      await db
        .prepare(
          `UPDATE broadcast_jobs
            SET status = ?1, last_error = ?2, finished_at = ?3
            WHERE id = ?4`,
        )
        .bind(status, lastError, nowIso(), jobId)
        .run();
    },

    async getBroadcastJob(jobId) {
      return db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?1 LIMIT 1').bind(jobId).first();
    },

    async getRecentBroadcastJobs(limit = 5) {
      const safeLimit = Math.min(50, Math.max(1, Number(limit || 5)));
      const { results } = await db
        .prepare('SELECT * FROM broadcast_jobs ORDER BY id DESC LIMIT ?1')
        .bind(safeLimit)
        .all();
      return results || [];
    },

    async getUsersOverview(limit = 500) {
      const safeLimit = Math.min(2000, Math.max(1, Number(limit || 500)));
      const sql = `
        SELECT
          u.user_id,
          u.username,
          u.first_name,
          u.last_active,
          COALESCE((SELECT COUNT(*) FROM orders o WHERE o.user_id = u.user_id), 0) AS total_orders,
          COALESCE((SELECT COUNT(*) FROM orders o WHERE o.user_id = u.user_id AND (o.status = 'paid' OR o.status = 'delivered')), 0) AS paid_orders,
          COALESCE((SELECT SUM(o.price) FROM orders o WHERE o.user_id = u.user_id AND (o.status = 'paid' OR o.status = 'delivered')), 0) AS total_spent
        FROM users u
        ORDER BY u.last_active DESC
        LIMIT ?1`;
      const { results } = await db.prepare(sql).bind(safeLimit).all();
      return results || [];
    },

    // === SUPPLIER MANAGER (aggregator) ===
    async getSuppliers() {
      const { results } = await db.prepare('SELECT * FROM suppliers ORDER BY id ASC').all();
      return results || [];
    },

    async getSupplierById(id) {
      return await db.prepare('SELECT * FROM suppliers WHERE id = ?1').bind(id).first();
    },

    async createSupplier({ name, api_key, base_url }) {
      const r = await db.prepare('INSERT INTO suppliers (name, api_key, base_url) VALUES (?1, ?2, ?3)')
        .bind(name, api_key, base_url).run();
      return r?.meta?.last_row_id;
    },

    async updateSupplier(id, { name, api_key, base_url, is_active }) {
      await db.prepare("UPDATE suppliers SET name=?2, api_key=?3, base_url=?4, is_active=?5, updated_at=datetime('now') WHERE id=?1")
        .bind(id, name, api_key, base_url, is_active ?? 1).run();
    },

    async deleteSupplier(id) {
      await db.prepare('DELETE FROM supplier_products WHERE supplier_id=?1').bind(id).run();
      await db.prepare('DELETE FROM suppliers WHERE id=?1').bind(id).run();
    },

    async upsertSupplierProduct(supplierId, extId, title, price, currency, desc, available) {
      await db.prepare(`INSERT INTO supplier_products (supplier_id, external_id, title, price, currency, description, available, synced_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7, datetime('now'))
        ON CONFLICT(supplier_id, external_id) DO UPDATE SET
          title=excluded.title, price=excluded.price, currency=excluded.currency,
          description=excluded.description, available=excluded.available, synced_at=datetime('now')`)
        .bind(supplierId, extId, title, price, currency, desc, available ? 1 : 0).run();
    },

    async getSupplierProducts(supplierId) {
      const { results } = await db.prepare('SELECT * FROM supplier_products WHERE supplier_id=?1').bind(supplierId).all();
      return results || [];
    },

    async countSupplierProducts(supplierId) {
      const row = await db.prepare('SELECT COUNT(*) AS n FROM supplier_products WHERE supplier_id=?1 AND available=1').bind(supplierId).first();
      return Number(row?.n) || 0;
    },

    async updateSupplierSyncCount(id, count) {
      await db.prepare("UPDATE suppliers SET products_count = ?2, last_sync_at = datetime('now') WHERE id = ?1")
        .bind(id, count).run();
    },

    async setSupplierMarkup(id, percent) {
      await db.prepare('UPDATE suppliers SET markup_percent = ?2 WHERE id = ?1').bind(id, percent).run();
    },

    async queueSupplierFulfillment(orderId, supplierId, extId, qty, status, reason) {
      const r = await db.prepare(`INSERT INTO supplier_fulfillment_queue
        (order_id, supplier_id, supplier_external_id, quantity, status, reason)
        VALUES (?1,?2,?3,?4,?5,?6)`)
        .bind(orderId, supplierId, extId, qty, status || 'queued', reason || null).run();
      return r?.meta?.last_row_id;
    },

    async updateQueueStatus(queueId, status, reason) {
      await db.prepare("UPDATE supplier_fulfillment_queue SET status=?2, reason=?3, updated_at=datetime('now') WHERE id=?1")
        .bind(queueId, status, reason || null).run();
    },

    async getQueuedFulfillments() {
      const { results } = await db.prepare("SELECT * FROM supplier_fulfillment_queue WHERE status='queued' ORDER BY id ASC").all();
      return results || [];
    },

    async insertAudit(action, actor, payload = null) {
      await db
        .prepare('INSERT INTO admin_audit_logs (action, actor, payload, created_at) VALUES (?1, ?2, ?3, ?4)')
        .bind(action, actor, payload ? JSON.stringify(payload) : null, nowIso())
        .run();
    },
  };
}
