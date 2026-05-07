const deliveryController = require('../controllers/DeliveryController');

const express = require('express');

const { authenticateJWT } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/requireRole');
const { assignTenant } = require('../middlewares/assignTenant');

const router = express.Router();

//////////////////////////////////////////////////////
// DELIVERY ROUTES
//////////////////////////////////////////////////////

router.post(
  '/',
  authenticateJWT,
  assignTenant,
  deliveryController.createDelivery
);

router.get(
  '/',
  authenticateJWT,
  deliveryController.getDeliveries
);

router.get(
  '/:id',
  authenticateJWT,
  deliveryController.getDeliveryById
);

router.patch(
  '/:id',
  authenticateJWT,
  requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'),
  deliveryController.updateDelivery
);

router.delete(
  '/:id',
  authenticateJWT,
  requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'),
  deliveryController.deleteDelivery
);

module.exports = router;