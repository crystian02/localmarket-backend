//server.js
// LocalMarket backend server setup with Express and Supabase Auth

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';

import meRoutes from './routes/me.js';
import shopsRoutes from './routes/shops.js';
import productsRoutes from './routes/products.js';
import ordersRoutes from './routes/orders.js';
import changeRequestsRoutes from './routes/change-requests.js';
import paymentsRoutes from './routes/payments.js';
import deliveryRoutes from './routes/delivery.js';
import notificationsRoutes from './routes/notifications.js';
import supportRoutes from './routes/support.js';
import adsRoutes from './routes/ads.js';
import driversRoutes from './routes/drivers.js';

import errorHandler from './middleware/errorHandler.js';
import { setupSocketServer, getSocketServer } from './socket/index.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    message: 'LocalMarket backend funcionando con Supabase Auth',
    timestamp: new Date().toISOString()
  });
});

app.use('/api', meRoutes);
app.use('/api', shopsRoutes);
app.use('/api', productsRoutes);
app.use('/api', ordersRoutes);
app.use('/api', changeRequestsRoutes);
app.use('/api', paymentsRoutes);
app.use('/api', deliveryRoutes);
app.use('/api', notificationsRoutes);
app.use('/api', supportRoutes);
app.use('/api', adsRoutes);
app.use('/api', driversRoutes);

app.use(errorHandler);

const server = http.createServer(app);
setupSocketServer(server);

server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

export { app, getSocketServer };