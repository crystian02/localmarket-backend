import { supabaseAdmin } from '../config/supabase.js';

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

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return res.status(401).json({ message: 'Perfil no encontrado' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      full_name: profile.full_name || user.email,
      role: profile.role || 'buyer'
    };

    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ message: 'Error validando autenticación' });
  }
};