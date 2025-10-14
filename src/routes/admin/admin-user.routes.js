const express = require("express");
const router = express.Router();
const AdminUserController = require("../../controllers/admin/admin-user.controller");

// 🔹 User Management Endpoints
router.route("/")
  .get(AdminUserController.getAllUsers);

router.route("/:userId")
  .get(AdminUserController.getUserById)
  .put(AdminUserController.updateUser)
  .delete(AdminUserController.deleteUser); // Soft delete default, ?permanent=true untuk hard delete

router.patch("/:userId/role", AdminUserController.changeUserRole);
router.patch("/:userId/status", AdminUserController.changeUserStatus);

module.exports = router;