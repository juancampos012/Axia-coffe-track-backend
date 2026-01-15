const assignTenant = (req, res, next) => {
  if (req.user) {
    // Solo asigna tenantId si NO es SUPERADMIN y tiene tenantId
    if (req.user.role !== "SUPERADMIN" && req.user.tenantId) {
      
      // Para solicitudes GET, agregar tenantId a query params
      if (req.method === 'GET') {
        req.query.tenantId = req.user.tenantId;
      }
      
      // Para solicitudes POST, PUT, PATCH, agregar tenantId al body
      else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        req.body.tenantId = req.user.tenantId;
      }
    }
    
    // Opcional: Para SUPERADMIN, permitir especificar tenantId manualmente
    // Si el SUPERADMIN quiere actuar como una empresa específica
    if (req.user.role === "SUPERADMIN" && req.body.tenantId) {
      // Ya tiene tenantId en el body, no hacer nada
    } else if (req.user.role === "SUPERADMIN" && req.query.tenantId) {
      // Ya tiene tenantId en query, no hacer nada
    }
  }
  next();
};

module.exports = { assignTenant };