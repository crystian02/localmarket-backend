// src/socket/index.js
import { Server } from 'socket.io';
import { supabaseAdmin } from '../config/supabase.js'; // Asegúrate de que esta ruta sea correcta

let ioInstance = null;

export function setupSocketServer(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST']
    }
  });

  ioInstance = io;

  // Middleware de autenticación REAL
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Token requerido'));

      // Validamos el token con Supabase (o tu sistema de auth)
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      
      if (error || !user) {
        return next(new Error('Token inválido o expirado'));
      }

      // Guardamos el usuario en el contexto del socket
      socket.user = user; 
      return next();
    } catch (err) {
      return next(new Error('Error de autenticación'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket conectado: ${socket.id} | Usuario: ${socket.user.id}`);

    socket.on('driver:join_order', (orderId) => {
      if (!orderId) return;
      // Nota: En un sistema ideal, aquí deberías verificar en BD si el usuario
      // es el cliente, el driver o el dueño de la tienda de este pedido.
      socket.join(`order_${orderId}`);
      socket.emit('driver:joined_order', { orderId });
    });

    socket.on('driver:update_location', (payload) => {
      try {
        const { orderId, lat, lng } = payload || {};

        if (!orderId || lat === undefined || lng === undefined) return;

        const eventData = {
          orderId,
          driverId: socket.user.id, // Ya no confiamos en el payload, usamos el ID del token
          lat,
          lng,
          updatedAt: new Date().toISOString()
        };

        // Solo enviamos a la sala de este pedido (eliminamos el io.emit global)
        io.to(`order_${orderId}`).emit('delivery:position_update', eventData);
      } catch (error) {
        console.error('driver:update_location error:', error);
      }
    });

    socket.on('driver:update_status', (payload) => {
      try {
        const { orderId, status } = payload || {};
        if (!orderId || !status) return;

        const eventData = {
          orderId,
          status,
          updatedAt: new Date().toISOString()
        };

        // Solo enviamos a la sala del pedido
        io.to(`order_${orderId}`).emit('order:status_changed', eventData);
      } catch (error) {
        console.error('driver:update_status error:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log('Socket desconectado:', socket.id);
    });
  });

  return io;
}

export function getSocketServer() {
  return ioInstance;
}