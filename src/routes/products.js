import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

router.get('/shops/:shopId/products', authMiddleware, async (req, res) => {
  try {
    const { shopId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.json(data);
  } catch (error) {
    console.error('GET /shops/:shopId/products error:', error);
    return res.status(500).json({ message: 'Error obteniendo productos' });
  }
});

router.post('/shops/:shopId/products', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    const { shopId } = req.params;
    const {
      name,
      description,
      price_cents,
      stock,
      brand,
      tags,
      image_url
    } = req.body;

    if (!name || price_cents === undefined || stock === undefined) {
      return res.status(400).json({ message: 'name, price_cents y stock son requeridos' });
    }

    const { data: shop, error: shopError } = await supabaseAdmin
      .from('shops')
      .select('id, owner_id')
      .eq('id', shopId)
      .maybeSingle();

    if (shopError) {
      return res.status(400).json({ message: shopError.message });
    }

    if (!shop) {
      return res.status(404).json({ message: 'Tienda no encontrada' });
    }

    const isOwner = shop.owner_id === req.user.id;
    const isAdmin = ['superadmin', 'shop_admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'No tienes permisos para agregar productos a esta tienda' });
    }

    if (Number(price_cents) < 0) {
      return res.status(400).json({ message: 'price_cents no puede ser negativo' });
    }

    if (Number(stock) < 0) {
      return res.status(400).json({ message: 'stock no puede ser negativo' });
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .insert([
        {
          shop_id: shopId,
          name,
          description: description || null,
          price_cents: Number(price_cents),
          stock: Number(stock),
          brand: brand || null,
          tags: tags || [],
          image_url: image_url || null,
          is_available: true,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(201).json({ product: data });
  } catch (error) {
    console.error('POST /shops/:shopId/products error:', error);
    return res.status(500).json({ message: 'Error creando producto' });
  }
});

router.patch('/shops/:shopId/products/:productId', authMiddleware, async (req, res) => {
  try {
    const { shopId, productId } = req.params;
    const {
      name,
      description,
      price_cents,
      stock,
      brand,
      tags,
      image_url,
      is_available
    } = req.body;

    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('shop_id', shopId)
      .maybeSingle();

    if (productError) {
      return res.status(400).json({ message: productError.message });
    }

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    const { data: shop, error: shopError } = await supabaseAdmin
      .from('shops')
      .select('owner_id')
      .eq('id', shopId)
      .maybeSingle();

    if (shopError) {
      return res.status(400).json({ message: shopError.message });
    }

    const isOwner = shop && shop.owner_id === req.user.id;
    const isAdmin = ['superadmin', 'shop_admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'No tienes permisos para editar este producto' });
    }

    const updatePayload = {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(price_cents !== undefined && { price_cents: Number(price_cents) }),
      ...(stock !== undefined && { stock: Number(stock) }),
      ...(brand !== undefined && { brand }),
      ...(tags !== undefined && { tags }),
      ...(image_url !== undefined && { image_url }),
      ...(is_available !== undefined && { is_available })
    };

    const { data, error } = await supabaseAdmin
      .from('products')
      .update(updatePayload)
      .eq('id', productId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.json({ product: data });
  } catch (error) {
    console.error('PATCH /shops/:shopId/products/:productId error:', error);
    return res.status(500).json({ message: 'Error actualizando producto' });
  }
});

export default router;