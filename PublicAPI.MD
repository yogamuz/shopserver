# 🌐 API ENDPOINTS DOCUMENTATION

## 🔐 AUTHENTICATION ENDPOINTS
| No  | Endpoint                        | Method | Auth | Status | Role | Description                     |
|-----|---------------------------------|--------|------|--------|------|---------------------------------|
| 1   | /api/auth/login                 | POST   | ❌    | ✅      | all  | Authenticate user               |
| 2   | /api/auth/register              | POST   | ❌    | ✅      | all  | Register new user               |
| 3   | /api/auth/logout                | DELETE | ❌    | ✅      | all  | Logout user                     |
| 4   | /api/auth/password-reset-tokens | POST   | ❌    | ✅      | all  | Generate OTP for password reset |
| 5   | /api/auth/passwords             | PUT    | ❌    | ✅      | all  | Update password with token      |
| 6   | /api/auth/refresh               | PUT    | ❌    | ✅      | all  | Refresh access token            |
| 7   | /api/auth/verify                | GET    | ❌    | ✅      | all  | Verify token                    |

---

## 🏪 STORES (PUBLIC) ENDPOINTS
| No  | Endpoint                     | Method | Auth | Status | Role | Description                     |
|-----|------------------------------|--------|------|--------|------|---------------------------------|
| 8   | /api/stores                  | GET    | ❌    | ✅      | all  | Get all active stores           |
| 9   | /api/stores/:slug            | GET    | ❌    | ✅      | all  | Get store profile by slug       |
| 10  | /api/stores/:slug/products   | GET    | ❌    | ✅      | all  | Get products from specific store |

### 📋 Query Parameters Details

#### **GET /api/stores**
- `page` (number, optional): Page number for pagination (default: 1)
- `limit` (number, optional): Items per page (default: 12)
- `search` (string, optional): Search by store name or description
- `city` (string, optional): Filter by city
- `sortBy` (string, optional): Sort field (default: "createdAt")
- `sortOrder` (number, optional): Sort direction -1 desc, 1 asc (default: -1)

#### **GET /api/stores/:slug**
- `page` (number, optional): Page number for products pagination (default: 1)
- `limit` (number, optional): Products per page (default: 12)
- `sortBy` (string, optional): Sort products by field (default: "createdAt")
- `sortOrder` (number, optional): Sort direction -1 desc, 1 asc (default: -1)

#### **GET /api/stores/:slug/products**
- `page` (number, optional): Page number for pagination (default: 1)
- `limit` (number, optional): Products per page (default: 12)
- `sortBy` (string, optional): Sort field (default: "createdAt")
- `sortOrder` (string, optional): Sort direction "desc" or "asc" (default: "desc")
- `category` (string, optional): Filter by category ID
- `search` (string, optional): Search by product title or description
- `minPrice` (number, optional): Minimum price filter
- `maxPrice` (number, optional): Maximum price filter
- `inStock` (boolean, optional): Filter by stock availability ("true" or "false")

---

## 🛒 PRODUCTS ENDPOINTS
| No  | Endpoint                  | Method | Auth | Status | Role | Description            |
|-----|---------------------------|--------|------|--------|------|------------------------|
| 11  | /api/products             | GET    | ❌    | ✅      | all  | Retrieve all products  |
| 12  | /api/products/:productId  | GET    | ❌    | ✅      | all  | Retrieve product by ID |

### 📋 Query Parameters Details

#### **GET /api/products**
- `page` (number, optional): Page number for pagination (default: 1)
- `limit` (number, optional): Items per page (default: 12)
- `search` (string, optional): Search by product title or description
- `category` (string, optional): Filter by category ID or name
- `sortBy` (string, optional): Sort field (default: "createdAt")
- `sortOrder` (number, optional): Sort direction -1 desc, 1 asc (default: -1)
- `minPrice` (number, optional): Minimum price filter
- `maxPrice` (number, optional): Maximum price filter
- `isActive` (boolean, optional): Filter by active status ("true" or "false")
- `sellerId` (string, optional): Filter by seller/store ID
- `rating` (number, optional): Filter by minimum rating (1-5)
- `inStock` (boolean, optional): Filter by stock availability ("true" or "false")

#### **GET /api/products/:productId**
- `includeDeleted` (boolean, optional): Include soft-deleted products ("true" or "false")
- `compact` (boolean, optional): Return compact product data ("true" or "false")

---

## 🎯 Response Format
All endpoints return responses in the following format:
```json
{
  "success": boolean,
  "message": "string",
  "data": object
}
```

## 📝 Example Usage

