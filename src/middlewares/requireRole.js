const logger = require('../config/logger');

const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            logger.error('Intento de acceso no autenticado');
            return res.status(401).json({ error: 'No autenticado' });
        }
        if (!roles.includes(req.user.role)) {
            logger.error(`Intento de acceso denegado para el usuario ${req.user.username} con rol ${req.user.role}`);
            return res.status(403).json({ error: 'Acceso denegado: No tiene permisos para acceder.' });
        }
        next();
    };
};

module.exports = {requireRole};