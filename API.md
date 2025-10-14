# 🔐 Auth Routes
| Endpoint                | Method   | Status | Notes                                                                 |
| ----------------------- | -------- | ------ | --------------------------------------------------------------------- |
| `/auth/login`           | **POST** | ✅     | Public. Body: `{ email, password }`. Return access & refresh token.      |
| `/auth/register`        | **POST** | ✅     | Public. Body: `{ username, email, password, role? }`. Default role=user. |
| `/auth/refresh`         | **POST** | ✅     | Public. Refresh access token pakai refresh token (cookie).               |
| `/auth/forgot-password` | **POST** | ✅     | Public. Body: `{ email }`. Kirim OTP (berlaku 5 menit) ke email.         |
| `/auth/reset-password`  | **PUT**  | ✅     | Public. Body: `{ email, otp, newPassword }`. Verifikasi OTP & reset.     |
| `/auth/logout`          | **POST** | ✅     | Public. Hapus access token, refresh token, dan cookies.                  |
| `/auth/verify`          | **GET**  | ✅     | Requires JWT. Validasi token, return info user + role.                   |



# 👤 User Routes
| No | Kategori   | Endpoint                                  | Method     | Status | Notes                                                                   |
| -- | ---------- | ----------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------- |
| 1  | 🛍️ Produk | `/api/categories/:id/products`            | **GET**    | ✅      | Public. Param: `id`. Query: `page`, `limit`. Cache 5m.                  |
| 2  | 🛍️ Produk | `/api/products`                           | **GET**    | ✅      | Public. Ambil semua produk.                                             |
| 3  | 🛍️ Produk | `/api/products/:id`                       | **GET**    | ✅      | Public. Param: `id`. Return produk + info penjual. Cache 1h.            |
| 4  | 👤 User    | `/api/users/me`                           | **GET**    | ✅      | Requires JWT. Return profil + alamat. No-store cache.                   |
| 5  | 👤 User    | `/api/users/me`                           | **PUT**    | ✅      | Requires JWT. Update `{ firstName, lastName, phone, address, avatar }`. |
| 6  | 👤 User    | `/api/users/me`                           | **POST**   | ✅      | Requires JWT. Buat profil (field sama seperti PUT).                     |
| 7  | 👤 User    | `/api/users/me`                           | **DELETE** | ✅      | Requires JWT. Soft delete / deactivate account.                         |
| 8  | 👤 User    | `/api/users/me/avatar`                    | **POST**   | ✅      | Requires JWT. Upload avatar ≤2MB (webp, jpg, jpeg, png, gif).           |
| 9  | 🛒 Cart    | `/api/cart`                               | **GET**    | ✅      | Requires JWT. Get semua produk di cart.                                 |
| 10 | 🛒 Cart    | `/api/cart/count`                         | **GET**    | ✅      | Requires JWT. Get jumlah produk di cart.                                |
| 11 | 🛒 Cart    | `/api/cart/add`                           | **POST**   | ✅      | Requires JWT. Body: `{ productId, quantity }`.                          |
| 12 | 🛒 Cart    | `/api/cart/update/:productId`             | **PUT**    | ✅      | Requires JWT. Body: `{ quantity }`.                                     |
| 13 | 🛒 Cart    | `/api/cart/remove/:productId`             | **DELETE** | ✅      | Requires JWT. Param: `productId`.                                       |
| 14 | 🛒 Cart    | `/api/cart/clear`                         | **DELETE** | ✅      | Requires JWT. Hapus semua produk di cart.                               |
| 15 | 🛒 Cart    | `/api/cart/coupon`                        | **POST**   | ✅      | Requires JWT. Apply coupon ke cart.                                     |
| 16 | 🛒 Cart    | `/api/cart/coupon`                        | **DELETE** | ✅      | Requires JWT. Hapus coupon dari cart.                                   |
| 17 | 💳 Wallet  | `/api/users/wallet/balance`               | **GET**    | ✅      | Requires JWT. Cek saldo wallet user.                                    |
| 18 | 💳 Wallet  | `/api/users/wallet/transactions`          | **GET**    | ✅      | Requires JWT. Riwayat transaksi wallet user.                            |
| 19 | 💳 Wallet  | `/api/users/wallet/stats`                 | **GET**    | ✅      | Requires JWT. Statistik transaksi wallet user.                          |
| 20 | 💳 Wallet  | `/api/users/wallet/check-balance/:amount` | **GET**    | ✅      | Requires JWT. Cek apakah saldo cukup untuk nominal tertentu.            |
| 21 | 💳 Wallet  | `/api/users/wallet/setPin`                | **POST**   | ✅      | Requires JWT. Body: `{ pin, currentPin }`.                              |
| 22 | 💳 Wallet  | `/api/users/orders`                       | **POST**   | ✅      | Requires JWT. Body : `{shippingAddress, paymentMethod, pin}`.                  |




