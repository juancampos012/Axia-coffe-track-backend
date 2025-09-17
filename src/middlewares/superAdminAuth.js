const passport = require('passport');
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const logger = require('../config/logger');

const authenticateSuperAdmin = async (req, res, next) => {
  passport.authenticate('jwt', { session: false }, async (err, user, info) => {
    try {
      if (err) {
        logger.error('Error en autenticación JWT:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      if (!user || user.role !== 'SUPERADMIN') {
        logger.warn(`Intento de acceso como superadmin por usuario no autorizado - IP: ${req.ip}`);
        return res.status(403).json({ error: 'Prohibido' });
      }

      const token = req.cookies.authToken;
      if (!token) {
        logger.warn(`Intento de acceso sin token - IP: ${req.ip}`);
        return res.status(401).json({ error: 'Token no proporcionado' });
      }

      const revokedToken = await prisma.revokedToken.findUnique({
        where: { token }
      });

      if (revokedToken) {
        logger.warn(`Intento de uso de token revocado - IP: ${req.ip}`);
        return res.status(401).json({ error: 'Token revocado' });
      }

      req.user = user;
      next();
    } catch (error) {
      logger.error('Error en autenticación:', error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  })(req, res, next);
};

module.exports = { authenticateSuperAdmin };