import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { signToken } from '../utils/jwt.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, phone } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña son requeridos' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: 'Este email ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        fullName,
        phone,
        passwordHash,
        role: 'buyer'
      }
    });

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role
    });

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al registrar usuario' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role
    });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al iniciar sesión' });
  }
});

export default router;