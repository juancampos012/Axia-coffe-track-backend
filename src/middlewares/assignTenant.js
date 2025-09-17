const assignTenant = (req, res, next) => {
  if (req.user) {
    // Solo asigna tenantId si NO es SUPERADMIN y tiene tenantId
    if (req.user.role !== "SUPERADMIN" && req.user.tenantId) {
      req.body.tenantId = req.user.tenantId;
    }
  }
  next();
};

module.exports = { assignTenant };