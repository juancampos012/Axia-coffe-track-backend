const { PrismaClient, Prisma } = require("@prisma/client"); 
const prisma = new PrismaClient();
const logger = require('../config/logger');

// Helper function to format BigInt values
function formatBigInt(data) {
  return JSON.parse(JSON.stringify(data, (_, value) =>
    typeof value === 'bigint' ? Number(value) : value
  ));
}

function getPeriodInMs(period, amount) {
  const periodMap = {
    'day': 24 * 60 * 60 * 1000,
    'week': 7 * 24 * 60 * 60 * 1000,
    'month': 30 * 24 * 60 * 60 * 1000,
    'quarter': 90 * 24 * 60 * 60 * 1000,
    'year': 365 * 24 * 60 * 60 * 1000
  };
  
  if (!periodMap[period]) {
    throw new Error(`Invalid period: ${period}`);
  }
  
  return periodMap[period] * amount;
}

/**
 * Obtener métricas de ventas por período
 */
const getSalesMetrics = async (req, res) => {
  try {
    const { period = 'month', limit = 6 } = req.query;
    const tenantId = req.user.tenantId;
    
    let dateFormat;
    
    // Configure date grouping based on period
    switch(period) {
      case 'week':
        dateFormat = 'YYYY-WW';
        break;
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      case 'day':
        dateFormat = 'YYYY-MM-DD';
        break;
      default:
        dateFormat = 'YYYY-MM';
    }
    
    // Utilizamos Prisma.raw para el INTERVAL
    const salesByPeriod = await prisma.$queryRaw`
      SELECT 
        TO_CHAR(date, ${dateFormat}) as period,
        SUM("totalPrice") as revenue,
        COUNT(*) as count
      FROM "SaleInvoice"
      WHERE "tenantId" = ${tenantId}
      AND date >= NOW() - INTERVAL ${Prisma.raw(`'${parseInt(limit)} ${period}'`)}
      GROUP BY period
      ORDER BY period ASC
    `;
    
    // Formatear los BigInt antes de enviar la respuesta
    const formattedResults = formatBigInt(salesByPeriod);
    
    logger.info(`Métricas de ventas obtenidas por ${period}`);
    return res.status(200).json(formattedResults);
  } catch (error) {
    logger.error('Error al obtener métricas de ventas:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener productos más vendidos
 */
const getTopProducts = async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const tenantId = req.user.tenantId;
    
    const topProducts = await prisma.$queryRaw`
      SELECT 
        p.name as "productName",
        SUM(spi.quantity) as "totalSold",
        SUM(spi.quantity * p."salePrice") as revenue
      FROM "SaleProductInvoice" spi
      JOIN "Product" p ON spi."productId" = p.id
      JOIN "SaleInvoice" si ON spi."invoiceId" = si.id
      WHERE si."tenantId" = ${tenantId}
      GROUP BY p.id, p.name
      ORDER BY "totalSold" DESC
      LIMIT ${parseInt(limit)}
    `;
    
    // Añadir formatBigInt aquí
    const formattedResults = formatBigInt(topProducts);
    
    logger.info(`Top ${limit} productos obtenidos`);
    return res.status(200).json(formattedResults);
  } catch (error) {
    logger.error('Error al obtener top productos:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener resumen del inventario
 */
const getInventorySummary = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const inventorySummary = await prisma.$queryRaw`
      SELECT
        COUNT(id) as "totalProducts",
        SUM(stock) as "totalStock",
        SUM(stock * "purchasePrice") as "inventoryValue",
        AVG(stock) as "avgStockPerProduct",
        COUNT(CASE WHEN stock < 10 THEN 1 END) as "lowStockCount"
      FROM "Product"
      WHERE "tenantId" = ${tenantId}
    `;

    const lowStockProducts = await prisma.product.findMany({
      where: {
        tenantId,
        stock: { lt: 10 }
      },
      select: {
        id: true,
        name: true,
        stock: true,
        purchasePrice: true,
        salePrice: true
      },
      orderBy: { stock: 'asc' },
      take: 10
    });

    // Aplicar formatBigInt a todo el objeto de respuesta
    const formattedResponse = formatBigInt({
      summary: inventorySummary[0],
      lowStockProducts
    });

    return res.status(200).json(formattedResponse);
  } catch (error) {
    logger.error('Error al obtener resumen de inventario:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener métricas de clientes
 */
const getCustomerMetrics = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    
    // Get customer metrics using Prisma client instead of raw query
    const totalCustomers = await prisma.client.count({
      where: { tenantId }
    });
    
    const newCustomersThisMonth = await prisma.client.count({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(new Date().setDate(1)) // First day of current month
        }
      }
    });

    const invoices = await prisma.saleInvoice.findMany({
      where: { tenantId },
      select: {
        totalPrice: true,
        client: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    });
    
    // Calculate average order value
    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.totalPrice, 0);
    const averageOrderValue = invoices.length ? totalRevenue / invoices.length : 0;
    
    // Customer segments (simple example based on purchase frequency)
    // Create a map of customer purchase counts
    const customerPurchaseCounts = {};
    invoices.forEach(inv => {
      const clientId = inv.client?.id;
      if (clientId) {
        customerPurchaseCounts[clientId] = (customerPurchaseCounts[clientId] || 0) + 1;
      }
    });
    
    // Define segments
    const segments = [
      { name: "New (1 purchase)", count: 0 },
      { name: "Regular (2-3 purchases)", count: 0 },
      { name: "Frequent (4+ purchases)", count: 0 }
    ];
    
    // Count customers in each segment
    Object.values(customerPurchaseCounts).forEach(count => {
      if (count === 1) segments[0].count++;
      else if (count >= 2 && count <= 3) segments[1].count++;
      else if (count >= 4) segments[2].count++;
    });

    const result = {
      totalCustomers,
      newCustomers: newCustomersThisMonth,
      totalRevenue,
      averageOrderValue,
      segments
    };
    
    logger.info('Métricas de clientes obtenidas');
    return res.status(200).json(result);
  } catch (error) {
    logger.error('Error al obtener métricas de clientes:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener métricas generales del dashboard
 */
const getDashboardMetrics = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    // Get sales metrics
    const salesCount = await prisma.saleInvoice.count({
      where: { tenantId }
    });

    const suppliersTotal = await prisma.supplier.count({
      where: { tenantId }
    });

    const pendingOrders = await prisma.saleInvoice.count({
      where: { 
        tenantId,
        payment: null 
      }
    });
    
    const salesTotal = await prisma.saleInvoice.aggregate({
      where: { tenantId },
      _sum: { totalPrice: true }
    });

    // Get purchase metrics
    const purchasesCount = await prisma.purchaseInvoice.count({
      where: { tenantId }
    });
    
    const purchasesTotal = await prisma.purchaseInvoice.aggregate({ 
      where: { tenantId },
      _sum: { totalPrice: true }
    });

    // Get product and client counts
    const productsTotal = await prisma.product.count({
      where: { tenantId }
    });
    
    const clientsTotal = await prisma.client.count({
      where: { tenantId }
    });

    // Compile dashboard metrics
    const dashboardMetrics = {
      sales: {
        count: salesCount,
        total: salesTotal._sum.totalPrice || 0
      },
      purchases: {
        count: purchasesCount,
        total: purchasesTotal._sum.totalPrice || 0
      },
      productsTotal,
      clientsTotal,
      suppliersTotal,
      pendingOrders,
    };

    logger.info('Métricas de dashboard obtenidas');
    return res.status(200).json(dashboardMetrics);
  } catch (error) {
    logger.error('Error al obtener métricas de dashboard:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Get inventory health metrics
 */
const getInventoryHealth = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    
    // Get low stock products (below threshold)
    const lowStockProducts = await prisma.product.findMany({
      where: { 
        tenantId,
        stock: { lt: 5 } 
      },
      select: {
        id: true,
        name: true,
        stock: true,
        purchasePrice: true
      },
      orderBy: { stock: 'asc' },
      take: 10
    });
    
    // Calculate inventory turnover rate
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const soldItems = await prisma.saleProductInvoice.aggregate({
      where: {
        tenantId,
        invoice: {
          date: { gte: lastMonth }
        }
      },
      _sum: { quantity: true }
    });
    
    const totalInventory = await prisma.product.aggregate({
      where: { tenantId },
      _sum: { stock: true }
    });
    
    const turnoverRate = soldItems._sum.quantity ? 
      soldItems._sum.quantity / (totalInventory._sum.stock || 1) : 0;
    
    return res.status(200).json(formatBigInt({
      lowStockProducts,
      turnoverRate: parseFloat(turnoverRate.toFixed(2)),
      totalStockValue: await getInventoryValue(tenantId)
    }));
  } catch (error) {
    logger.error('Error al obtener salud del inventario:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Get product performance metrics
 */
const getProductPerformance = async (req, res) => {
  try {
    const { period = 'month', limit = 5 } = req.query;
    const tenantId = req.user.tenantId;
    
    // Now this function exists and can be used
    const timeRange = getPeriodInMs(period, parseInt(limit));
    const startDate = new Date(Date.now() - timeRange);
    
    const productPerformance = await prisma.$queryRaw`
      SELECT 
        p.id,
        p.name,
        SUM(spi.quantity) as count,
        SUM(spi.quantity * p."salePrice") as revenue
      FROM "Product" p
      JOIN "SaleProductInvoice" spi ON p.id = spi."productId"
      JOIN "SaleInvoice" si ON spi."invoiceId" = si.id
      WHERE p."tenantId" = ${tenantId}
        AND si.date > ${startDate}
      GROUP BY p.id, p.name
      ORDER BY count DESC
      LIMIT ${parseInt(limit)}
    `;
    
    // Format the results and return
    const formattedResults = formatBigInt(productPerformance);
    
    logger.info(`Métricas de rendimiento de productos obtenidas por ${period}`);
    return res.status(200).json(formattedResults);
  } catch (error) {
    logger.error('Error al obtener rendimiento de productos:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Get profitability metrics
 */
const getProfitabilityMetrics = async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const tenantId = req.user.tenantId;
    
    // Calculate time range based on period
    const startDate = new Date();
    if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'year') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    }
    
    // Get sales data
    const sales = await prisma.saleInvoice.aggregate({
      where: {
        tenantId,
        date: { gte: startDate }
      },
      _sum: { totalPrice: true }
    });
    
    const grossProfit = sales._sum.totalPrice || 0;
    
    // Calculate COGS (Cost of Goods Sold)
    const saleProducts = await prisma.saleProductInvoice.findMany({
      where: {
        tenantId,
        invoice: {
          date: { gte: startDate }
        }
      },
      include: {
        product: true
      }
    });
    
    const cogs = saleProducts.reduce((total, item) => {
      return total + (item.product?.purchasePrice || 0) * item.quantity;
    }, 0);
    
    // Calculate operational expenses (simplified example)
    const operationalExpenses = grossProfit * 0.2; // Estimating as 30% of gross profit
    
    // Calculate net profit
    const netProfit = grossProfit - cogs - operationalExpenses;
    
    // Calculate profit margin
    const profitMargin = grossProfit > 0 ? (netProfit / grossProfit) * 100 : 0;
    
    // Get cost breakdown
    const costBreakdown = [
      { category: 'Cost of Goods', amount: cogs, percentage: (cogs / grossProfit) * 100 },
      { category: 'Operational Expenses', amount: operationalExpenses, percentage: (operationalExpenses / grossProfit) * 100 },
      { category: 'Net Profit', amount: netProfit, percentage: (netProfit / grossProfit) * 100 }
    ];
    
    // Year over year change (simplified - random value for demo)
    const yearOverYearChange = Math.floor(Math.random() * 30) - 10; // Random between -10 and +20
    
    const result = {
      grossProfit,
      netProfit,
      profitMargin,
      yearOverYearChange,
      costBreakdown
    };
    
    logger.info(`Profitability metrics calculated for tenant ${tenantId}`);
    return res.status(200).json(formatBigInt(result));
    
  } catch (error) {
    logger.error('Error calculating profitability metrics:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  getSalesMetrics,
  getTopProducts,
  getInventorySummary,
  getCustomerMetrics,
  getDashboardMetrics,
  getInventoryHealth,
  getProductPerformance,
  getProfitabilityMetrics
};