const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middlewares/auth');
const aiController = require('../controllers/AIController');

router.post('/ai-tool', authenticateJWT, aiController.pirateAnswer);
router.post('/find-better-suppliers', authenticateJWT, aiController.findBetterSuppliers);
router.post('/supplier-analysis', authenticateJWT, aiController.supplierAnalysis);
router.post('/sector-trends', authenticateJWT, aiController.sectorTrends);
router.post('/product-recommendations', authenticateJWT, aiController.productRecommendations);

module.exports = router;
