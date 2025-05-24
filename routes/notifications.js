const express = require('express');
const router = express.Router();
const { db, verifyToken } = require('../index.js');





// جلب الإشعارات للمستخدم الحالي
router.get('/notifications', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    let notifications;

    if (userRole === 'admin') {
      // الإدمن يشوف كل الإشعارات
      [notifications] = await db.query(
        'SELECT * FROM notifications ORDER BY created_at DESC'
      );
    } else {
      // المستخدم العادي يشوف فقط الموجهة له
      [notifications] = await db.query(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );
    }

    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// تحديث حالة الإشعار (مقروء)
router.put('/notifications/read/:id', verifyToken, async (req, res) => {
  const notificationId = req.params.id;

  try {
    await db.promise().query(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [notificationId, req.user.id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// حذف الإشعار
router.delete('/notifications/delete/:id', verifyToken, async (req, res) => {
  const notificationId = req.params.id;

  try {
    await db.promise().query(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [notificationId, req.user.id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
