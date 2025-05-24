const express = require('express');
const router = express.Router();
const { createOrder } = require('../../index');
const db = require('../../index').db;

router.post('/mobile', async (req, res) => {
  const { user_id, app_type_id, title, description, notes, audience, budget, budget_id, platform } = req.body;

  if (!user_id || !app_type_id || !description || !platform) {
    return res.status(400).json({ error: 'الحقول الأساسية مطلوبة' });
  }

  const isIOS = platform.toLowerCase() === 'ios';

  const id = await createOrder({
    user_id,
    app_type_id,
    title: title || description,
    description,
    audience: audience || null,
    notes: notes || null,
    budget: budget || null,
    budget_id: budget_id || null,
    type: isIOS ? 'iOS App' : 'Android App',
    section: 'تطبيقات الجوال',
    platform: isIOS ? 'iOS' : 'Android',
    status: 'قيد المعالجة',
  });

  res.json({ message: '✅ تم إرسال الطلب بنجاح!', order_id: id });
});

module.exports = router;
