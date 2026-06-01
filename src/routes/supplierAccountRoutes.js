const express = require("express");
const router = express.Router();
const controller = require("../controllers/SupplierAccountController");
const { authenticateJWT } = require("../middlewares/auth");

router.get("/summary",                  authenticateJWT, controller.getAccountsSummary);
router.get("/detail/:supplierId",       authenticateJWT, controller.getSupplierDetail);
router.post("/payment-by-supplier",     authenticateJWT, controller.addPaymentBySupplier);
router.patch("/payment/:id",            authenticateJWT, controller.updateSupplierPayment);
router.patch("/account/:id",            authenticateJWT, controller.updateSupplierAccount);
router.post("/payment",                 authenticateJWT, controller.addSupplierAccountPayment);
router.post("/",                        authenticateJWT, controller.createSupplierAccount);
router.get("/supplier/:supplierId",     authenticateJWT, controller.getSupplierAccounts);
router.get("/:id",                      authenticateJWT, controller.getSupplierAccountById);

module.exports = router;
