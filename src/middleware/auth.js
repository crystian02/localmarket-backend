import { supabaseAdmin } from '../config/supabase.js';
import { prisma } from '../config/prisma.js';

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token requerido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ message: 'Token inválido o expirado' });
    }

    const profile = await prisma.profile.findUnique({
      where: { id: user.id }
    });

    req.user = {
      id: user.id,
      email: user.email,
      role: profile?.role || 'buyer'
    };

    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error validando autenticación' });
  }
};