const userController = require("../controllers/UserController");
const express = require('express');
const multer = require('multer');
const { authenticateJWT } = require('../middlewares/auth')
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuth')
const { assignTenant } = require('../middlewares/assignTenant');
const {requireRole} = require('../middlewares/requireRole')

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "./uploads/users");
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    },
})

const upload = multer({storage});

router.get('/search', authenticateJWT, userController.searchUsersByNameOrRole);

//* Ruta para inicializar superadmin
router.post('/initialize-super-admin', upload.single("avatar"), userController.initializeSuperAdmin);

//* Ruta para pruebas con Frontend
router.post('/new-user', authenticateJWT, upload.single("avatar"), userController.createUser);

//* 1. Creates a new user.
router.post("/", authenticateJWT,  assignTenant, upload.single("avatar"), requireRole('ADMIN', 'SUPERADMIN'), userController.createUser);

//* 2. Fetches all users.
router.get("/", authenticateJWT, requireRole('ADMIN', 'SUPERADMIN'), userController.getUsers);

//* 3. Fetches a specific user by its ID.
router.get("/:id", authenticateJWT, requireRole('ADMIN', 'SUPERADMIN' ), userController.getUserById);

//* 5. Deletes a user by its ID.
router.delete("/:id", authenticateJWT, requireRole('ADMIN', 'SUPERADMIN'), userController.deleteUser);

router.patch("/:id", authenticateJWT, requireRole('ADMIN', 'SUPERADMIN'), userController.updateUser);


// 7. Ruta para loguear un usuario 
router.post('/login', userController.login);

router.post('/logout', authenticateJWT, userController.logout);

// Rutas públicas (para generación estática)
router.get("/public/list", userController.getPublicUsers);
router.get("/public/:id", userController.getPublicUserById);

module.exports = router