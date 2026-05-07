const express = require("express");
const router = express.Router();
const controller = require("../controllers/PartnerPaymentController");
const { authenticateJWT } = require("../middlewares/auth");

router.post("/", authenticateJWT, controller.createPartnerPayment);
router.get("/:partnerId", authenticateJWT, controller.getPartnerPayments);
router.get("/:partnerId/balance", authenticateJWT, controller.getPartnerFinancialBalance);
router.patch("/:id", authenticateJWT, controller.updatePartnerPayment);
router.delete("/:id", authenticateJWT, controller.deletePartnerPayment);

module.exports = router;