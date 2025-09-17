const express = require('express');
const analyticsController = require('../controllers/AnalyticsController');
const { authenticateJWT } = require('../middlewares/auth');
const router = express.Router();

router.get('/sales', authenticateJWT, analyticsController.getSalesMetrics);
router.get('/top-products', authenticateJWT, analyticsController.getTopProducts);
router.get('/inventory', authenticateJWT, analyticsController.getInventorySummary);
router.get('/customers', authenticateJWT, analyticsController.getCustomerMetrics);
router.get('/dashboard', authenticateJWT, analyticsController.getDashboardMetrics);
router.get('/inventory-health', authenticateJWT, analyticsController.getInventoryHealth);
router.get('/product-performance', authenticateJWT, analyticsController.getProductPerformance);
router.get('/profitability', authenticateJWT, analyticsController.getProfitabilityMetrics);

module.exports = router;