# 🛒 Seller Routes
> Dokumentasi API untuk fitur **Seller** pada platform e-commerce ini.  
> Setiap endpoint memiliki role dan request body yang berbeda, pastikan mengikuti spesifikasi berikut.
| Kategori         | Endpoint                                       | Method     | Status | Notes                                                                 |
| ---------------- | ---------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------- |
| 🏬 Stores Public | `/api/seller/stores`                           | **GET**    | ✅     | Public. Daftar semua toko.                                            |
| 🏬 Stores Public | `/api/seller/stores/:slug`                     | **GET**    | ✅     | Public. Profil publik toko by `slug`.                                 |
| 🏬 Stores Public | `/api/seller/stores/:slug/products`            | **GET**    | ✅     | Public. Semua produk dari toko by `slug`.                             |
| 📝 Profile       | `/api/seller/profile`                          | **POST**   | ✅     | Role: Seller. Buat profil. Body: `{ storeName, description, address, contact }`. |
| 📝 Profile       | `/api/seller/profile`                          | **GET**    | ✅     | Role: Seller. Lihat profil toko milik user login.                      |
| 📝 Profile       | `/api/seller/profile`                          | **PUT**    | ✅     | Role: Seller. Update profil. Body sama seperti POST.                   |
| 📝 Profile       | `/api/seller/profile/active`                   | **PUT**    | ✅     | Role: Seller. Aktifkan profil dari soft delete.                        |
| 📝 Profile       | `/api/seller/profile/archive`                  | **PATCH**  | ✅     | Role: Seller. Arsipkan profil toko. Body: `{ isActive }`.              |
| 📝 Profile       | `/api/seller/profile/restore`                  | **PATCH**  | ✅     | Role: Seller. Restore profil toko terarsip.                            |
| 📝 Profile       | `/api/seller/profile`                          | **DELETE** | ✅     | Role: Seller. Soft delete profil toko.                                 |
| 📝 Profile       | `/api/seller/profile/hard`                     | **DELETE** | ✅     | Role: Seller. Hard delete profil toko permanen.                        |
| 📝 Profile       | `/api/seller/profile/upload/:imageType`        | **POST**   | ✅     | Role: Seller. Upload logo/banner ≤5MB (jpg, png, webp, gif).           |
| 📊 Analitik      | `/api/seller/analytics/products`               | **GET**    | ✅     | Role: Seller. Statistik harga min, max, avg, total stok & nilai.       |
| 📊 Analitik      | `/api/seller/analytics/dashboard`              | **GET**    | ✅     | Role: Seller. Produk terlaris & performa penjualan.                    |
| 🛍️ Produk        | `/api/seller/products/bulk/status`             | **PATCH**  | ✅     | Role: Seller. Bulk ubah status produk. Body: `{ productIds[] }`.       |
| 🛍️ Produk        | `/api/seller/products/bulk`                    | **DELETE** | ✅     | Role: Seller. Bulk hapus produk. Body: `{ productIds[] }`.             |
| 🛍️ Produk        | `/api/seller/products`                         | **POST**   | ✅     | Role: Seller. Tambah produk. Body: `{ title, description, price, category, stock, image }`. |
| 🛍️ Produk        | `/api/seller/products`                         | **GET**    | ✅     | Role: Seller. Lihat semua produk toko.                                 |
| 🛍️ Produk        | `/api/seller/products/:productId`              | **GET**    | ✅     | Role: Seller. Detail produk by `productId`.                            |
| 🛍️ Produk        | `/api/seller/products/:productId`              | **PUT**    | ✅     | Role: Seller. Update produk. Partial update allowed.                   |
| 🛍️ Produk        | `/api/seller/products/:productId/status`       | **PATCH**  | ✅     | Role: Seller. Update status produk. Body: `{ isActive }`.              |
| 🛍️ Produk        | `/api/seller/products/:productId`              | **DELETE** | ✅     | Role: Seller. Hapus produk permanen.                                   |
| 🛍️ Produk        | `/api/seller/products/:productId/upload-image` | **POST**   | ✅     | Role: Seller. Upload gambar produk ≤5MB (jpg, png, webp, gif).         |
---
### 📝 Catatan
- **Bulk Update**: digunakan untuk mengubah status (`isActive`) beberapa produk sekaligus, biasanya melalui fitur **multi-select** di frontend.  
- **Bulk Delete**: menghapus beberapa produk sekaligus, biasanya untuk membersihkan stok atau menghapus produk yang tidak relevan.
- Endpoint **public** dapat diakses tanpa autentikasi, sedangkan **Role Seller/Admin** memerlukan JWT valid.



