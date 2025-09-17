const companyController = require("../controllers/CompanyController");
const express = require('express');
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuth');
const { requireRole } = require('../middlewares/requireRole');
const router = express.Router();

router.post('/', authenticateSuperAdmin, companyController.createCompany);
router.get("/", authenticateSuperAdmin, companyController.getCompanies); 
router.get("/:id", companyController.getCompanyById); 
router.patch("/:id", authenticateSuperAdmin, companyController.updateCompany);
router.delete("/:id", authenticateSuperAdmin, companyController.deleteCompany); 

module.exports = router;