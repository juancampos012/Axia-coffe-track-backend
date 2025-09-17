const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');
require('dotenv').config();

/**
 * Crear el primer superadmin del sistema
 */
const initializeSuperAdmin = async (req, res) => {
  try {
    const { initKey } = req.body;
    if (initKey !== process.env.INIT_SUPERADMIN_KEY) {
      logger.warn('Intento de inicialización de superadmin con clave inválida');
      return res.status(401).json({ error: 'Clave de inicialización inválida' });
    }

    // Verificar si ya existe algún usuario
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      logger.warn('Intento de crear superadmin inicial cuando ya existen usuarios');
      return res.status(400).json({ 
        error: 'No se puede crear el superadmin inicial: Ya existen usuarios en el sistema' 
      });
    }

    const { name, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatarUrl = req.file ? req.file.filename : "defaultAvatar.png";
    const avatar = `http://localhost:3001/uploads/users/${avatarUrl}`;

    const superAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'SUPERADMIN',
        avatar
      },
    });

    logger.info(`Superadmin inicial creado - ID: ${superAdmin.id}`);

    return res.status(201).json({
      id: superAdmin.id,
      name: superAdmin.name,
      email: superAdmin.email,
      role: superAdmin.role,
      avatar: superAdmin.avatar
    });

  } catch (error) {
    logger.error(`Error al crear superadmin inicial: ${error.message}`);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
    });
  }
};

/**
 * Crear un nuevo User
 */
const createUser = async (req, res) => {
  try {
    const { name, email, password, role, tenantId: bodyTenantId } = req.body;
    const authenticatedUser = req.user;

    if (role === 'SUPERADMIN' && authenticatedUser.role !== 'SUPERADMIN') {
      logger.warn(`Intento no autorizado de crear SUPERADMIN por usuario: ${authenticatedUser.id}`);
      return res.status(403).json({ error: 'No autorizado para crear superadministradores' });
    }

    let tenantId = null;
    
    if (authenticatedUser.role === 'SUPERADMIN') {
      tenantId = bodyTenantId || null;
      
      if (bodyTenantId) {
        const companyExists = await prisma.company.findUnique({
          where: { id: bodyTenantId }
        });
        if (!companyExists) {
          logger.error(`Empresa no encontrada: ${bodyTenantId} por superadmin: ${authenticatedUser.id}`);
          return res.status(404).json({ error: 'Empresa no encontrada' });
        }
      }
    } else {
      tenantId = authenticatedUser.tenantId;
    }

    const avatarUrl = req.file ? req.file.filename : "defaultAvatar.png";
    const avatar = `http://localhost:3001/uploads/users/${avatarUrl}`;

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: authenticatedUser.role === 'SUPERADMIN' ? role : 'USER',
        avatar,
        tenant: { connect: { id: tenantId}},
      },
    });

    logger.info(`Usuario creado - ID: ${newUser.id} | Rol: ${newUser.role} | Tenant: ${tenantId || 'N/A'} | Por: ${authenticatedUser.id}`);

    return res.status(201).json({
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      avatar: newUser.avatar,
      tenantId: newUser.tenantId
    });

  } catch (error) {
    logger.error(`Error creando usuario - ${error.message} | Datos: ${JSON.stringify(req.body)}`);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
    });
  }
};


