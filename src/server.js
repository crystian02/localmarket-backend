import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import meRoutes from './routes/me.js';

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

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});