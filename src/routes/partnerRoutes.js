// src/routes/partnerRoutes.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/PartnerController");
const { authenticateJWT } = require("../middlewares/auth");

router.post("/", authenticateJWT, controller.createPartner);
router.get("/", authenticateJWT, controller.getPartners);
router.get("/:id", authenticateJWT, controller.getPartnerById);
router.patch("/:id", authenticateJWT, controller.updatePartner);
router.delete("/:id", authenticateJWT, controller.deletePartner);

module.exports = router;