const clientController = require('../controllers/ClientController');
const express = require('express');
const { authenticateJWT } = require('../middlewares/auth')
const {requireRole} = require('../middlewares/requireRole')
const { assignTenant } = require('../middlewares/assignTenant');
const router = express.Router();


router.get('/search', authenticateJWT, clientController.searchClientsByName);
router.post("/", authenticateJWT, assignTenant, clientController.createClient);
router.get("/", authenticateJWT, clientController.getClients);
router.get("/:id", authenticateJWT, clientController.getClientById);
router.patch("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), clientController.updateClient);
router.delete("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), clientController.deleteClient);

// Rutas públicas (para generación estática)
router.get("/public/list", clientController.getPublicClients);
router.get("/public/:id", clientController.getPublicClientById);

module.exports = router;