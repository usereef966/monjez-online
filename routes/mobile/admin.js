const express = require('express');
const router = express.Router();
const db = require('../../index').db;
const { verifyToken } = require('../../index'); // استيراد الحماية

// جلب جميع خطط الموبايل حسب النوع (android أو ios) - بدون حماية
router.get('/', async (req, res) => {
  const type = req.query.type; // android or ios

  if (!type || !['android', 'ios'].includes(type.toLowerCase())) {
    return res.status(400).json({ error: 'النوع (type) مطلوب: android أو ios' });
  }

  try {
    const [plans] = await db.query('SELECT * FROM mobile_plans WHERE type=? ORDER BY price ASC', [type]);
    const planIds = plans.map(plan => plan.id);
    let features = [];

    if (planIds.length) {
      [features] = await db.query(`
        SELECT mpf.mobile_plan_id, mf.id, mf.name 
        FROM mobile_features mf
        INNER JOIN mobile_plan_features mpf ON mf.id = mpf.feature_id
        WHERE mpf.mobile_plan_id IN (?)
      `, [planIds]);
    }

    const result = plans.map(plan => ({
      ...plan,
      features: features.filter(f => f.mobile_plan_id === plan.id)
    }));

    res.json(result);

  } catch (err) {
    console.error('❌ خطأ في جلب خطط الموبايل:', err);
    res.status(500).json({ error: 'فشل في جلب خطط الموبايل' });
  }
});

// جلب خطة موبايل واحدة مع ميزاتها - بدون حماية
router.get('/:id', async (req, res) => {
  const planId = parseInt(req.params.id, 10);

  if (!planId) {
    return res.status(400).json({ error: 'رقم خطة الموبايل غير صالح' });
  }

  try {
    const [plans] = await db.query('SELECT * FROM mobile_plans WHERE id = ?', [planId]);
    if (!plans.length) {
      return res.status(404).json({ error: 'خطة الموبايل غير موجودة' });
    }
    const plan = plans[0];

    const [features] = await db.query(`
      SELECT f.id, f.name FROM mobile_features f
      INNER JOIN mobile_plan_features pf ON f.id = pf.feature_id
      WHERE pf.mobile_plan_id = ?
    `, [planId]);

    res.json({ ...plan, features });

  } catch (err) {
    console.error('❌ فشل في جلب بيانات خطة الموبايل:', err);
    res.status(500).json({ error: 'فشل في جلب بيانات خطة الموبايل' });
  }
});

// إضافة خطة موبايل جديدة - محمي
router.post('/', verifyToken, async (req, res) => {
  const { name, title, description, budget, audience, price, unit, details, is_best, link, features, type, budget_id } = req.body;

  // ✅ تم حذف budget_id من الشرط
  if (!name || !title || !description || !price || !unit || !type || !['android', 'ios'].includes(type)) {
    return res.status(400).json({ error: 'الحقول (name, title, description, price, unit, type) مطلوبة' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO mobile_plans (name, title, description, budget, audience, price, unit, details, is_best, link, type, budget_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, title, description, budget, audience || null, price, unit, details || null, is_best || 0, link || null, type, budget_id || null]
    );

    const planId = result.insertId;

    if (Array.isArray(features) && features.length > 0) {
      const featureValues = features.map(featureId => [planId, featureId]);
      await db.query('INSERT INTO mobile_plan_features (mobile_plan_id, feature_id) VALUES ?', [featureValues]);
    }

    res.status(201).json({ message: '✅ تم إضافة خطة الموبايل بنجاح', planId });

  } catch (err) {
    console.error('❌ فشل في إضافة خطة الموبايل:', err);
    res.status(500).json({ error: 'فشل في إضافة خطة الموبايل' });
  }
});

// تعديل خطة موبايل موجودة - محمي
router.put('/:id', verifyToken, async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  const { name, title, description, budget, audience, price, unit, details, is_best, link, features, type, budget_id } = req.body;

  if (!planId || !name || !title || !description || !budget_id || !price || !unit || !type || !['android', 'ios'].includes(type)) {
    return res.status(400).json({ error: 'الحقول (id, name, title, description, budget_id, price, unit, type) مطلوبة' });
  }

  try {
    await db.query(
      'UPDATE mobile_plans SET name=?, title=?, description=?, budget=?, audience=?, price=?, unit=?, details=?, is_best=?, link=?, type=?, budget_id=? WHERE id=?',
      [name, title, description, budget, audience || null, price, unit, details || null, is_best || 0, link || null, type, budget_id || null, planId]
    );

    await db.query('DELETE FROM mobile_plan_features WHERE mobile_plan_id=?', [planId]);

    if (Array.isArray(features) && features.length > 0) {
      const featureValues = features.map(featureId => [planId, featureId]);
      await db.query('INSERT INTO mobile_plan_features (mobile_plan_id, feature_id) VALUES ?', [featureValues]);
    }

    res.json({ message: '✅ تم تحديث خطة الموبايل بنجاح!' });

  } catch (err) {
    console.error('❌ فشل في تحديث خطة الموبايل:', err);
    res.status(500).json({ error: 'فشل في تحديث خطة الموبايل' });
  }
});

// حذف خطة موبايل موجودة - محمي
router.delete('/:id', verifyToken, async (req, res) => {
  const planId = parseInt(req.params.id, 10);

  if (!planId) {
    return res.status(400).json({ error: 'رقم الخطة غير صالح' });
  }

  try {
    await db.query('DELETE FROM mobile_plans WHERE id=?', [planId]);
    res.json({ message: '✅ تم حذف خطة الموبايل بنجاح!' });

  } catch (err) {
    console.error('❌ فشل في حذف خطة الموبايل:', err);
    res.status(500).json({ error: 'فشل في حذف خطة الموبايل' });
  }
});




module.exports = router;
