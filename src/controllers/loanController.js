const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');

const prisma = new PrismaClient();

// ==================== CONTROLADORES PRINCIPALES ====================

/**
 * Crear un nuevo préstamo (actualiza balance de la empresa)
 */
exports.createLoan = async (req, res) => {
  try {
    const { 
      clientId, 
      clientName, 
      clientIdentification, 
      amount, 
      description,
      status = false,
      tenantId // Necesitamos el tenantId para actualizar el balance
    } = req.body;

    // Validaciones
    if (!clientId || !clientName || !clientIdentification || !amount || !tenantId) {
      return res.status(400).json({ 
        error: 'Faltan campos obligatorios: clientId, clientName, clientIdentification, amount, tenantId' 
      });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }

    // Verificar si el cliente existe
    const clientExists = await prisma.client.findUnique({
      where: { id: clientId }
    });

    if (!clientExists) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Verificar si la empresa existe
    const companyExists = await prisma.company.findUnique({
      where: { id: tenantId }
    });

    if (!companyExists) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    // Crear el préstamo
    const loan = await prisma.loan.create({
      data: {
        clientId,
        clientName,
        clientIdentification,
        amount: parseFloat(amount),
        description: description || '',
        status: Boolean(status),
        tenantId // Guardar tenantId en el préstamo
      },
      include: {
        client: true
      }
    });

    // ACTUALIZAR BALANCE DE LA EMPRESA
    if (status === false) {
      // Si el préstamo es pendiente, RESTAR del balance (dinero sale de la caja)
      await prisma.company.update({
        where: { id: tenantId },
        data: { 
          currentBalance: { 
            decrement: parseFloat(amount) 
          }
        }
      });
    }
    // Si status es true (pagado al crear), no afecta el balance porque el dinero ya está en caja

    res.status(201).json(loan);
  } catch (error) {
    console.error('Error al crear préstamo:', error);
    res.status(500).json({ error: 'Error interno del servidor', details: error.message });
  }
};

/**
 * Obtener todos los préstamos
 */
