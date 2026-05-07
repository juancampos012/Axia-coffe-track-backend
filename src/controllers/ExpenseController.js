const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const logger = require('../config/logger');

//////////////////////////////////////////////////////
// CREAR GASTO
//////////////////////////////////////////////////////

const createExpense = async (req, res) => {
  try {
    const { tenantId, amount, description } = req.body;

    if (!tenantId || !amount || !description) {
      return res.status(400).json({
        error: 'tenantId, amount y description son obligatorios'
      });
    }

    if (parseFloat(amount) <= 0) {
      return res.status(400).json({
        error: 'El monto debe ser mayor a 0'
      });
    }

    // Verificar empresa
    const company = await prisma.company.findUnique({
      where: { id: tenantId }
    });

    if (!company) {
      return res.status(404).json({
        error: 'Empresa no encontrada'
      });
    }

    // Crear gasto
    const expense = await prisma.expense.create({
      data: {
        tenantId,
        amount: parseFloat(amount),
        description
      }
    });

    // Restar del balance
    await prisma.company.update({
      where: { id: tenantId },
      data: {
        currentBalance: {
          decrement: parseFloat(amount)
        }
      }
    });

    logger.info(`Gasto creado: ${expense.id}`);

    return res.status(201).json({
      message: 'Gasto creado correctamente',
      expense
    });

  } catch (error) {
    logger.error('Error al crear gasto:', error);
    return res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
};

//////////////////////////////////////////////////////
// OBTENER TODOS LOS GASTOS
//////////////////////////////////////////////////////

const getExpenses = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const where = req.user.role === 'SUPERADMIN'
      ? {}
      : { tenantId };

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        tenant: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return res.status(200).json(expenses);

  } catch (error) {
    logger.error('Error al obtener gastos:', error);

    return res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
};

//////////////////////////////////////////////////////
// OBTENER GASTO POR ID
//////////////////////////////////////////////////////

const getExpenseById = async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        tenant: true
      }
    });

    if (!expense) {
      return res.status(404).json({
        error: 'Gasto no encontrado'
      });
    }

    // Validación tenant
    if (
      req.user.role !== 'SUPERADMIN' &&
      expense.tenantId !== req.user.tenantId
    ) {
      return res.status(403).json({
        error: 'No autorizado'
      });
    }

    return res.status(200).json(expense);

  } catch (error) {
    logger.error('Error al obtener gasto:', error);

    return res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
};

//////////////////////////////////////////////////////
// ACTUALIZAR GASTO
//////////////////////////////////////////////////////

const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description } = req.body;

    const existingExpense = await prisma.expense.findUnique({
      where: { id }
    });

    if (!existingExpense) {
      return res.status(404).json({
        error: 'Gasto no encontrado'
      });
    }

    // Validación tenant
    if (
      req.user.role !== 'SUPERADMIN' &&
      existingExpense.tenantId !== req.user.tenantId
    ) {
      return res.status(403).json({
        error: 'No autorizado'
      });
    }

    const oldAmount = parseFloat(existingExpense.amount);
    const newAmount = parseFloat(amount);

    // Diferencia entre monto viejo y nuevo
    const difference = newAmount - oldAmount;

    // Actualizar gasto
    const updatedExpense = await prisma.expense.update({
      where: { id },
      data: {
        amount: newAmount,
        description
      }
    });

    // Ajustar balance
    if (difference > 0) {
      // Si aumentó el gasto -> restar diferencia
      await prisma.company.update({
        where: { id: existingExpense.tenantId },
        data: {
          currentBalance: {
            decrement: difference
          }
        }
      });
    } else if (difference < 0) {
      // Si bajó el gasto -> devolver diferencia
      await prisma.company.update({
        where: { id: existingExpense.tenantId },
        data: {
          currentBalance: {
            increment: Math.abs(difference)
          }
        }
      });
    }

    logger.info(`Gasto actualizado: ${id}`);

    return res.status(200).json({
      message: 'Gasto actualizado correctamente',
      expense: updatedExpense
    });

  } catch (error) {
    logger.error('Error al actualizar gasto:', error);

    return res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
};

//////////////////////////////////////////////////////
// ELIMINAR GASTO
//////////////////////////////////////////////////////

const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const existingExpense = await prisma.expense.findUnique({
      where: { id }
    });

    if (!existingExpense) {
      return res.status(404).json({
        error: 'Gasto no encontrado'
      });
    }

    // Validación tenant
    if (
      req.user.role !== 'SUPERADMIN' &&
      existingExpense.tenantId !== req.user.tenantId
    ) {
      return res.status(403).json({
        error: 'No autorizado'
      });
    }

    // Devolver dinero al balance
    await prisma.company.update({
      where: { id: existingExpense.tenantId },
      data: {
        currentBalance: {
          increment: parseFloat(existingExpense.amount)
        }
      }
    });

    // Eliminar gasto
    await prisma.expense.delete({
      where: { id }
    });

    logger.info(`Gasto eliminado: ${id}`);

    return res.status(200).json({
      message: 'Gasto eliminado correctamente'
    });

  } catch (error) {
    logger.error('Error al eliminar gasto:', error);

    return res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
};

//////////////////////////////////////////////////////
// EXPORTS
//////////////////////////////////////////////////////

module.exports = {
  createExpense,
  getExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense
};