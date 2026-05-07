const express = require("express");
const router = express.Router();

const controller = require("../controllers/PartnerAccountController");
const { authenticateJWT } = require("../middlewares/auth");

router.post("/", authenticateJWT, controller.createPartnerAccount);

router.post(
  "/payment",
  authenticateJWT,
  controller.addPartnerAccountPayment
);

router.get(
  "/partner/:partnerId",
  authenticateJWT,
  controller.getPartnerAccounts
);

router.get(
  "/:id",
  authenticateJWT,
  controller.getPartnerAccountById
);

module.exports = router;