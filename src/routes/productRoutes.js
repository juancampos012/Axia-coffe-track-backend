const productController = require('../controllers/ProductController');
const express = require('express');
const { authenticateJWT } = require('../middlewares/auth')
const {requireRole} = require('../middlewares/requireRole')
const { assignTenant } = require('../middlewares/assignTenant');
const router = express.Router();

// Rutas privadas (requieren autenticación)
router.post("/", authenticateJWT, assignTenant, productController.createProduct);
router.get("/", authenticateJWT, productController.getProducts);
router.get('/search', authenticateJWT, productController.searchProductsByName);
router.get("/:id", authenticateJWT, productController.getProductById);
router.patch("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), productController.updateProduct);
router.delete("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), productController.deleteProduct);

// Rutas públicas (para generación estática)
router.get("/public/list", productController.getPublicProducts);
router.get("/public/:id", productController.getPublicProductById);

module.exports = router;