# 👑 Admin Routes
Dokumentasi API untuk fitur Admin pada platform e-commerce ini.  
Semua endpoint **hanya bisa diakses oleh user dengan role Admin** dan memerlukan **JWT valid**.  
## 🔐 Authentication
Header: Authorization: Bearer <your_jwt_token>
## 👤 User Management
| No | Endpoint                        | Method | Status | Parameters                                   | Request Body                                      | Notes                          |
|----|---------------------------------|--------|--------|----------------------------------------------|--------------------------------------------------|--------------------------------|
| 1  | /api/admin/users                | GET    | ✅     | page, limit, role, isActive, search (query)  | -                                                | Get semua users dengan pagination |
| 2  | /api/admin/users/:userId        | GET    | ✅     | userId (path)                                | -                                                | Get detail user by ID           |
| 3  | /api/admin/users/:userId        | PUT    | ✅     | userId (path)                                | { username, email, role, isActive, password? }   | Update user data                |
| 4  | /api/admin/users/:userId        | DELETE | ✅     | userId (path), permanent=true/false (query)  | -                                                | Soft/hard delete user           |
| 5  | /api/admin/users/:userId/role   | PATCH  | ✅     | userId (path)                                | { role: "user"/"seller"/"admin" }                | Ubah role user                  |
| 6  | /api/admin/users/:userId/status | PATCH  | ✅     | userId (path)                                | { isActive: true/false }                         | Activate/deactivate user        |
## 🏪 Seller Profile Management
| No | Endpoint                              | Method | Status | Parameters                                         | Request Body                                   | Notes                        |
|----|---------------------------------------|--------|--------|----------------------------------------------------|-----------------------------------------------|------------------------------|
| 1  | /api/admin/seller-profiles            | GET    | ✅     | page, limit, search, city, status, sortBy, sortOrder (query) | -                                   | Get semua seller profiles    |
| 2  | /api/admin/seller-profiles/:profileId | GET    | ✅     | profileId (path)                                   | -                                             | Get detail seller profile    |
| 3  | /api/admin/seller-profiles/:profileId | PATCH  | ✅     | profileId (path)                                   | { status: "active"/"inactive", reason? }      | Activate/deactivate profile  |
| 4  | /api/admin/seller-profiles/:profileId | DELETE | ✅     | profileId (path), permanent=true/false (query)     | -                                             | Soft/hard delete profile     |
## 💰 Wallet Management
| No | Endpoint                                         | Method | Status | Parameters                      | Request Body                                               | Notes                      |
|----|--------------------------------------------------|--------|--------|---------------------------------|-----------------------------------------------------------|----------------------------|
| 1  | /api/admin/wallets                               | GET    | ✅     | page, limit, search (query)     | -                                                         | Get semua wallets          |
| 2  | /api/admin/wallets/:userId                       | GET    | ✅     | userId (path)                   | -                                                         | Get user wallet details    |
| 3  | /api/admin/wallets/:userId                       | PATCH  | ✅     | userId (path)                   | { status: "active"/"inactive", reason? }                  | Activate/deactivate wallet |
| 4  | /api/admin/wallets/:userId/transactions          | POST   | ✅     | userId (path)                   | { type: "top-up"/"deduct", amount, description?, reason? } | Create transaction         |
| 5  | /api/admin/transactions                          | GET    | ✅     | page, limit, type, userId (query) | -                                                       | Get semua transactions     |
| 6  | /api/admin/transactions/:transactionId/reversals | POST   | ✅     | transactionId (path)            | { reason?, confirmReverse? }                              | Reverse transaction        |
| 7  | /api/admin/wallet-stats                          | GET    | ✅     | period (query)                  | -                                                         | Get wallet statistics      |
## 📂 Category Management
| No | Endpoint                  | Method | Status | Parameters | Request Body                   | Notes              |
|----|---------------------------|--------|--------|------------|--------------------------------|--------------------|
| 1  | /api/admin/categories     | POST   | ✅     | -          | { name, description?, image? } | Buat kategori baru |
| 2  | /api/admin/categories/:id | PUT    | ✅     | id (path)  | { name, description?, image? } | Update kategori    |
| 3  | /api/admin/categories/:id | DELETE | ✅     | id (path)  | -                              | Hapus kategori     |

