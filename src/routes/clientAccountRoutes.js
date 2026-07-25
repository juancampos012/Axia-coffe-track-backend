const express = require("express");
const router = express.Router();
const controller = require("../controllers/ClientAccountController");
const { authenticateJWT } = require("../middlewares/auth");

router.get("/summary",              authenticateJWT, controller.getAccountsSummary);
router.get("/detail/:clientId",     authenticateJWT, controller.getClientDetail);
router.post("/payment-by-client",   authenticateJWT, controller.addPaymentByClient);
router.post("/close-period",        authenticateJWT, controller.closeClientPeriod);
router.patch("/payment/:id",        authenticateJWT, controller.updateClientPayment);
router.patch("/account/:id",        authenticateJWT, controller.updateClientAccount);
router.post("/payment",             authenticateJWT, controller.addClientAccountPayment);
router.post("/",                    authenticateJWT, controller.createClientAccount);
router.get("/client/:clientId",     authenticateJWT, controller.getClientAccounts);
router.get("/:id",                  authenticateJWT, controller.getClientAccountById);

module.exports = router;
