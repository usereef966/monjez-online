const express = require('express');
const router = express.Router();
const { db, verifyToken } = require('../index.js');

// جلب كل الرسائل للمستخدم الحالي
router.get('/inbox', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    let messages;

    if (userRole === 'admin') {
      // الإدمن يشوف كل الرسايل
      [messages] = await db.query(
        'SELECT inbox.*, sender.first_name AS sender_name FROM inbox INNER JOIN users AS sender ON inbox.sender_id = sender.id ORDER BY created_at DESC'
      );
    } else {
      // المستخدم العادي يشوف الرسايل الموجهة له
      [messages] = await db.query(
        'SELECT inbox.*, sender.first_name AS sender_name FROM inbox INNER JOIN users AS sender ON inbox.sender_id = sender.id WHERE receiver_id = ? ORDER BY created_at DESC',
        [userId]
      );
    }

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// إرسال رسالة جديدة
router.post('/inbox/send', verifyToken, async (req, res) => {
  const { receiver_id, subject, message } = req.body;
  const sender_id = req.user.id;

  try {
    await db.promise().query(
      'INSERT INTO inbox (sender_id, receiver_id, subject, message) VALUES (?, ?, ?, ?)',
      [sender_id, receiver_id, subject, message]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// تحديث حالة الرسالة (مقروءة)
router.put('/inbox/read/:id', verifyToken, async (req, res) => {
  const messageId = req.params.id;

  try {
    await db.promise().query(
      'UPDATE inbox SET is_read = TRUE WHERE id = ? AND receiver_id = ?',
      [messageId, req.user.id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// حذف رسالة
router.delete('/inbox/delete/:id', verifyToken, async (req, res) => {
  const messageId = req.params.id;

  try {
    await db.promise().query(
      'DELETE FROM inbox WHERE id = ? AND receiver_id = ?',
      [messageId, req.user.id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
