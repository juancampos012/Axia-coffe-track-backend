const express = require("express");
const router = express.Router();
const controller = require("../controllers/PartnerPackagingController");
const { authenticateJWT } = require("../middlewares/auth");

router.post("/", authenticateJWT, controller.createPackagingMovement);
router.get("/:partnerId", authenticateJWT, controller.getPackagingMovements);
router.get("/:partnerId/balance", authenticateJWT, controller.getPackagingBalance);
router.patch("/:id", authenticateJWT, controller.updatePackagingMovement);
router.delete("/:id", authenticateJWT, controller.deletePackagingMovement);

module.exports = router;