const express = require('express');

const {
  registrarUsuario,
  registrarConductor,
  registrarAdministrador,
  listarUsuarios,
  listarConductores,
  listarAdministradores,
  login
} = require('../controllers/usuarios.controller');

const router = express.Router();

router.post('/registrar/usuario', registrarUsuario);
router.post('/registrar/conductor', registrarConductor);
router.post('/registrar/admin', registrarAdministrador);



router.get('/listar/usuarios',listarUsuarios);
router.get('/listar/conductores',listarConductores);
router.get('/listar/admins',listarAdministradores);


router.post('/login',login);

module.exports=router;