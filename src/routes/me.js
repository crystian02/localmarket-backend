import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.get('/me', authMiddleware, async (req, res) => {
  res.json({
    user: req.user
  });
});

export default router;