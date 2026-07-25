const express = require("express");
const router = express.Router();
const controller = require("../controllers/PartnerAccountController");
const { authenticateJWT } = require("../middlewares/auth");

router.get("/summary",                      authenticateJWT, controller.getAccountsSummary);
router.get("/detail/:partnerId",            authenticateJWT, controller.getPartnerDetail);
router.post("/payment-by-partner",          authenticateJWT, controller.addPaymentByPartner);
router.post("/close-period",                authenticateJWT, controller.closePartnerPeriod);
router.patch("/payment/:id",               authenticateJWT, controller.updatePartnerPayment);
router.patch("/account/:id",               authenticateJWT, controller.updatePartnerAccount);
router.post("/payment",                     authenticateJWT, controller.addPartnerAccountPayment);
router.post("/",                            authenticateJWT, controller.createPartnerAccount);
router.get("/partner/:partnerId",           authenticateJWT, controller.getPartnerAccounts);
router.get("/:id",                          authenticateJWT, controller.getPartnerAccountById);

module.exports = router;
