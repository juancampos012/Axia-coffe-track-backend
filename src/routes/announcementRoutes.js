const express = require('express');
const router = express.Router();
const controller = require('../controllers/AnnouncementController');

// Middleware de autenticación
const { authenticateJWT } = require('../middlewares/auth');

// Aplicar el middleware a todas las rutas de este archivo
router.use(authenticateJWT);

// --- Rutas de Anuncios ---

// Crear una nueva fijación/anuncio
router.post('/', controller.createAnnouncement);

// Obtener todos los anuncios (filtrado por tenant en el controlador)
router.get('/', controller.getAnnouncements);

// NUEVA: Obtener anuncios activos de un cliente específico 
// Se usa en la pantalla de ventas cuando seleccionas un cliente
router.get('/client/:clientId', controller.getActiveAnnouncementsByClient);

module.exports = router;