### Authentication
```bash
# Login
POST /api/auth/login
Content-Type: application/json
{
  "email": "user@example.com",
  "password": "password123"
}

# Register
POST /api/auth/register
Content-Type: application/json
{
  "username": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

### Stores
```bash
# Get all stores with filters
GET /api/stores?page=1&limit=10&search=electronics&city=Jakarta&sortBy=name&sortOrder=1

# Get store by slug
GET /api/stores/tech-store-jakarta

# Get products from specific store
GET /api/stores/tech-store-jakarta/products?category=electronics&inStock=true&page=1&limit=12
```

### Products
```bash
# Get all products with filters
GET /api/products?page=1&limit=12&category=electronics&inStock=true&sortBy=price&sortOrder=1

# Get product by ID
GET /api/products/64f1234567890abcdef12345?compact=true

# Search products with filters
GET /api/products?search=laptop&minPrice=500&maxPrice=2000&rating=4&sellerId=64f9876543210fedcba98765
```

## ⚠️ Validation Rules

### Allowed Parameters for GET /api/products:
- `category`, `page`, `limit`, `search`, `sortBy`, `sortOrder`
- `minPrice`, `maxPrice`, `isActive`, `sellerId`, `rating`, `inStock`

### Allowed Parameters for GET /api/products/:productId:
- `includeDeleted`, `compact`

**Note:** Any query parameters outside the allowed list will result in a `400 Bad Request` response with details about invalid parameters and allowed parameters.

## 📊 Response Examples

### Successful Response
```json
{
  "success": true,
  "message": "Products retrieved successfully",
  "data": {
    "products": [
      {
        "id": "64f1234567890abcdef12345",
        "title": "Gaming Laptop",
        "price": 15000000,
        "category": "electronics",
        "inStock": true,
        "rating": 4.5
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 10,
      "totalItems": 120,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### Error Response (Invalid Parameters)
```json
{
  "success": false,
  "message": "Invalid query parameters: invalidParam1, invalidParam2",
  "data": {
    "allowedParams": ["category", "page", "limit", "search", "sortBy", "sortOrder", "minPrice", "maxPrice", "isActive", "sellerId", "rating", "inStock"],
    "received": ["category", "page", "invalidParam1", "invalidParam2"]
  }
}
```

### Error Response (Not Found)
```json
{
  "success": false,
  "message": "Product not found",
  "data": null
}
```

## 📂 CATEGORIES (PUBLIC) ENDPOINTS
| No  | Endpoint                          | Method | Auth | Status | Role | Description                      |
|-----|-----------------------------------|--------|------|--------|------|----------------------------------|
| 13  | /api/categories                   | GET    | ❌    | ✅      | all  | Get all active categories        |
| 14  | /api/categories/:categoryId       | GET    | ❌    | ✅      | all  | Get category by ID               |
| 15  | /api/categories/:categoryId/products | GET | ❌    | ✅      | all  | Get products by category         |

## 📋 Query Parameters Details

### **GET /api/categories**
- `page` (number, optional): Page number for pagination (default: 1)
- `limit` (number, optional): Items per page (default: 50)
- `search` (string, optional): Search by category name or description
- `sortBy` (string, optional): Sort field (default: "createdAt")
- `sortOrder` (string, optional): Sort direction "desc" or "asc" (default: "desc")
- `withProducts` (boolean, optional): Include product count ("true" or "false")

### **GET /api/categories/:categoryId**
- `withProducts` (boolean, optional): Include products in response ("true" or "false")

### **GET /api/categories/:categoryId/products**
- `page` (number, optional): Page number for pagination (default: 1)
- `limit` (number, optional): Products per page (default: 20)
- `sortBy` (string, optional): Sort field (default: "createdAt")
- `sortOrder` (string, optional): Sort direction "desc" or "asc" (default: "desc")
- `minPrice` (number, optional): Minimum price filter
- `maxPrice` (number, optional): Maximum price filter
- `search` (string, optional): Search by product title or description

---

## 🎯 Response Format
All endpoints return responses in the following format:
```json
{
  "success": boolean,
  "message": "string",
  "data": object
}
```

## 📝 Example Usage

### Get All Categories
```bash
# Basic request
GET /api/categories

# With filters and pagination
GET /api/categories?page=1&limit=20&search=electronics&sortBy=name&sortOrder=asc

# Include product count
GET /api/categories?withProducts=true&limit=10
```

### Get Category by ID
```bash
# Basic category info
GET /api/categories/64f1234567890abcdef12345

# Include products in category
GET /api/categories/64f1234567890abcdef12345?withProducts=true
```

### Get Products by Category
```bash
# All products in category
GET /api/categories/64f1234567890abcdef12345/products

# With filters
GET /api/categories/64f1234567890abcdef12345/products?page=1&limit=12&minPrice=100&maxPrice=1000&search=laptop&sortBy=price&sortOrder=asc
```

## ⚠️ Validation Rules

### Allowed Parameters for GET /api/categories:
- `page`, `limit`, `search`, `sortBy`, `sortOrder`, `withProducts`

### Allowed Parameters for GET /api/categories/:categoryId:
- `withProducts`

### Allowed Parameters for GET /api/categories/:categoryId/products:
- `page`, `limit`, `sortBy`, `sortOrder`, `minPrice`, `maxPrice`, `search`

**Note:** Any query parameters outside the allowed list will result in a `400 Bad Request` response with details about invalid parameters.

## 📊 Response Examples

### Successful Response - Get All Categories
```json
{
  "success": true,
  "message": "Categories retrieved successfully",
  "data": {
    "categories": [
      {
        "id": "64f1234567890abcdef12345",
        "name": "Electronics",
        "slug": "electronics",
        "description": "Electronic devices and gadgets",
        "image": "https://example.com/electronics.jpg",
        "isActive": true,
        "productCount": 45,
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-20T14:45:00.000Z"
      }
    ],
    "pagination": {
      "total": 12,
      "page": 1,
      "limit": 50,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    },
    "filters": {
      "search": null
    }
  }
}
```

### Successful Response - Get Category by ID
```json
{
  "success": true,
  "message": "Category retrieved successfully",
  "data": {
    "category": {
      "id": "64f1234567890abcdef12345",
      "name": "Electronics",
      "slug": "electronics",
      "description": "Electronic devices and gadgets",
      "image": "https://example.com/electronics.jpg",
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-20T14:45:00.000Z"
    }
  }
}
```

### Successful Response - Get Products by Category
```json
{
  "success": true,
  "message": "Products by category retrieved successfully",
  "data": {
    "category": {
      "id": "64f1234567890abcdef12345",
      "name": "Electronics",
      "slug": "electronics",
      "description": "Electronic devices and gadgets",
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-20T14:45:00.000Z"
    },
    "products": [
      {
        "id": "64f9876543210fedcba98765",
        "title": "Gaming Laptop",
        "slug": "gaming-laptop",
        "description": "High-performance gaming laptop",
        "price": 15000000,
        "discountPrice": 13500000,
        "category": {
          "id": "64f1234567890abcdef12345",
          "name": "Electronics",
          "slug": "electronics"
        },
        "stock": 10,
        "isActive": true,
        "rating": 4.5,
        "reviewCount": 23,
        "createdAt": "2024-01-16T08:15:00.000Z",
        "updatedAt": "2024-01-21T16:30:00.000Z"
      }
    ],
    "pagination": {
      "total": 45,
      "page": 1,
      "limit": 20,
      "totalPages": 3,
      "hasNext": true,
      "hasPrev": false
    },
    "filters": {
      "minPrice": null,
      "maxPrice": null,
      "search": null
    }
  }
}
```

### Error Response - Invalid Parameters
```json
{
  "success": false,
  "message": "Invalid query parameters: invalidParam, anotherInvalid",
  "data": {
    "allowedParams": ["page", "limit", "search", "sortBy", "sortOrder", "withProducts"],
    "received": ["page", "limit", "invalidParam", "anotherInvalid"]
  }
}
```

### Error Response - Category Not Found
```json
{
  "success": false,
  "message": "No category found with ID: 64f1234567890abcdef99999",
  "data": null
}
```

### Error Response - Invalid ObjectId Format
```json
{
  "success": false,
  "message": "Category ID must be a valid 24-character MongoDB ObjectId",
  "data": {
    "code": "INVALID_ID_FORMAT"
  }
}
```

### Error Response - Category Inactive
```json
{
  "success": false,
  "message": "Category \"Old Category\" is currently inactive",
  "data": {
    "code": "CATEGORY_NOT_ACTIVE"
  }
}
```

## 🔄 Clean Response Features

### ✅ What's Included in Response:
- **Categories**: `id`, `name`, `slug`, `description`, `image`, `isActive`, `createdAt`, `updatedAt`
- **Products**: `id`, `title`, `slug`, `description`, `price`, `discountPrice`, `images`, `category`, `stock`, `isActive`, `rating`, `reviewCount`, `createdAt`, `updatedAt`
- **Pagination**: Complete pagination info with `hasNext`/`hasPrev` flags
- **Filters**: Applied filters for reference

### ❌ What's Excluded from Response:
- `_id` (converted to `id`)
- `__v` (version key)
- Internal MongoDB fields
- Sensitive data
- Unnecessary nested objects

### 🎯 Response Benefits:
- **Consistent Structure**: All endpoints use same response format
- **Clean Data**: No MongoDB internal fields exposed
- **Frontend Ready**: Direct usage without data transformation
- **Predictable**: Same structure across all category endpoints
- **Validation**: Clear error messages with allowed parameters