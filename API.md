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
| Kategori | Endpoint                         | Method      | Status  | Notes                                                          |
| --------- | -------------------------------- | ----------- | ------- | -------------------------------------------------------------- |
| 🛍️ Produk | `/api/categories/:id/products`  | **GET**    | ✅     | Public. Param: `id`. Query: `page`, `limit`. Cache 5m.           |
| 🛍️ Produk | `/api/products`                 | **GET**    | ✅     | Public. Ambil semua produk.                                      |
| 🛍️ Produk | `/api/products/:id`             | **GET**    | ✅     | Public. Param: `id`. Return produk + info penjual. Cache 1h.     |
| 👤 User   | `/api/users/me`                 | **GET**    | ✅     | Requires JWT. Return profil + alamat. No-store cache.            |
| 👤 User   | `/api/users/me`                 | **PUT**    | ✅     | Requires JWT. Update `{ firstName, lastName, phone, address, avatar }`. |
| 👤 User   | `/api/users/me`                 | **POST**   | ✅     | Requires JWT. Buat profil (field sama seperti PUT).              |
| 👤 User   | `/api/users/me`                 | **DELETE** | ✅     | Requires JWT. Soft delete / deactivate account.                  |
| 👤 User   | `/api/users/me/avatar`          | **POST**   | ✅     | Requires JWT. Upload avatar ≤2MB (webp, jpg, jpeg, png, gif).    |
| 🛒 Cart   | `/api/cart`                     | **GET**    | ✅     | Requires JWT. Get semua produk di cart.                          |
| 🛒 Cart   | `/api/cart/count`               | **GET**    | ✅     | Requires JWT. Get jumlah produk di cart.                         |
| 🛒 Cart   | `/api/cart/add`                 | **POST**   | ✅     | Requires JWT. Body: `{ productId, quantity }`.                   |
| 🛒 Cart   | `/api/cart/update/:productId`   | **PUT**    | ✅     | Requires JWT. Body: `{ quantity }`.                              |
| 🛒 Cart   | `/api/cart/remove/:productId`   | **DELETE** | ✅     | Requires JWT. Param: `productId`.                                |
| 🛒 Cart   | `/api/cart/clear`               | **DELETE** | ✅     | Requires JWT. Hapus semua produk di cart.                        |
| 🛒 Cart   | `/api/cart/coupon`              | **POST**   | ✅     | Requires JWT. Apply coupon ke cart.                              |
| 🛒 Cart   | `/api/cart/coupon`              | **DELETE** | ✅     | Requires JWT. Hapus coupon dari cart.                            |




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
> Dokumentasi API untuk fitur **Admin** pada platform e-commerce ini.  
> Setiap endpoint hanya dapat diakses oleh user dengan **role Admin** dan memerlukan JWT valid.
| Kategori   | Endpoint                                         | Method     | Status | Notes                                                   |
| ---------- | ------------------------------------------------ | ---------- | ------ | ------------------------------------------------------- |
| 🛍️ Produk  | `/api/products/:id`                              | **DELETE** | ✅     | Admin only. Hapus produk + gambar. Return 204.          |
| 👤 User    | `/api/users/:id/status`                          | **PUT**    | ✅     | Admin only. Ubah status user (`active` / `inactive`).   |
| 👤 User    | `/api/users/:id/role`                            | **PUT**    | ✅     | Admin only. Ubah role user (`user` / `seller`).         |
| 👤 User    | `/api/users/:id`                                 | **DELETE** | ✅     | Admin only. Soft delete user + nonaktifkan profil.      |
| 👤 User    | `/api/users/:id/hard`                            | **DELETE** | ✅     | Admin only. Hard delete user + profil (cascade).        |
| 📝 Profile | `/api/seller/admin/profiles/:profileId`          | **DELETE** | ✅     | Admin only. Hard delete profil toko.                    |
| 📝 Profile | `/api/seller/admin/profiles/:profileId/soft`     | **DELETE** | ✅     | Admin only. Soft delete/deactivate profil toko.         |
| 📝 Profile | `/api/seller/admin/profiles/:profileId/activate` | **PUT**    | ✅     | Admin only. Aktifkan / restore profil toko.             |
| 📝 Profile | `/api/seller/admin/profiles`                     | **GET**    | ✅     | Admin only. Lihat semua toko penjual di platform.       |
| 📝 Profile | `/api/seller/admin/profiles/:profileId`          | **GET**    | ✅     | Admin only. Lihat detail profil toko penjual di platform. |
| 📂 Category| `/api/categories`                                | **POST**   | ✅     | Admin only. Tambah kategori baru.                       |
| 📂 Category| `/api/categories/:categoryId`                    | **PUT**    | ✅     | Admin only. Edit nama kategori.                         |
| 📂 Category| `/api/categories`                                | **DELETE** | ✅     | Admin only. Hapus kategori.                             |
---
**Catatan:**
- Semua endpoint **Admin Routes** memerlukan autentikasi JWT dan hanya dapat diakses oleh user dengan `role: admin`.
- **Hard delete** akan menghapus data permanen dari database, sedangkan **soft delete** hanya menonaktifkan data tanpa menghapus fisik dari database.
