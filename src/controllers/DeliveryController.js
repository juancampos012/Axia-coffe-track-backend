const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const logger = require("../config/logger");

function getCompanyQuantityField(productName) {
  const name = (productName || '').toLowerCase();
  if (name.includes("mojado")) return "wetCoffeeQuantity";
  if (name.includes("cafe") || name.includes("café")) return "coffeeQuantity";
  if (name.includes("frijol") || name.includes("almendra") || name.includes("bean")) return "beanQuantity";
  if (name.includes("pasilla")) return "pasillaQuantity";
  if (name.includes("cacao")) return "cacaoQuantity";
  return null;
}

/**
 * Consume `kgToConsume` de los lotes de compra (SaleProductInvoice) más antiguos
 * primero (FIFO), dentro de la transacción `tx`, para los productos de la misma
 * categoría que `productId`. Crea un DeliveryConsumption por cada lote tocado.
 * Lanza error si no hay suficientes kilos disponibles en los lotes.
 * Devuelve el costo total (FIFO) de los kilos consumidos.
 */
async function consumeLotsFIFO(tx, { tenantId, categoryProductIds, kgToConsume, deliveryId }) {
  if (kgToConsume <= 0) return 0;

  const lots = await tx.saleProductInvoice.findMany({
    where: {
      tenantId,
      productId: { in: categoryProductIds },
      remainingQuantity: { gt: 0 },
    },
    include: { invoice: { select: { date: true } } },
    orderBy: [{ invoice: { date: 'asc' } }],
  });

  let remaining = kgToConsume;
  let totalCost = 0;

  for (const lot of lots) {
    if (remaining <= 0) break;
    const available = Number(lot.remainingQuantity);
    const take = Math.min(available, remaining);
    if (take <= 0) continue;

    await tx.saleProductInvoice.update({
      where: { id: lot.id },
      data: { remainingQuantity: { decrement: take } },
    });

    await tx.deliveryConsumption.create({
      data: {
        deliveryId,
        saleProductInvoiceId: lot.id,
        quantity: take,
        unitPriceAtConsumption: lot.unitPrice,
      },
    });

    totalCost += take * Number(lot.unitPrice || 0);
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error(
      `Stock insuficiente en lotes de compra registrados. Faltan ${remaining.toFixed(2)}kg por cubrir (posiblemente stock cargado antes del sistema de lotes).`
    );
  }

  return totalCost;
}

/**
 * Revierte (devuelve a los lotes) todo lo consumido por una entrega.
 */
async function reverseLotsForDelivery(tx, deliveryId) {
  const consumptions = await tx.deliveryConsumption.findMany({ where: { deliveryId } });
  for (const c of consumptions) {
    await tx.saleProductInvoice.update({
      where: { id: c.saleProductInvoiceId },
      data: { remainingQuantity: { increment: c.quantity } },
    });
  }
  await tx.deliveryConsumption.deleteMany({ where: { deliveryId } });
}

//////////////////////////////////////////////////////
// CREAR ENTREGA
//////////////////////////////////////////////////////

