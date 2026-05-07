const express = require('express');
const analyticsController = require('../controllers/AnalyticsController');
const { authenticateJWT } = require('../middlewares/auth');
const router = express.Router();

// --- RUTAS DE DASHBOARD PRINCIPAL ---

// Dashboard consolidado (Ventas + Inventario Físico de Company + Top Productos)
router.get('/dashboard', authenticateJWT, analyticsController.getDashboardMetrics);

// Métricas de operación (Préstamos, Contratos/Announcements y Empaques)
router.get('/operations', authenticateJWT, analyticsController.getOperationMetrics);


// --- RUTAS DE MÉTRICAS ESPECÍFICAS ---

// Gráficos de ventas por período (Día/Semana/Mes)
router.get('/sales', authenticateJWT, analyticsController.getSalesMetrics);

// Ranking de productos más vendidos
router.get('/top-products', authenticateJWT, analyticsController.getTopProducts);

// Resumen técnico de inventario y alertas de stock bajo
router.get('/inventory', authenticateJWT, analyticsController.getInventorySummary);

// Salud del inventario (Tasa de rotación y valor total)
router.get('/inventory-health', authenticateJWT, analyticsController.getInventoryHealth);

// Métricas de clientes (Fidelidad, nuevos clientes, segmentos)
router.get('/customers', authenticateJWT, analyticsController.getCustomerMetrics);

// Rendimiento por producto individual
router.get('/product-performance', authenticateJWT, analyticsController.getProductPerformance);

// Análisis de rentabilidad (Márgenes de ganancia y COGS)
router.get('/profitability', authenticateJWT, analyticsController.getProfitabilityMetrics);


module.exports = router;