exports.getAllLoans = async (req, res) => {
  try {
    const { status, tenantId } = req.query;
    
    const whereClause = {};
    
    // Si se pasa status como query param
    if (status !== undefined) {
      whereClause.status = status === 'true';
    }
    
    // Filtrar por tenantId si se proporciona
    if (tenantId !== undefined) {
      whereClause.tenantId = tenantId;
    }
    
    const loans = await prisma.loan.findMany({
      where: whereClause,
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            identification: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(loans);
  } catch (error) {
    console.error('Error al obtener préstamos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener préstamos pendientes
 */
exports.getPendingLoans = async (req, res) => {
  try {
    const { tenantId } = req.query;
    
    const whereClause = { status: false };
    
    // Filtrar por tenantId si se proporciona
    if (tenantId !== undefined) {
      whereClause.tenantId = tenantId;
    }
    
    const loans = await prisma.loan.findMany({
      where: whereClause,
      include: {
        client: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(loans);
  } catch (error) {
    console.error('Error al obtener préstamos pendientes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Actualizar estado de un préstamo (actualiza balance de la empresa)
 */
exports.updateLoanStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (typeof status !== 'boolean') {
      return res.status(400).json({ error: 'El campo status debe ser booleano (true/false)' });
    }

    // 1. Obtener el préstamo actual para conocer su estado previo
    const existingLoan = await prisma.loan.findUnique({
      where: { id },
      include: { client: true }
    });

    if (!existingLoan) {
      return res.status(404).json({ error: 'Préstamo no encontrado' });
    }

    // 2. Actualizar el estado del préstamo
    const updatedLoan = await prisma.loan.update({
      where: { id },
      data: { 
        status,
        updatedAt: new Date()
      },
      include: {
        client: true
      }
    });

    // 3. ACTUALIZAR BALANCE DE LA EMPRESA
    if (existingLoan.status !== status) {
      if (existingLoan.status === false && status === true) {
        // Cambio de PENDIENTE a PAGADO: SUMA al balance (dinero vuelve a la caja)
        await prisma.company.update({
          where: { id: existingLoan.tenantId },
          data: { 
            currentBalance: { 
              increment: existingLoan.amount 
            }
          }
        });
      } else if (existingLoan.status === true && status === false) {
        // Cambio de PAGADO a PENDIENTE: RESTA del balance (dinero sale de la caja)
        await prisma.company.update({
          where: { id: existingLoan.tenantId },
          data: { 
            currentBalance: { 
              decrement: existingLoan.amount 
            }
          }
        });
      }
    }

    res.json({
      ...updatedLoan,
      balanceUpdated: true
    });
  } catch (error) {
    console.error('Error al actualizar estado:', error);
    res.status(500).json({ error: 'Error interno del servidor', details: error.message });
  }
};

/**
 * Marcar préstamo como devuelto (wrapper para updateLoanStatus)
 */
exports.markLoanAsReturned = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener el préstamo para verificar su estado actual
    const existingLoan = await prisma.loan.findUnique({
      where: { id }
    });

    if (!existingLoan) {
      return res.status(404).json({ error: 'Préstamo no encontrado' });
    }

    // Si ya está pagado, no hacer nada
    if (existingLoan.status === true) {
      return res.status(400).json({ error: 'El préstamo ya está marcado como pagado' });
    }

    // Usar la función updateLoanStatus
    const loan = await prisma.loan.update({
      where: { id },
      data: { 
        status: true,
        updatedAt: new Date()
      },
      include: {
        client: true
      }
    });

    // Actualizar balance de la empresa
    await prisma.company.update({
      where: { id: existingLoan.tenantId },
      data: { 
        currentBalance: { 
          increment: existingLoan.amount 
        }
      }
    });

    res.json({
      ...loan,
      balanceUpdated: true
    });
  } catch (error) {
    console.error('Error al marcar como devuelto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ==================== FUNCIONES DE REPORTES ====================

/**
 * Obtener estadísticas de préstamos
 */
exports.getLoansStatistics = async (req, res) => {
  try {
    const { tenantId } = req.query;
    
    const whereClause = {};
    
    // Filtrar por tenantId si se proporciona
    if (tenantId !== undefined) {
      whereClause.tenantId = tenantId;
    }

    // Total pendientes (status = false)
    const totalPending = await prisma.loan.count({
      where: { ...whereClause, status: false }
    });

    // Monto total pendiente
    const pendingLoans = await prisma.loan.aggregate({
      where: { ...whereClause, status: false },
      _sum: { amount: true }
    });

    // Total devueltos (status = true)
    const totalReturned = await prisma.loan.count({
      where: { ...whereClause, status: true }
    });

    // Monto total devuelto
    const returnedLoans = await prisma.loan.aggregate({
      where: { ...whereClause, status: true },
      _sum: { amount: true }
    });

    res.json({
      totalPending,
      totalAmountPending: pendingLoans._sum.amount || 0,
      totalReturned,
      totalAmountReturned: returnedLoans._sum.amount || 0
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener préstamo por ID
 */
exports.getLoanById = async (req, res) => {
  try {
    const { id } = req.params;

    const loan = await prisma.loan.findUnique({
      where: { id },
      include: { client: true }
    });

    if (!loan) return res.status(404).json({ error: "Préstamo no encontrado" });

    res.json(loan);
  } catch (error) {
    console.error("Error al obtener préstamo:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

/**
 * Eliminar préstamo (actualiza balance de la empresa)
 */
exports.deleteLoan = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Obtener el préstamo antes de eliminarlo
    const loanToDelete = await prisma.loan.findUnique({
      where: { id }
    });

    if (!loanToDelete) {
      return res.status(404).json({ error: "Préstamo no encontrado" });
    }

    // 2. ACTUALIZAR BALANCE DE LA EMPRESA ANTES DE ELIMINAR
    if (loanToDelete.status === false) {
      // Si el préstamo está pendiente, SUMA al balance (se recupera el dinero)
      await prisma.company.update({
        where: { id: loanToDelete.tenantId },
        data: { 
          currentBalance: { 
            increment: loanToDelete.amount 
          }
        }
      });
    }
    // Si el préstamo está pagado, no afecta el balance al eliminarlo

    // 3. Eliminar el préstamo
    const loan = await prisma.loan.delete({
      where: { id }
    });

    res.json({ 
      message: "Préstamo eliminado", 
      loan,
      balanceUpdated: loanToDelete.status === false // Indica si se actualizó el balance
    });
  } catch (error) {
    console.error("Error al eliminar préstamo:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

/**
 * Obtener préstamos por cliente
 */
exports.getLoansByClient = async (req, res) => {
  try {
    const { clientId } = req.params;

    const loans = await prisma.loan.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      include: { client: true }
    });

    res.json(loans);
  } catch (error) {
    console.error("Error al obtener préstamos por cliente:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

/**
 * Generar recibo PDF del préstamo
 */
exports.generateLoanReceipt = async (req, res) => {
  try {
    const { id } = req.params;

    const loan = await prisma.loan.findUnique({
      where: { id },
      include: { 
        client: true,
        company: true // Incluir información de la empresa
      }
    });

    if (!loan) return res.status(404).json({ error: "Préstamo no encontrado" });

    const doc = new PDFDocument();
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=recibo_prestamo_${loan.id}.pdf`);
      res.send(pdfBuffer);
    });

    // Contenido del PDF
    doc.fontSize(20).text("RECIBO DE PRÉSTAMO", { align: "center" });
    doc.moveDown();

    // Información de la empresa
    if (loan.company) {
      doc.fontSize(10).text(`Empresa: ${loan.company.name}`, { align: "center" });
      doc.text(`NIT: ${loan.company.nit}`, { align: "center" });
      doc.moveDown();
    }

    // Información del préstamo
    doc.fontSize(12).text(`Cliente: ${loan.clientName}`);
    doc.text(`Identificación: ${loan.clientIdentification}`);
    doc.text(`Monto: $${loan.amount.toLocaleString('es-CO')}`);
    doc.text(`Descripción: ${loan.description || "N/A"}`);
    doc.text(`Estado: ${loan.status ? "Pagado" : "Pendiente"}`);
    doc.text(`Fecha de creación: ${loan.createdAt.toLocaleDateString('es-CO')}`);
    doc.text(`Fecha de actualización: ${loan.updatedAt.toLocaleDateString('es-CO')}`);
    
    doc.moveDown();
    doc.text(`ID del préstamo: ${loan.id}`);
    
    // Firma
    doc.moveDown(3);
    doc.text("__________________________", { align: "center" });
    doc.text("Firma del responsable", { align: "center" });

    doc.end();

  } catch (error) {
    console.error("Error al generar recibo:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

/**
 * Generar reporte global de préstamos
 */
exports.generateLoansReport = async (req, res) => {
  try {
    const { tenantId } = req.query;
    
    const whereClause = {};
    
    // Filtrar por tenantId si se proporciona
    if (tenantId !== undefined) {
      whereClause.tenantId = tenantId;
    }
    
    const loans = await prisma.loan.findMany({
      where: whereClause,
      include: { client: true },
      orderBy: { createdAt: "desc" }
    });

    // Obtener balance de la empresa
    let companyBalance = null;
    if (tenantId) {
      const company = await prisma.company.findUnique({
        where: { id: tenantId },
        select: { currentBalance: true, name: true }
      });
      companyBalance = company;
    }

    res.json({
      generatedAt: new Date(),
      company: companyBalance,
      total: loans.length,
      summary: {
        totalAmount: loans.reduce((sum, loan) => sum + loan.amount, 0),
        pendingAmount: loans.filter(l => !l.status).reduce((sum, loan) => sum + loan.amount, 0),
        paidAmount: loans.filter(l => l.status).reduce((sum, loan) => sum + loan.amount, 0),
        pendingCount: loans.filter(l => !l.status).length,
        paidCount: loans.filter(l => l.status).length
      },
      loans
    });
  } catch (error) {
    console.error("Error al generar reporte:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};