const createDelivery = async (req, res) => {
  try {
    const { tenantId, partnerId, productId, quantity, unit, productKg, pricePerUnit, totalPrice, createDebt } = req.body;

    // Compatibilidad retroactiva: si viene productKg sin quantity, usamos productKg como cantidad kg
    const deliveryUnit    = unit || 'kg';
    const deliveryQty     = quantity !== undefined ? Number(quantity) : Number(productKg || 0);
    // Para descontar stock siempre usamos kg: si unit===kg usamos quantity, si no, productKg equiv
    const kgToDeliver = deliveryUnit === 'kg'
      ? deliveryQty
      : (productKg !== undefined ? Number(productKg) : 0);

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
      const updateField = getCompanyQuantityField(product.name);
      if (!updateField) {
        throw new Error("El producto no pertenece a una categoría de inventario global válida");
      }

      // --- VALIDACIÓN DE STOCK GLOBAL DE LA EMPRESA (solo si hay kg a descontar) ---
      if (kgToDeliver > 0 && Number(company[updateField]) < kgToDeliver) {
        throw new Error(`Stock global insuficiente en ${updateField}. Disponible: ${company[updateField]}kg`);
      }

      // 5. CREAR REGISTRO DE ENTREGA
      const deliveryData = {
        quantity: deliveryQty,
        unit: deliveryUnit,
        tenant: { connect: { id: tenantId } },
        partner: { connect: { id: partnerId } },
        product: { connect: { id: productId } }
      };

      // Campos opcionales
      if (productKg !== undefined) deliveryData.productKg = Number(productKg);
      if (pricePerUnit !== undefined) deliveryData.pricePerUnit = Number(pricePerUnit);
      if (totalPrice !== undefined) deliveryData.totalPrice = Number(totalPrice);

      const delivery = await tx.delivery.create({
        data: deliveryData,
        include: {
          tenant: true,
          partner: true,
          product: true
        }
      });

      // 6 & 7. DESCONTAR STOCK consumiendo lotes de compra FIFO (más antiguos primero)
      if (kgToDeliver > 0) {
        const categoryProductIds = (
          await tx.product.findMany({ where: { tenantId }, select: { id: true, name: true } })
        )
          .filter((p) => getCompanyQuantityField(p.name) === updateField)
          .map((p) => p.id);

        const costOfGoods = await consumeLotsFIFO(tx, {
          tenantId,
          categoryProductIds,
          kgToConsume: kgToDeliver,
          deliveryId: delivery.id,
        });

        await tx.delivery.update({ where: { id: delivery.id }, data: { costOfGoods } });

        await tx.product.update({
          where: { id: productId },
          data: { stock: { decrement: kgToDeliver } }
        });

        await tx.company.update({
          where: { id: tenantId },
          data: { [updateField]: { decrement: kgToDeliver } }
        });
      }

      // 8. CREAR DEUDA AL ALIADO (opcional)
      let debtCreated = false;
      if (createDebt === true && totalPrice !== undefined && Number(totalPrice) > 0) {
        await tx.partnerAccount.create({
          data: {
            tenantId,
            partnerId,
            originalAmount: Number(totalPrice),
            pendingAmount: Number(totalPrice),
            description: `Entrega — ${product.name}`,
          }
        });
        debtCreated = true;
      }

      return { ...delivery, debtCreated };
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

    // Whitelist de campos editables
    const { quantity, unit, productKg, pricePerUnit, totalPrice } = req.body;

    const existingDelivery = await prisma.delivery.findUnique({
      where: { id },
      include: { product: true }
    });

    if (!existingDelivery) {
      return res.status(404).json({ error: "Entrega no encontrada" });
    }

    if (
      req.user.role !== "SUPERADMIN" &&
      existingDelivery.tenantId !== req.user.tenantId
    ) {
      return res.status(403).json({ error: "No autorizado" });
    }

    // --- CALCULAR DIFERENCIA DE KG PARA AJUSTAR STOCK ---
    const oldUnit = existingDelivery.unit || 'kg';
    const oldKg   = oldUnit === 'kg'
      ? Number(existingDelivery.quantity)
      : Number(existingDelivery.productKg || 0);

    const newUnit = unit !== undefined ? unit : oldUnit;
    const newQty  = quantity !== undefined ? Number(quantity) : Number(existingDelivery.quantity);
    const newKg   = newUnit === 'kg'
      ? newQty
      : (productKg !== undefined ? Number(productKg) : Number(existingDelivery.productKg || 0));

    const diff = newKg - oldKg; // positivo = más stock consumido, negativo = se devuelve stock

    const result = await prisma.$transaction(async (tx) => {

      // Construir datos de actualización
      const updateData = {};
      if (quantity !== undefined)     updateData.quantity     = Number(quantity);
      if (unit !== undefined)         updateData.unit         = unit;
      if (productKg !== undefined)    updateData.productKg    = Number(productKg);
      if (pricePerUnit !== undefined) updateData.pricePerUnit = Number(pricePerUnit);
      if (totalPrice !== undefined)   updateData.totalPrice   = Number(totalPrice);

      const updatedDelivery = await tx.delivery.update({
        where: { id },
        data: updateData,
        include: { tenant: true, partner: true, product: true }
      });

      // Ajustar stock solo si cambió la cantidad en kg
      if (diff !== 0) {
        const updateField = getCompanyQuantityField(existingDelivery.product.name);

        if (updateField) {
          // Revertir todo lo consumido por esta entrega y volver a consumir FIFO con la nueva cantidad
          await reverseLotsForDelivery(tx, id);

          await tx.product.update({
            where: { id: existingDelivery.productId },
            data: { stock: { increment: oldKg } }
          });
          await tx.company.update({
            where: { id: existingDelivery.tenantId },
            data: { [updateField]: { increment: oldKg } }
          });

          if (newKg > 0) {
            const categoryProductIds = (
              await tx.product.findMany({ where: { tenantId: existingDelivery.tenantId }, select: { id: true, name: true } })
            )
              .filter((p) => getCompanyQuantityField(p.name) === updateField)
              .map((p) => p.id);

            const costOfGoods = await consumeLotsFIFO(tx, {
              tenantId: existingDelivery.tenantId,
              categoryProductIds,
              kgToConsume: newKg,
              deliveryId: id,
            });
            updateData.costOfGoods = costOfGoods;

            await tx.product.update({
              where: { id: existingDelivery.productId },
              data: { stock: { decrement: newKg } }
            });
            await tx.company.update({
              where: { id: existingDelivery.tenantId },
              data: { [updateField]: { decrement: newKg } }
            });
          } else {
            updateData.costOfGoods = 0;
          }

          await tx.delivery.update({ where: { id }, data: { costOfGoods: updateData.costOfGoods } });
          updatedDelivery.costOfGoods = updateData.costOfGoods;
        }
      }

      return updatedDelivery;
    });

    return res.status(200).json(result);

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
      where: { id },
      include: { product: true }
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

    await prisma.$transaction(async (tx) => {
      const updateField = getCompanyQuantityField(existingDelivery.product.name);
      const kg = existingDelivery.unit === 'kg'
        ? Number(existingDelivery.quantity)
        : Number(existingDelivery.productKg || 0);

      if (updateField && kg > 0) {
        await reverseLotsForDelivery(tx, id);

        await tx.product.update({
          where: { id: existingDelivery.productId },
          data: { stock: { increment: kg } }
        });
        await tx.company.update({
          where: { id: existingDelivery.tenantId },
          data: { [updateField]: { increment: kg } }
        });
      }

      await tx.delivery.delete({ where: { id } });
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