const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        tenantId: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Password verification using bcrypt (missing in your snippet)
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      logger.warn(`Login fallido para email: ${email} (contraseña incorrecta)`);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // JWT generation and cookie setting (you have this part)
    const token = jwt.sign(
      { 
        id: user.id, 
        role: user.role,
        tenantId: user.tenantId 
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: process.env.JWT_EXPIRATION || '12h' }
    );

    res.cookie('authToken', token, {
      httpOnly: false, // impide acceso desde JS
      secure: process.env.NODE_ENV === 'production', // true en prod
      sameSite: 'none', // o 'none' si usas HTTPS y dominios diferentes
      maxAge: 43200000, // 12 horas
    });

    const userInfo = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    logger.info(`Login exitoso para usuario: ${user.id}`);
    return res.status(200).json({ user: userInfo });
  } catch (error) {
    logger.error('Error en login:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const logout = async (req, res) => {
  try {
    const token = req.cookies.authToken;
    
    if (!token) {
      logger.warn(`Intento de logout sin token - IP: ${req.ip}`);
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    await prisma.revokedToken.create({
      data: { token },
    });

    res.clearCookie('authToken');

    logger.info(`Logout exitoso - Token revocado: ${token.slice(-8)}... | IP: ${req.ip}`);
    return res.status(200).json({ message: 'Sesión cerrada con éxito' });
  } catch (error) {
    logger.error('Error al cerrar sesión:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener todos los Users
 */
const getUsers = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN'
    ? {}
    : { tenantId: tenantId };

    const users = await prisma.user.findMany({
      where,
      include: { tenant: true },
    });
    logger.info(`Se obtuvieron ${users.length} usuarios`);
    return res.status(200).json(users);
  } catch (error) {
    logger.error('Error al obtener Users:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener User por ID
 */
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;
    const where = req.user.role === 'SUPERADMIN'
    ? { id }
    : { id, tenantId: tenantId };

    const user = await prisma.user.findUnique({
      where,
      include: { tenant: true },
    });

    if (!user) {
      logger.warn(`Usuario no encontrado con id: ${id}`);
      return res.status(404).json({ error: 'User no encontrado' });
    }
    logger.info(`Usuario obtenido exitosamente: ${id}`);
    return res.status(200).json(user);
  } catch (error) {
    logger.error('Error al obtener User:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Actualizar User
 */
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role } = req.body;

    if (role === 'SUPERADMIN' && req.user.role !== 'SUPERADMIN') {
      return res.status(403).json({ error: 'No autorizado para convertir a superadministrador' });
    }

    const updateData = { name, email, role };
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { tenantId: true }
    });
    
    if (!existingUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    if (req.user.role !== 'SUPERADMIN' && existingUser.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de actualización no autorizado. Usuario: ${req.user.id}, Usuario: ${id}`);
      return res.status(403).json({ error: 'No autorizado para modificar este Usuario' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });
    logger.info(`Usuario actualizado exitosamente: ${id}`);
    return res.status(200).json(updatedUser);
  } catch (error) {
    logger.error('Error al actualizar Usuario:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Eliminar User
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { tenantId: true }
    });
    
    if (!existingUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    if (req.user.role !== 'SUPERADMIN' && existingUser.tenantId !== req.user.tenantId) {
      logger.warn(`Intento de eliminación no autorizado. Usuario: ${req.user.id}, Usuario: ${id}`);
      return res.status(403).json({ error: 'No autorizado para eliminar este Usuario' });
    }

    await prisma.user.delete({
      where: { id },
    });
    logger.info(`Usuario eliminado exitosamente: ${id}`);
    return res.status(200).json({ message: 'User eliminado con éxito' });
  } catch (error) {
    logger.error('Error al eliminar Usuario:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener productos públicos (versión limitada para SSG)
 */
const getPublicUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        tenant: { select: { name: true, id: true } },
      },
      take: 20 
    });
    
    logger.info(`Acceso público a lista de usuarios`);
    return res.status(200).json(users);
  } catch (error) {
    logger.error('Error al obtener usuarios públicos:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener producto público por ID
 */
const getPublicUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        tenant: { select: { name: true, id: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    logger.info(`Acceso público a usuario: ${id}`);
    return res.status(200).json(user);
  } catch (error) {
    logger.error('Error al obtener usuario público:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Buscar usuarios por nombre o rol
 */
const searchUsersByNameOrRole = async (req, res) => {
  try {
    const { name, role } = req.query;
    const tenantId = req.user.tenantId;
    
    if (!name && !role) {
      return res.status(400).json({ error: 'Se requiere al menos un parámetro de búsqueda (name o role)' });
    }
    
    let whereCondition = {};
    
    // Build the where condition based on parameters
    if (name) {
      whereCondition.name = { contains: name, mode: 'insensitive' };
    }
    
    if (role) {
      whereCondition.role = { equals: role };
    }
    
    // Add tenant condition if not SUPERADMIN
    if (req.user.role !== 'SUPERADMIN') {
      whereCondition.tenantId = tenantId;
    }
    
    const users = await prisma.user.findMany({
      where: whereCondition,
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      },
      orderBy: {
        name: 'asc'
      }
    });
    
    logger.info(`Búsqueda de usuarios. Parámetros: nombre="${name || ''}", rol="${role || ''}". Se encontraron ${users.length} resultados`);
    return res.status(200).json(users);
  } catch (error) {
    logger.error('Error al buscar usuarios:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  initializeSuperAdmin, 
  createUser, 
  login, 
  getUsers, 
  getUserById, 
  updateUser, 
  deleteUser, 
  logout, 
  getPublicUserById, 
  getPublicUsers,
  searchUsersByNameOrRole
}