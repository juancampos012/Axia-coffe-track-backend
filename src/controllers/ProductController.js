const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient();
const logger = require('../config/logger');

/**
 * Crear un nuevo Product
 */
const createProduct = async (req, res) => {
  try {
    const {
      tenantId,
      supplier,
      name,
      salePrice,
      description,
      purchasePrice,
      tax,
      stock
    } = req.body;
    console.log(req.body, req.body.supplier.id)

    const productCompany = await prisma.company.findUnique({
      where: {id: tenantId}
    })

    if (!productCompany) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    const newProduct = await prisma.product.create({
      data: {
        name,
        salePrice,
        purchasePrice,
        tax,
        description,
        stock,
        tenant: { connect: { id: tenantId}},
        supplier: { connect: { id: supplier.id }},
      },
    });
    logger.info(`Producto creado exitosamente: ${newProduct.id}`);
    return res.status(201).json(newProduct);
  } catch (error) {
    logger.error('Error al crear Product:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener todos los Products
 */
const getProducts = async (req, res) => {
  try {
    const { stock, salePrice, purchasePrice, supplier, tax, id, sortBy, order } = req.query;
    const tenantId = req.user.tenantId;
    
    // Condición base de filtrado por tenant
    let where = req.user.role === 'SUPERADMIN' ? {} : { tenantId };
    
    // Agregar filtros adicionales si existen
    if (id) where.id = { contains: id, mode: 'insensitive' };
    if (supplier) where.supplier = { name: { contains: supplier, mode: 'insensitive' } };
    
    // Filtros numéricos (con validación)
    if (stock && !isNaN(Number(stock))) where.stock = { gte: Number(stock) };
    if (salePrice && !isNaN(Number(salePrice))) where.salePrice = { gte: Number(salePrice) };
    if (purchasePrice && !isNaN(Number(purchasePrice))) where.purchasePrice = { gte: Number(purchasePrice) };
    if (tax && !isNaN(Number(tax))) where.tax = { gte: Number(tax) };
    
    // Configurar ordenamiento
    const validSortFields = ['id', 'name', 'salePrice', 'purchasePrice', 'tax', 'stock'];
    const sortField = sortBy && validSortFields.includes(sortBy) ? sortBy : 'id';
    const sortOrder = order === 'desc' ? 'desc' : 'asc';
    
    const orderBy = { [sortField]: sortOrder };

    const products = await prisma.product.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        name: true,
        salePrice: true,
        purchasePrice: true,
        tax: true,
        stock: true,
        supplier: { select: { name: true } },
      },
      orderBy
    });
    
    logger.info(`Se obtuvieron ${products.length} productos con filtros: ${JSON.stringify(req.query)}`);
    return res.status(200).json(products);
  } catch (error) {
    logger.error('Error al obtener Products:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const searchProductsByName = async (req, res) => {
  try {
    const { name } = req.query;
    const tenantId = req.user.tenantId;
    
    if (!name) {
      return res.status(400).json({ error: 'El parámetro de búsqueda "name" es requerido' });
    }

    const where = {
      name: {
        contains: name,
        mode: 'insensitive'
      },
      isDeleted: false,
      ...(req.user.role !== 'SUPERADMIN' && { tenantId: tenantId })
    };
        
    
    const products = await prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        salePrice: true,
        purchasePrice: true,
        tax: true,
        stock: true,
        supplier: { select: { name: true, id: true } },
      },
      orderBy: {
        name: 'asc',  
      }
    });
    
    logger.info(`Búsqueda de productos por nombre: "${name}". Se encontraron ${products.length} resultados`);
    return res.status(200).json(products);
  } catch (error) {
    logger.error('Error al buscar productos por nombre:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener Product por ID
 */
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN'
    ? { id }
    : { id, tenantId: tenantId };

    const product = await prisma.product.findUnique({
      where,
      include: {
        tenant: true,
        supplier: true,
      },
    });

    if (!product) {
      logger.warn(`Producto no encontrado con id: ${id}`);
      return res.status(404).json({ error: 'Product no encontrado' });
    }
    logger.info(`Producto obtenido exitosamente: ${id}`);
    return res.status(200).json(product);
  } catch (error) {
    logger.error('Error al obtener Product:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Actualizar Product
 */
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      supplierId,
      name,
      salePrice,
      purchasePrice,
      tax,
      stock
    } = req.body;

    const existingProduct = await prisma.product.findUnique({
      where: { id },
      select: { tenantId: true }
    });
    
    if (!existingProduct) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    if (req.user.role !== 'SUPERADMIN' && existingProduct.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de actualización no autorizado. Usuario: ${req.user.id}, Producto: ${id}`);
      return res.status(403).json({ error: 'No autorizado para modificar este producto' });
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        supplierId,
        name,
        salePrice,
        purchasePrice,
        tax,
        stock,
      },
    });
    logger.info(`Producto actualizado exitosamente: ${id}`);
    return res.status(200).json(updatedProduct);
  } catch (error) {
    logger.error('Error al actualizar Product:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Eliminar Product
 */
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const existingProduct = await prisma.product.findUnique({
      where: { id },
      select: { tenantId: true }
    });
    
    if (!existingProduct) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    if (req.user.role !== 'SUPERADMIN' && existingProduct.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de eliminación no autorizado. Usuario: ${req.user.id}, Producto: ${id}`);
      return res.status(403).json({ error: 'No autorizado para eliminar este producto' });
    }

    await prisma.product.update({
      where: { id },
      data: { isDeleted: true },
    });

    logger.info(`Producto eliminado exitosamente: ${id}`);
    return res.status(200).json({ message: 'Producto eliminado con éxito' });
  } catch (error) {
    logger.error('Error al eliminar Producto:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener productos públicos (versión limitada para SSG)
 */
const getPublicProducts = async (req, res) => {
  try {
    // Solo devuelve campos necesarios y sin información sensible
    const products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        salePrice: true,
        purchasePrice: true,
        tax: true,
        stock: true,
        supplier: { select: { name: true } },
      },
      take: 20 // Limitar número de resultados
    });
    
    logger.info(`Acceso público a lista de productos`);
    return res.status(200).json(products);
  } catch (error) {
    logger.error('Error al obtener productos públicos:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener producto público por ID
 */
const getPublicProductById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        salePrice: true,
        purchasePrice: true,
        tax: true,
        stock: true,
        supplier: { select: { name: true } },
      },
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    logger.info(`Acceso público a producto: ${id}`);
    return res.status(200).json(product);
  } catch (error) {
    logger.error('Error al obtener producto público:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};



module.exports = {createProduct, getProducts, getProductById, updateProduct, deleteProduct, searchProductsByName, getPublicProducts, getPublicProductById}