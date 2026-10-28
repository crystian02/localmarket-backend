const { Server } = require('socket.io');

let ioInstance = null;

function setupSocketServer(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST']
    }
  });

  ioInstance = io;

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Token requerido'));
    }

    return next();
  });

  io.on('connection', (socket) => {
    console.log('Socket conectado:', socket.id);

    socket.on('driver:join_order', (orderId) => {
      if (!orderId) return;
      socket.join(`order_${orderId}`);
      socket.emit('driver:joined_order', { orderId });
    });

    socket.on('driver:update_location', (payload) => {
      try {
        const { orderId, lat, lng, driverId } = payload;

        if (!orderId || lat === undefined || lng === undefined) {
          return;
        }

        const eventData = {
          orderId,
          driverId: driverId || socket.id,
          lat,
          lng,
          updatedAt: new Date().toISOString()
        };

        io.to(`order_${orderId}`).emit('delivery:position_update', eventData);
        io.emit(`order:${orderId}:location`, eventData);
      } catch (error) {
        console.error('driver:update_location error:', error);
      }
    });

    socket.on('driver:update_status', (payload) => {
      try {
        const { orderId, status } = payload;

        if (!orderId || !status) return;

        const eventData = {
          orderId,
          status,
          updatedAt: new Date().toISOString()
        };

        io.to(`order_${orderId}`).emit('order:status_changed', eventData);
        io.emit(`order:${orderId}:status`, eventData);
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

function getSocketServer() {
  return ioInstance;
}

module.exports = {
  setupSocketServer,
  getSocketServer
};