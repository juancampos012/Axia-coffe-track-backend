const { OpenAI } = require('openai');

const client = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'], 
});

const pirateAnswer = async (req, res) => {
  const response = await client.responses.create({
    model: 'gpt-4o',
    instructions: 'You are a coding assistant that talks like a pirate',
    input: 'Are semicolons optional in JavaScript?',
  });

  console.log(response.output_text);
  res.json({ answer: response.output_text });
};

const findBetterSuppliers = async (req, res) => {
  try {
    const { productId, searchPriority } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Debes especificar un producto.' });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { name: true, purchasePrice: true, supplierId: true },
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id: product.supplierId },
      select: { id: true, name: true, phone: true, nit: true },
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Proveedor asociado no encontrado.' });
    }

    const response = await client.responses.create({
      model: 'gpt-4o',
      instructions:
        'Eres AxiaProcure, un asistente experto en encontrar mejores proveedores para empresas. ' +
        'Tu tarea es evaluar el producto y proveedor actual, y sugerir opciones que puedan ofrecer ' +
        'mejores precios, planes de pago, tiempos de entrega o reputación, según la prioridad indicada. ' +
        'Muestra análisis detallado y recomendaciones prácticas para cambiar o renegociar condiciones.',
      input: `
        Producto actual: ${product.name}
        Precio de compra actual: $${product.purchasePrice}
        Proveedor actual: ${supplier.name}
        
        Prioridad de búsqueda: ${searchPriority || "General (precio y condiciones)"}
        
        Necesito encontrar alternativas de proveedores que puedan mejorar en esta prioridad. 
        Por favor, analiza y proporciona recomendaciones claras.
      `,
    });

    res.json({
      recommendations: response.output_text,
      currentProduct: product,
      currentSupplier: supplier,
    });
  } catch (error) {
    console.error('AI better suppliers error:', error);
    res.status(500).json({ error: 'Error buscando mejores proveedores' });
  }
};

const supplierAnalysis = async (req, res) => {
  try {
    const { productType, currentSuppliers, budget, urgency } = req.body;

    const supplierData =
      currentSuppliers ||
      (await prisma.supplier.findMany({
        where: { tenantId: req.user.tenantId },
        select: { id: true, name: true, email: true, phone: true, identification: true },
      }));

    const enhancedSupplierData = await Promise.all(
      supplierData.map(async (supplier) => {
        const invoiceCount = await prisma.purchaseInvoice.count({
          where: { supplierId: supplier.id },
        });

        return {
          ...supplier,
          reliability: invoiceCount > 10 ? 'Alta' : invoiceCount > 5 ? 'Media' : 'Baja',
          purchaseCount: invoiceCount,
        };
      })
    );

    const response = await client.responses.create({
      model: 'gpt-4o',
      instructions:
        'You are AxiaProcure, a procurement intelligence assistant specialized in supplier analysis. ' +
        'Analyze the provided supplier and product data to recommend optimal suppliers based on price, ' +
        'reliability, and market position. Provide specific, actionable insights on cost savings, ' +
        'negotiation points, and alternative suppliers. Format your response with clear sections and ' +
        'quantitative comparisons when possible. All recommendations should be business-focused and practical.',
      input: `I need an analysis of suppliers for ${productType}. Here are my current suppliers: ${JSON.stringify(
        enhancedSupplierData
      )}. My budget is ${budget} and my urgency level is ${urgency}/10.`,
    });

    res.json({
      recommendations: response.output_text,
      suppliers: enhancedSupplierData,
    });
  } catch (error) {
    console.error('AI supplier analysis error:', error);
    res.status(500).json({ error: 'Error processing supplier analysis' });
  }
};

const sectorTrends = async (req, res) => {
  try {
    const { tenantId, region, companySize } = req.body;

    const company = await prisma.company.findUnique({
      where: { id: tenantId },
      select: { sector: true },
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const businessSector = company.sector;

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
};

const productRecommendations = async (req, res) => {
  try {
    const { businessDescription, currentProducts, customerDemographics } = req.body;

    const productData =
      currentProducts ||
      (await prisma.product.findMany({
        where: { tenantId: req.user.tenantId },
        select: { name: true, stock: true, salePrice: true, purchasePrice: true, tax: true },
      }));

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
      input: `My business: "${businessDescription}". Current catalog: ${JSON.stringify(
        productData
      )}. My customers: ${customerDemographics}`,
    });

    res.json({ recommendations: response.output_text });
  } catch (error) {
    console.error('AI product recommendation error:', error);
    res.status(500).json({ error: 'Error processing product recommendations' });
  }
};

module.exports = {
  pirateAnswer,
  findBetterSuppliers,
  supplierAnalysis,
  sectorTrends,
  productRecommendations,
};
