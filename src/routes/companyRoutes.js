const companyController = require("../controllers/CompanyController");
const express = require('express');
const multer = require('multer');
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuth');
const { authenticateJWT } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/requireRole');
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './src/uploads/companies'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

router.post('/', authenticateSuperAdmin, upload.single('logo'), companyController.createCompany);
router.get("/", authenticateSuperAdmin, companyController.getCompanies); 
router.get("/:id", companyController.getCompanyById); 
router.patch("/:id", authenticateJWT, requireRole('ADMIN', 'SUPERADMIN'), upload.single('logo'), companyController.updateCompany);
router.delete("/:id", authenticateSuperAdmin, companyController.deleteCompany); 

module.exports = router;