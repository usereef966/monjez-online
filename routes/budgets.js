const express = require('express');
const router = express.Router();
const db = require('../index').db;

// جلب الميزانيات حسب القسم
router.get('/:section', async (req, res) => {
  const [budgets] = await db.query('SELECT * FROM budgets WHERE section=?', [req.params.section]);
  res.json(budgets);
});

// إضافة ميزانية
router.post('/', async (req, res) => {
  const { label, section, min_price, max_price } = req.body;

  await db.query(
    'INSERT INTO budgets (label, section, min_price, max_price) VALUES (?, ?, ?, ?)', 
    [label, section, min_price, max_price]
  );

  res.status(201).json({ message: 'Budget added' });
});


// تعديل ميزانية
router.put('/:id', async (req, res) => {
  const { label, section, min_price, max_price } = req.body;

  await db.query(
    'UPDATE budgets SET label=?, section=?, min_price=?, max_price=? WHERE id=?',
    [label, section, min_price, max_price, req.params.id]
  );

  res.json({ message: 'Budget updated' });
});


// حذف ميزانية
router.delete('/:id', async (req, res) => {
  await db.query('DELETE FROM budgets WHERE id=?', [req.params.id]);
  res.json({ message: 'Budget deleted' });
});

module.exports = router;