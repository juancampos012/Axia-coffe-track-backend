// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const passport = require('passport');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const logger = require('./config/logger');
const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient();

const app = express();

const userRoutes = require('./routes/userRoutes');
const companyRoutes = require('./routes/companyRoutes');
const clientRoutes = require('./routes/clientRoutes');
const productRoutes = require('./routes/productRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const purchaseInvoiceRoutes = require('./routes/purchaseInvoiceRoutes');
const purchaseProductInvoiceRoutes = require('./routes/purchaseProductInvoiceRoutes');
const saleInvoiceRoutes = require('./routes/saleInvoiceRoutes');
const saleProductInvoiceRoutes = require('./routes/saleProductInvoiceRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const aiRoutes = require ('./routes/aiRoutes');
const supplierDepositRoutes = require('./routes/SupplierDepositRoutes');

// Middlewares básicos
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'https://axiainvoice.lat'],
  credentials: true,
  methods: ['POST', 'GET', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Configura Passport (JWT, etc.)
require('./config/passport'); 
app.use(passport.initialize());

// Ejemplo de uso de logger
logger.info('Iniciando aplicación...');

// Rutas estáticas (para servir archivos subidos con Multer)
app.use('/uploads', express.static('src/uploads'));

// Ejemplo de rutas
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/companies', companyRoutes);
app.use('/api/v1/clients', clientRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/purchase-invoices', purchaseInvoiceRoutes);
app.use('/api/v1/purchase-product-invoices', purchaseProductInvoiceRoutes);
app.use('/api/v1/sale-invoices', saleInvoiceRoutes);
app.use('/api/v1/sale-product-invoices', saleProductInvoiceRoutes);
app.use('/api/v1/suppliers', supplierRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/supplier-deposits', supplierDepositRoutes);

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend is running' });
});

app.use('/ai-tool', async (req, res) => {

	const response = await client.responses.create({
	  model: 'gpt-4o',
	  instructions: 'You are a coding assistant that talks like a pirate',
  	input: 'Are semicolons optional in JavaScript?',
	});

	console.log(response.output_text);
});

app.use('/api/v1/ai/supplier-analysis', async (req, res) => {
  try {
    const { productType, currentSuppliers, budget, urgency } = req.body;
    
    const supplierData = currentSuppliers || await prisma.supplier.findMany({
      where: { tenantId: req.user.tenantId },
      select: { 
        id: true,
        name: true,
        email: true,
        phone: true,
        identification: true
      }
    });
    
    const enhancedSupplierData = await Promise.all(supplierData.map(async supplier => {
      const invoiceCount = await prisma.purchaseInvoice.count({
        where: { supplierId: supplier.id }
      });
      
    /*const deliveryStats = await prisma.purchaseInvoice.aggregate({
        where: { supplierId: supplier.id },
        _avg: { deliveryTime: true }
      }); */
      
      return {
        ...supplier,
        reliability: invoiceCount > 10 ? "Alta" : invoiceCount > 5 ? "Media" : "Baja",
        purchaseCount: invoiceCount,
        // avgDeliveryTime: deliveryStats._avg?.deliveryTime || "No disponible"
      };
    }));
    
    const response = await client.responses.create({
      model: 'gpt-4o',
      instructions: 
        'You are AxiaProcure, a procurement intelligence assistant specialized in supplier analysis. ' +
        'Analyze the provided supplier and product data to recommend optimal suppliers based on price, ' +
        'reliability, and market position. Provide specific, actionable insights on cost savings, ' +
        'negotiation points, and alternative suppliers. Format your response with clear sections and ' +
        'quantitative comparisons when possible. All recommendations should be business-focused and practical.',
      input: `I need an analysis of suppliers for ${productType}. Here are my current suppliers: ${JSON.stringify(enhancedSupplierData)}. 
              My budget is ${budget} and my urgency level is ${urgency}/10. What suppliers should I consider and why?`,
    });

    res.json({ 
      recommendations: response.output_text,
      suppliers: enhancedSupplierData
    });
  } catch (error) {
    console.error('AI supplier analysis error:', error);
    res.status(500).json({ error: 'Error processing supplier analysis' });
  }
});

app.use('/api/v1/ai/sector-trends', async (req, res) => {
  try {
    const { businessSector, region, companySize } = req.body;
    
    const response = await client.responses.create({
      model: 'gpt-4o',
      instructions: 
        'You are AxiaTrends, a market intelligence specialist focusing on supplier trends across industries. ' +
        'Based on the business sector, region, and company characteristics provided, identify emerging and established ' +
        'suppliers that are gaining traction. Explain why these suppliers are trending (innovation, pricing, service quality, etc.) ' +
        'and how they might benefit the business. Include specific names when possible, categorize suppliers by specialty, ' +
        'and highlight any competitive advantages each offers. Prioritize actionable insights over general information.',
      input: `I run a ${companySize} business in the ${businessSector} sector based in ${region}. Which suppliers are currently trending in my industry, and why should I consider working with them?`,
    });

    res.json({ trends: response.output_text });
  } catch (error) {
    console.error('AI sector trend analysis error:', error);
    res.status(500).json({ error: 'Error processing sector trends' });
  }
});

app.use('/api/v1/ai/product-recommendations', async (req, res) => {
  try {
    const { businessDescription, currentProducts, customerDemographics } = req.body;
    
    const productData = currentProducts || await prisma.product.findMany({
      where: { tenantId: req.user.tenantId },
      select: { name: true, stock: true, salePrice: true, purchasePrice: true, tax: true }
    });
    
    const response = await client.responses.create({
      model: 'gpt-4o',
      instructions: 
        'You are AxiaCatalog, a product portfolio optimization specialist for businesses. ' +
        'Analyze the business description and current product catalog to recommend new products, ' +
        'categories, or services that would complement the existing offerings. Focus on strategic ' +
        'expansion opportunities, market gaps, cross-selling potential, and seasonal considerations. ' +
        'Format recommendations by priority, expected margin, and implementation difficulty. ' +
        'Include specific product names, estimated price points, and potential suppliers when possible. ' +
        'Consider customer demographics and industry trends in all recommendations.',
      input: `My business: "${businessDescription}". Here is my current product catalog: ${JSON.stringify(productData)}. 
              My typical customers are: ${customerDemographics}. What new products should I consider adding to my inventory?`,
    });

    res.json({ recommendations: response.output_text });
  } catch (error) {
    console.error('AI product recommendation error:', error);
    res.status(500).json({ error: 'Error processing product recommendations' });
  }
});

// Conexión a la base de datos con Prisma
async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info('Conexión a la base de datos establecida con éxito');
  } catch (error) {
    logger.error('Error al conectar a la base de datos:', error);
    process.exit(1); 
  }
}

// Inicia el servidor
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`Servidor corriendo en el puerto ${PORT}`);
  // Conectamos a la base de datos al arrancar
  connectDatabase();
});

async function cleanupRevokedTokens() {
  try {
    const expirationDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 horas
    await prisma.revokedToken.deleteMany({
      where: {
        createdAt: {
          lt: expirationDate
        }
      }
    });
    logger.info('Limpieza de tokens revocados completada');
  } catch (error) {
    logger.error('Error en limpieza de tokens:', error);
  }
}

// Ejecutar limpieza cada 24 horas
setInterval(cleanupRevokedTokens, 24 * 60 * 60 * 1000);