const bcrypt = require('bcrypt');
const  supabase  = require('../config/supabaseClient');
const {sendMessage}=require('../kafka/producer')

const crearUsuarioBase = async ({ correo, contrasena, rolNombre, nombre, telefono }) => {
  const { data: rolData, error: rolError } = await supabase
    .from('roles')
    .select('*')
    .eq('nombre', rolNombre)
    .single();

  if (rolError || !rolData) {
    throw new Error('Rol inválido');
  }

  // hash
  const hash = await bcrypt.hash(contrasena, 10);

  // crear usuario
  const { data: userData, error: userError } = await supabase
    .from('usuarios')
    .insert([{
      correo,
      contrasena: hash,
      rol_id: rolData.id,
      nombre,
      telefono
    }])
    .select()
    .single();

  if (userError) throw new Error(userError.message);

  return userData;
};


const registrarUsuario = async (req, res) => {
  try {
    const { correo, contrasena, nombre, telefono } = req.body;

    if (!correo || !contrasena) {
      return res.status(400).json({ error: 'Faltan campos' });
    }

    const user = await crearUsuarioBase({
      correo,
      contrasena,
      rolNombre: 'usuario',
      nombre,
      telefono
    });
    sendMessage('usuarios-events', {
        type: 'USUARIO_CREADO',
        data: {
            id: user.id,
            correo: user.correo,
            nombre: user.nombre
        }
    });
    res.json({ success: true, user });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


const registrarConductor = async (req, res) => {
  try {
    const { correo, contrasena, nombre, telefono, licencia, vehiculo } = req.body;

    if (!licencia) {
      return res.status(400).json({ error: 'Licencia requerida' });
    }

    const user = await crearUsuarioBase({
      correo,
      contrasena,
      rolNombre: 'conductor',
      nombre,
      telefono
    });

    const { error: conductorError } = await supabase
      .from('conductores')
      .insert([{
        usuario_id: user.id,
        licencia,
        vehiculo
      }]);

    if (conductorError) throw new Error(conductorError.message);
    sendMessage('usuarios-events', {
        type: 'CONDUCTOR_CREADO',
        data: {
            userId: user.id,
            licencia,
            vehiculo
        }
    });
    res.json({ success: true, user });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


const registrarAdministrador = async (req, res) => {
  try {
    const { correo, contrasena, nombre } = req.body;

    const user = await crearUsuarioBase({
      correo,
      contrasena,
      rolNombre: 'admin',
      nombre
    });
    sendMessage('usuarios-events', {
        type: 'ADMIN_CREADO',
        data: {
            id: user.id,
            correo: user.correo
        }
    });
    res.json({ success: true, user });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const listarUsuarios = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select(`
        id,
        correo,
        nombre,
        telefono,
        roles!inner(nombre)
      `)
      .eq('roles.nombre', 'usuario');

    if (error) throw new Error(error.message);

    res.json({ success: true, data });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


const listarConductores = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select(`
        id,
        correo,
        nombre,
        telefono,
        roles!inner(nombre),
        conductores (
          licencia,
          vehiculo
        )
      `)
      .eq('roles.nombre', 'conductor');

    if (error) throw new Error(error.message);
    sendMessage('usuarios-events', {
    type: 'LOGIN',
    data: {
        userId: user.id
    }
    });
    res.json({ success: true, data });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


const listarAdministradores = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select(`
        id,
        correo,
        nombre,
        roles!inner(nombre)
      `)
      .eq('roles.nombre', 'admin');

    if (error) throw new Error(error.message);

    res.json({ success: true, data });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


const login = async (req, res) => {
  try {
    const { correo, contrasena } = req.body;

    if (!correo || !contrasena) {
      return res.status(400).json({ error: 'Correo y contraseña requeridos' });
    }

    const { data: user, error } = await supabase
      .from('usuarios')
      .select(`
        id,
        correo,
        nombre,
        contrasena,
        roles(nombre)
      `)
      .eq('correo', correo)
      .single();

    if (error || !user) {
      return res.status(400).json({ error: 'Usuario no existe' });
    }

    const valid = await bcrypt.compare(contrasena, user.contrasena);

    if (!valid) {
      return res.status(400).json({ error: 'Contraseña incorrecta' });
    }

    sendMessage('usuarios-events', {
        type: 'LOGIN',
        data: {
            userId: user.id
        }
    });
    
    res.json({
      success: true,
      user: {
        id: user.id,
        correo: user.correo,
        nombre: user.nombre,
        rol: user.roles?.nombre || null
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
};




module.exports = {
  registrarUsuario,
  registrarConductor,
  registrarAdministrador,
  listarUsuarios,
  listarConductores,
  listarAdministradores,
  login
};