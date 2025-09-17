const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient();
const logger = require('../config/logger');

/**
 * Crear un nuevo Payment
 */
const createPayment = async (req, res) => {
  try {
    const {
      tenantId,
      paymentDate,
      amount,
      paymentMethod,
      reference,
      invoiceId
    } = req.body;

    const paymentCompany = await prisma.company.findUnique({
        where: {id: tenantId}
      })
  
      if (!paymentCompany) {
        return res.status(404).json({ error: 'Empresa no encontrada' });
      }

    const newPayment = await prisma.payment.create({
      data: {
        paymentDate: new Date(),
        amount,
        paymentMethod,
        reference,
        tenant: {
            connect: { id: tenantId}},
        invoice: {
            connect: { id: invoiceId }
          }
      },
    });
    logger.info(`Pago creado exitosamente: ${newPayment.id}`);
    return res.status(201).json(newPayment);
  } catch (error) {
    logger.error('Error al crear Payment:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener todos los Payments
 */
const getPayments = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN' 
    ? {} 
    : { tenantId: tenantId };

    const payments = await prisma.payment.findMany({
      where,
      include: { tenant: true },
    });
    logger.info(`Se obtuvieron ${payments.length} pagos`);
    return res.status(200).json(payments);
  } catch (error) {
    logger.error('Error al obtener Payments:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener Payment por ID
 */
const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN'
    ? { id }
    : { id, tenantId: tenantId };

    const payment = await prisma.payment.findUnique({
      where,
      include: { tenant: true },
    });
    if (!payment) {
      logger.warn(`Pago no encontrado con id: ${id}`);
      return res.status(404).json({ error: 'Payment no encontrado' });
    }
    logger.info(`Pago obtenido exitosamente: ${id}`);
    return res.status(200).json(payment);
  } catch (error) {
    logger.error('Error al obtener Payment:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Actualizar Payment
 */
const updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      paymentDate,
      amount,
      paymentMethod,
      reference
    } = req.body;
    
    const existingPayment = await prisma.payment.findUnique({
      where: { id },
      select: { tenantId: true }
    });
    
    if (!existingPayment) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    
    if (req.user.role !== 'SUPERADMIN' && existingPayment.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de actualización no autorizado. Usuario: ${req.user.id}, Pago: ${id}`);
      return res.status(403).json({ error: 'No autorizado para modificar este pago' });
    }
    
    const updatedPayment = await prisma.payment.update({
      where: { id },
      data: {
        paymentDate: paymentDate ? new Date(paymentDate) : undefined,
        amount,
        paymentMethod,
        reference,
      },
    });
    
    logger.info(`Pago actualizado exitosamente: ${id}`);
    return res.status(200).json(updatedPayment);
  } catch (error) {
    logger.error('Error al actualizar pago:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Eliminar Payment
 */
const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;
    
    const existingPayment = await prisma.payment.findUnique({
      where: { id },
      select: { tenantId: true }
    });
    
    if (!existingPayment) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    
    if (req.user.role !== 'SUPERADMIN' && existingPayment.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de eliminación no autorizado. Usuario: ${req.user.id}, Pago: ${id}`);
      return res.status(403).json({ error: 'No autorizado para eliminar este Pago' });
    }
    
    await prisma.payment.delete({
      where: { id },
    });
    
    logger.info(`Pago eliminado exitosamente: ${id}`);
    return res.status(200).json({ message: 'Pago eliminado con éxito' });
  } catch (error) {
    logger.error('Error al eliminar Pago:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { createPayment, getPayments, getPaymentById, updatePayment, deletePayment }