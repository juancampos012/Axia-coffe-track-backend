const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const logger = require("../config/logger");

//////////////////////////////////////////////////////
// CREAR ENTREGA
//////////////////////////////////////////////////////

const createDelivery = async (req, res) => {
  try {
    const { tenantId, partnerId, productId, productKg } = req.body;
    const kgToDeliver = Number(productKg);

    const result = await prisma.$transaction(async (tx) => {
      
      // 1. VALIDAR EMPRESA Y OBTENER STOCK GLOBAL
      const company = await tx.company.findUnique({
        where: { id: tenantId }
      });

      if (!company) throw new Error("Empresa no encontrada");

      // 2. VALIDAR SOCIO
      const partner = await tx.partner.findUnique({
        where: { id: partnerId }
      });

      if (!partner) throw new Error("Socio no encontrado");

      // 3. VALIDAR PRODUCTO Y SU STOCK INDIVIDUAL
      const product = await tx.product.findUnique({
        where: { id: productId }
      });

      if (!product) throw new Error("Producto no encontrado");

      // 4. DETERMINAR CAMPO GLOBAL SEGÚN NOMBRE DEL PRODUCTO
      const productName = product.name.toLowerCase();
      let updateField = "";

      if (productName.includes("mojado")) {
        updateField = "wetCoffeeQuantity";
      } else if (productName.includes("cafe") || productName.includes("café")) {
        updateField = "coffeeQuantity";
      } else if (
        productName.includes("frijol") || 
        productName.includes("almendra") || 
        productName.includes("bean")
      ) {
        updateField = "beanQuantity";
      } else if (productName.includes("pasilla")) {
        updateField = "pasillaQuantity";
      } else if (productName.includes("cacao")) {
        updateField = "cacaoQuantity";
      } else {
        // Fallback por si no coincide con ninguno, puedes decidir si lanzar error
        throw new Error("El producto no pertenece a una categoría de inventario global válida");
      }

      // --- VALIDACIÓN DE STOCK GLOBAL DE LA EMPRESA ---
      if (Number(company[updateField]) < kgToDeliver) {
        throw new Error(`Stock global insuficiente en ${updateField}. Disponible: ${company[updateField]}kg`);
      }

      // 5. CREAR REGISTRO DE ENTREGA
      const delivery = await tx.delivery.create({
        data: {
          productKg: kgToDeliver,
          tenant: { connect: { id: tenantId } },
          partner: { connect: { id: partnerId } },
          product: { connect: { id: productId } }
        },
        include: {
          tenant: true,
          partner: true,
          product: true
        }
      });

      // 6. DESCONTAR STOCK DEL PRODUCTO (Local)
      await tx.product.update({
        where: { id: productId },
        data: {
          stock: { decrement: kgToDeliver }
        }
      });

      // 7. DESCONTAR INVENTARIO GLOBAL (Company)
      await tx.company.update({
        where: { id: tenantId },
        data: {
          [updateField]: { decrement: kgToDeliver }
        }
      });

      return delivery;
    });

    return res.status(201).json(result);

  } catch (error) {
    logger.error("Error al crear entrega:", error);
    return res.status(400).json({ // 400 es más apropiado para errores de validación
      error: error.message || "Error interno"
    });
  }
};

//////////////////////////////////////////////////////
// OBTENER ENTREGAS
//////////////////////////////////////////////////////

const getDeliveries = async (req, res) => {
  try {

    const tenantId = req.user.tenantId;

    const where =
      req.user.role === "SUPERADMIN"
        ? {}
        : { tenantId };

    const deliveries = await prisma.delivery.findMany({
      where,

      include: {
        tenant: true,
        partner: true,
        product: true
      },

      orderBy: {
        createdAt: "desc"
      }
    });

    return res.status(200).json(deliveries);

  } catch (error) {

    logger.error("Error al obtener entregas:", error);

    return res.status(500).json({
      error: "Error interno"
    });
  }
};

//////////////////////////////////////////////////////
// OBTENER ENTREGA POR ID
//////////////////////////////////////////////////////

const getDeliveryById = async (req, res) => {
  try {

    const { id } = req.params;

    const delivery = await prisma.delivery.findUnique({
      where: { id },

      include: {
        tenant: true,
        partner: true,
        product: true
      }
    });

    if (!delivery) {
      return res.status(404).json({
        error: "Entrega no encontrada"
      });
    }

    if (
      req.user.role !== "SUPERADMIN" &&
      delivery.tenantId !== req.user.tenantId
    ) {
      return res.status(403).json({
        error: "No autorizado"
      });
    }

    return res.status(200).json(delivery);

  } catch (error) {

    logger.error("Error al obtener entrega:", error);

    return res.status(500).json({
      error: "Error interno"
    });
  }
};

//////////////////////////////////////////////////////
// ACTUALIZAR ENTREGA
//////////////////////////////////////////////////////

const updateDelivery = async (req, res) => {
  try {

    const { id } = req.params;

    const {
      partnerId,
      productId,
      productKg
    } = req.body;

    const existingDelivery = await prisma.delivery.findUnique({
      where: { id },
      include: {
        product: true
      }
    });

    if (!existingDelivery) {
      return res.status(404).json({
        error: "Entrega no encontrada"
      });
    }

    if (
      req.user.role !== "SUPERADMIN" &&
      existingDelivery.tenantId !== req.user.tenantId
    ) {
      return res.status(403).json({
        error: "No autorizado"
      });
    }

    const updatedDelivery = await prisma.delivery.update({
      where: { id },

      data: {
        partnerId,
        productId,
        productKg
      },

      include: {
        tenant: true,
        partner: true,
        product: true
      }
    });

    return res.status(200).json(updatedDelivery);

  } catch (error) {

    logger.error("Error al actualizar entrega:", error);

    return res.status(500).json({
      error: "Error interno"
    });
  }
};

//////////////////////////////////////////////////////
// ELIMINAR ENTREGA
//////////////////////////////////////////////////////

const deleteDelivery = async (req, res) => {
  try {

    const { id } = req.params;

    const existingDelivery = await prisma.delivery.findUnique({
      where: { id }
    });

    if (!existingDelivery) {
      return res.status(404).json({
        error: "Entrega no encontrada"
      });
    }

    if (
      req.user.role !== "SUPERADMIN" &&
      existingDelivery.tenantId !== req.user.tenantId
    ) {
      return res.status(403).json({
        error: "No autorizado"
      });
    }

    await prisma.delivery.delete({
      where: { id }
    });

    return res.status(200).json({
      message: "Entrega eliminada"
    });

  } catch (error) {

    logger.error("Error al eliminar entrega:", error);

    return res.status(500).json({
      error: "Error interno"
    });
  }
};

module.exports = {
  createDelivery,
  getDeliveries,
  getDeliveryById,
  updateDelivery,
  deleteDelivery
};