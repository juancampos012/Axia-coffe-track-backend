const express = require('express');
const router = express.Router();

const expenseController = require('../controllers/ExpenseController');

const { authenticateJWT } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/requireRole');
const { assignTenant } = require('../middlewares/assignTenant');

//////////////////////////////////////////////////////
// EXPENSE ROUTES
//////////////////////////////////////////////////////

// Crear gasto
router.post(
  '/',
  authenticateJWT,
  assignTenant,
  requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'),
  expenseController.createExpense
);

// Obtener todos los gastos
router.get(
  '/',
  authenticateJWT,
  expenseController.getExpenses
);

// Obtener gasto por ID
router.get(
  '/:id',
  authenticateJWT,
  expenseController.getExpenseById
);

// Actualizar gasto
router.patch(
  '/:id',
  authenticateJWT,
  requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'),
  expenseController.updateExpense
);

// Eliminar gasto
router.delete(
  '/:id',
  authenticateJWT,
  requireRole('ADMIN', 'SUPERADMIN'),
  expenseController.deleteExpense
);

module.exports = router;