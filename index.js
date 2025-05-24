require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
app.use(cors({
  origin: '*'
}));
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;
let db;

// Middleware للتحقق من التوكن
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized - No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized - Invalid token' });
  }
};

module.exports.verifyToken = verifyToken;

// دالة إنشاء طلب ديناميكي
async function createOrder(fields) {
  const cols = Object.keys(fields);
  const placeholders = cols.map(() => '?').join(', ');
  const values = Object.values(fields);
  const sql = `INSERT INTO orders (${cols.join(', ')}) VALUES (${placeholders})`;
  const [result] = await db.query(sql, values);
  return result.insertId;
}

// الدالة الرئيسية لتهيئة الاتصال والبدء
async function initDatabaseAndServer() {
  try {
    // 1. إنشاء الاتصال بقاعدة البيانات
    db = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });
    console.log('✅ تم الاتصال بقاعدة البيانات بنجاح!');
    module.exports.db = db;

    // 2. ميدلوير عامة
    app.use(cors());
    app.use(express.json());

    // 3. تركيب الراوترز بعد التأكد من وجود db
    app.use('/api', require('./routes/inbox'));
    app.use('/api', require('./routes/notifications'));
    
    app.use('/api/mobile-plans', require('./routes/mobile/admin'));
    app.use('/api/budgets', require('./routes/budgets'));




    
  


    // 4. روتات إضافية
    app.get('/', (req, res) =>
      res.send('🚀 Monjez API يعمل باستخدام mysql2/promise')
    );



app.post('/api/orders/mobile', async (req, res) => {
    console.log("BODY /api/orders/mobile:", req.body);

  const { user_id, app_type_id, app_name, idea, description, notes, audience, budget, budget_id, platform, selectedFeatures, details } = req.body;


  if (!user_id || !app_type_id || !app_name || !description || !platform) {
    return res.status(400).json({ error: 'الحقول الأساسية مطلوبة' });
  }

  const isIOS = platform.toLowerCase() === 'ios';

  let finalBudget = budget;
  let finalBudgetId = budget_id;

  if ((!budget || !budget_id) && app_type_id) {
    const [plans] = await db.query('SELECT budget_id FROM mobile_plans WHERE id=?', [app_type_id]);
    if (plans.length && plans[0].budget_id) {
      const [budgets] = await db.query('SELECT label FROM budgets WHERE id=?', [plans[0].budget_id]);
      if (budgets.length) {
        finalBudget = budgets[0].label;
        finalBudgetId = plans[0].budget_id;
      }
    }
  }

  // 1. أنشئ الطلب أولاً وخذ الـ id
  const id = await createOrder({
    user_id,
    app_type_id,
    title: app_name,
    description,
    idea: idea || null, // أضف هذا السطر
    notes: notes || null, // أضف هذا السطر
    audience: audience || null,
    notes: null, // لا تحفظ أي نص في notes عند الإنشاء
    details: details || null, // <-- أضف هذا السطر
    budget: finalBudget || null,
    budget_id: finalBudgetId || null,
    type: isIOS ? 'iOS App' : 'Android App',
    section: 'تطبيقات الجوال',
    platform: isIOS ? 'iOS' : 'Android',
    status: 'قيد المعالجة',
  });

  // ✅ حفظ فقط الميزات المختارة من المستخدم في notes
if (Array.isArray(selectedFeatures) && selectedFeatures.length) {
  // اجلب أسماء الميزات بناءً على الـ id
  const [rows] = await db.query(
    `SELECT name FROM mobile_features WHERE id IN (${selectedFeatures.map(() => '?').join(',')})`,
    selectedFeatures
  );
  const featuresText = rows.map(r => r.name).join("\n");
  await db.query(`UPDATE orders SET notes = ? WHERE id = ?`, [featuresText, id]);
}
  res.json({ message: '✅ تم إرسال الطلب بنجاح!', order_id: id });
});



////////////////////////////////////////////////////PLAN////////////////////////////////////////////////////


app.get('/api/features', async (req, res) => {
  const [features] = await db.query('SELECT id, name FROM features ORDER BY id ASC');
  res.json(features);
});


app.get('/api/web-features', async (req, res) => {
  const [features] = await db.query('SELECT id, name FROM web_features ORDER BY id ASC');
  res.json(features);
});



app.get('/api/plans', async (req, res) => {
  try {
    const [plans] = await db.query('SELECT * FROM plans ORDER BY price ASC');

    const planIds = plans.map(plan => plan.id);
    let features = [];

    if (planIds.length) {
      [features] = await db.query(`
        SELECT pf.plan_id, f.id, f.name
        FROM features f
        INNER JOIN plan_features pf ON f.id = pf.feature_id
        WHERE pf.plan_id IN (?)
      `, [planIds]);
    }

    const result = plans.map(plan => ({
      ...plan,
      features: features.filter(f => f.plan_id === plan.id)
    }));

    res.json(result);

  } catch (err) {
    console.error('❌ فشل في جلب الخطط مع الميزات:', err);
    res.status(500).json({ error: 'فشل في جلب الخطط مع الميزات' });
  }
});





    app.get('/api/plans/:id', async (req, res) => {
  const planId = parseInt(req.params.id, 10);

  if (!planId) {
    return res.status(400).json({ error: 'رقم الخطة غير صالح' });
  }

  try {
    // جلب بيانات الخطة
    const [plans] = await db.query('SELECT * FROM plans WHERE id = ?', [planId]);
    
    if (!plans.length) {
      return res.status(404).json({ error: 'الخطة غير موجودة' });
    }

    const plan = plans[0];

    // جلب ميزات الخطة
    const [features] = await db.query(`
      SELECT f.id, f.name FROM features f
      INNER JOIN plan_features pf ON f.id = pf.feature_id
      WHERE pf.plan_id = ?
    `, [planId]);

    res.json({ ...plan, features });

  } catch (err) {
    console.error('❌ فشل في جلب بيانات الخطة:', err);
    res.status(500).json({ error: 'فشل في جلب بيانات الخطة' });
  }
});


// إضافة خطة جديدة
app.post('/api/plans', async (req, res) => {
  const { name, price, unit, is_best, link, features } = req.body;

  if (!name || !price || !unit) {
    return res.status(400).json({ error: 'جميع الحقول (name, price, unit) مطلوبة' });
  }

  try {
    // إضافة الخطة
    const [result] = await db.query(
      'INSERT INTO plans (name, price, unit, is_best, link) VALUES (?, ?, ?, ?, ?)',
      [name, price, unit, is_best || 0, link || null]
    );

    const planId = result.insertId;

    // إضافة الميزات (إذا كانت موجودة)
    if (Array.isArray(features) && features.length > 0) {
      const featureValues = features.map(featureId => [planId, featureId]);
      await db.query('INSERT INTO plan_features (plan_id, feature_id) VALUES ?', [featureValues]);
    }

    res.status(201).json({ message: '✅ تم إضافة الخطة بنجاح', planId });

  } catch (err) {
    console.error('❌ فشل في إضافة الخطة:', err);
    res.status(500).json({ error: 'فشل في إضافة الخطة' });
  }
});



// تعديل خطة موجودة
app.put('/api/plans/:id', async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  const { name, price, unit, is_best, link, features } = req.body;

  if (!planId || !name || !price || !unit) {
    return res.status(400).json({ error: 'الحقل (id, name, price, unit) مطلوب' });
  }

  try {
    // تحديث بيانات الخطة
    await db.query(
      'UPDATE plans SET name=?, price=?, unit=?, is_best=?, link=? WHERE id=?',
      [name, price, unit, is_best || 0, link || null, planId]
    );

    // حذف الميزات القديمة
    await db.query('DELETE FROM plan_features WHERE plan_id=?', [planId]);

    // إضافة الميزات الجديدة (إذا موجودة)
    if (Array.isArray(features) && features.length > 0) {
      const featureValues = features.map(featureId => [planId, featureId]);
      await db.query('INSERT INTO plan_features (plan_id, feature_id) VALUES ?', [featureValues]);
    }

    res.json({ message: '✅ تم تحديث الخطة بنجاح!' });

  } catch (err) {
    console.error('❌ فشل في تحديث الخطة:', err);
    res.status(500).json({ error: 'فشل في تحديث الخطة' });
  }
});


// حذف خطة موجودة
app.delete('/api/plans/:id', async (req, res) => {
  const planId = parseInt(req.params.id, 10);

  if (!planId) {
    return res.status(400).json({ error: 'رقم الخطة غير صالح' });
  }

  try {
    // حذف الخطة (سيتم حذف الميزات تلقائياً بسبب ON DELETE CASCADE)
    await db.query('DELETE FROM plans WHERE id=?', [planId]);

    res.json({ message: '✅ تم حذف الخطة بنجاح!' });

  } catch (err) {
    console.error('❌ فشل في حذف الخطة:', err);
    res.status(500).json({ error: 'فشل في حذف الخطة' });
  }
});



////////////////////////////////////////////// جلب جميع خطط الموبايل مع الميزات://////////////////////////////////////////////////////////



// جلب الميزات حسب نوع الخطة (Android أو iOS)
// ✅ جلب جميع الميزات لنوع محدد
app.get('/api/mobile-features/:type', async (req, res) => {
  const type = req.params.type;
  const [features] = await db.query(`
    SELECT DISTINCT mf.id, mf.name 
    FROM mobile_features mf
    JOIN mobile_plan_features mpf ON mf.id = mpf.feature_id
    JOIN mobile_plans mp ON mp.id = mpf.mobile_plan_id
    WHERE mp.type = ?
  `, [type]);
  res.json(features);
});

// ✅ إضافة ميزة
app.post('/api/mobile-features', async (req, res) => {
  const { name } = req.body;
  await db.query('INSERT INTO mobile_features (name) VALUES (?)', [name]);
  res.json({ message: 'تمت الإضافة' });
});

// ✅ تعديل ميزة
app.put('/api/mobile-features/:id', async (req, res) => {
  const id = req.params.id;
  const { name } = req.body;
  await db.query('UPDATE mobile_features SET name=? WHERE id=?', [name, id]);
  res.json({ message: 'تم التعديل' });
});

// ✅ حذف ميزة
app.delete('/api/mobile-features/:id', async (req, res) => {
  const id = req.params.id;
  await db.query('DELETE FROM mobile_features WHERE id=?', [id]);
  res.json({ message: 'تم الحذف' });
});




/////////////////////////////////////////جلب كل خطط الـ SEO مع ميزاتها/////////////////////////////////////////////



app.get('/api/seo-features', async (req, res) => {
  const [features] = await db.query('SELECT id, name FROM seo_features');
  res.json(features);
});


app.post('/api/seo-features', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Feature name required' });

  try {
    const [result] = await db.query('INSERT INTO seo_features (name) VALUES (?)', [name]);
    res.status(201).json({ id: result.insertId, name });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add feature' });
  }
});


app.put('/api/seo-features/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'Invalid input' });

  try {
    await db.query('UPDATE seo_features SET name = ? WHERE id = ?', [name, id]);
    res.json({ message: 'Feature updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update feature' });
  }
});


app.delete('/api/seo-features/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid feature id' });

  try {
    await db.query('DELETE FROM seo_features WHERE id = ?', [id]);
    res.json({ message: 'Feature deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete feature' });
  }
});



app.post('/api/orders/seo', async (req, res) => {
  try {
    const { user_id, site, goal_id, keywords, details, budget_id } = req.body;
    if (!user_id || !site || !goal_id || !budget_id)
      return res.status(400).json({ error: 'الحقول (user_id, site, goal_id, budget_id) مطلوبة' });

    const id = await createOrder({
      user_id,
      seo_goal_id: goal_id,
      type: 'SEO Rocket',
      section: 'SEO & تسويق رقمي',
      platform: 'تهيئة المواقع (SEO)',
      site, // ✅ تم التعديل هنا (إرسال الموقع في حقل site)
      notes: keywords || null,
      details: details || null,
      budget_id,
      status: 'pending'
    });

    res.status(201).json({ message: '✅ تم استلام طلب SEO بنجاح!', order_id: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'فشل في إرسال طلب SEO' });
  }
});







// جلب جميع خطط الـ SEO مع ميزاتها
app.get('/api/seo-goals', async (req, res) => {
  try {
    const [goals] = await db.query(`
      SELECT sg.*, b.label AS budget_label, b.min_price, b.max_price
      FROM seo_goals sg
      LEFT JOIN budgets b ON sg.budget_id = b.id
      ORDER BY b.min_price ASC
    `);

    const goalIds = goals.map(goal => goal.id);
    let features = [];

    if (goalIds.length) {
      [features] = await db.query(`
        SELECT sgf.seo_goal_id, sf.id, sf.name 
        FROM seo_features sf
        INNER JOIN seo_goal_features sgf ON sf.id = sgf.feature_id
        WHERE sgf.seo_goal_id IN (?)
      `, [goalIds]);
    }

    const result = goals.map(goal => ({
      ...goal,
      features: features.filter(f => f.seo_goal_id === goal.id),
      budget: {
        id: goal.budget_id,
        label: goal.budget_label,
        min_price: goal.min_price,
        max_price: goal.max_price
      }
    }));

    res.json(result);
  } catch (err) {
    console.error('❌ خطأ في جلب خطط الـ SEO:', err);
    res.status(500).json({ error: 'فشل في جلب خطط الـ SEO' });
  }
});



// جلب خطة SEO واحدة مع ميزاتها
app.get('/api/seo-goals/:id', async (req, res) => {
  const goalId = parseInt(req.params.id, 10);

  if (!goalId) {
    return res.status(400).json({ error: 'رقم خطة الـ SEO غير صالح' });
  }

  try {
    const [goals] = await db.query(`
      SELECT sg.*, b.label AS budget_label, b.min_price, b.max_price
      FROM seo_goals sg
      LEFT JOIN budgets b ON sg.budget_id = b.id
      WHERE sg.id = ?
    `, [goalId]);
    
    if (!goals.length) {
      return res.status(404).json({ error: 'خطة الـ SEO غير موجودة' });
    }

    const goal = goals[0];

    const [features] = await db.query(`
      SELECT f.id, f.name FROM seo_features f
      INNER JOIN seo_goal_features gf ON f.id = gf.feature_id
      WHERE gf.seo_goal_id = ?
    `, [goalId]);

    res.json({ 
      ...goal, 
      features,
      budget: {
        id: goal.budget_id,
        label: goal.budget_label,
        min_price: goal.min_price,
        max_price: goal.max_price
      }
    });

  } catch (err) {
    console.error('❌ فشل في جلب بيانات خطة الـ SEO:', err);
    res.status(500).json({ error: 'فشل في جلب بيانات خطة الـ SEO' });
  }
});




// إضافة خطة SEO جديدة
app.post('/api/seo-goals', async (req, res) => {
  const { name, description, budget_id, unit, duration, is_popular, link, features } = req.body;

  if (!name || !budget_id || !unit) {
    return res.status(400).json({ error: 'الحقول (name, budget_id, unit) مطلوبة' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO seo_goals (name, description, budget_id, unit, duration, is_popular, link) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, description || null, budget_id, unit, duration || null, is_popular || 0, link || null]
    );

    const goalId = result.insertId;

    if (Array.isArray(features) && features.length > 0) {
      const featureValues = features.map(featureId => [goalId, featureId]);
      await db.query('INSERT INTO seo_goal_features (seo_goal_id, feature_id) VALUES ?', [featureValues]);
    }

    res.status(201).json({ message: '✅ تم إضافة خطة الـ SEO بنجاح', goalId });

  } catch (err) {
    console.error('❌ فشل في إضافة خطة الـ SEO:', err);
    res.status(500).json({ error: 'فشل في إضافة خطة الـ SEO' });
  }
});




// تعديل خطة SEO موجودة
app.put('/api/seo-goals/:id', async (req, res) => {
  const goalId = parseInt(req.params.id, 10);
  const { name, description, budget_id, unit, duration, is_popular, link, features } = req.body;

  if (!goalId || !name || !budget_id || !unit) {
    return res.status(400).json({ error: 'الحقول (id, name, budget_id, unit) مطلوبة' });
  }

  try {
    await db.query(
      'UPDATE seo_goals SET name=?, description=?, budget_id=?, unit=?, duration=?, is_popular=?, link=? WHERE id=?',
      [name, description || null, budget_id, unit, duration || null, is_popular || 0, link || null, goalId]
    );

    await db.query('DELETE FROM seo_goal_features WHERE seo_goal_id=?', [goalId]);

    if (Array.isArray(features) && features.length > 0) {
      const featureValues = features.map(featureId => [goalId, featureId]);
      await db.query('INSERT INTO seo_goal_features (seo_goal_id, feature_id) VALUES ?', [featureValues]);
    }

    res.json({ message: '✅ تم تحديث خطة الـ SEO بنجاح!' });

  } catch (err) {
    console.error('❌ فشل في تحديث خطة الـ SEO:', err);
    res.status(500).json({ error: 'فشل في تحديث خطة الـ SEO' });
  }
});



// حذف خطة SEO موجودة
app.delete('/api/seo-goals/:id', async (req, res) => {
  const goalId = parseInt(req.params.id, 10);

  if (!goalId) {
    return res.status(400).json({ error: 'رقم الخطة غير صالح' });
  }

  try {
    await db.query('DELETE FROM seo_goals WHERE id=?', [goalId]);
    res.json({ message: '✅ تم حذف خطة الـ SEO بنجاح!' });
  } catch (err) {
    res.status(500).json({ error: 'فشل في حذف خطة الـ SEO' });
  }
});



app.put('/api/admin/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const [[order]] = await db.query('SELECT section, platform FROM orders WHERE id=?', [id]);

    if (!order) return res.status(404).json({ error: 'Order not found' });

    let columnName;
switch(order.section){
  case 'SEO & تسويق رقمي':
    columnName = 'seo_status';
    break;
  case 'تطبيقات الجوال':
    columnName = order.platform === 'iOS' ? 'ios_status' : 'android_status';
    break;
  case 'برمجة مواقع':
  case 'Web':
    columnName = 'web_status';
    break;
  case 'تطوير الأنظمة':
    columnName = 'system_status';
    break;
  case 'خدمات المطورين':
    columnName = 'developer_status';
    break;
  default:
    columnName = 'status';
}

    await db.query(`UPDATE orders SET ${columnName}=? WHERE id=?`, [status, id]);
    res.json({ message: 'Order status updated successfully!' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});




app.post('/api/admin/orders/bulk-delete', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'No orders provided' });
  }

  await db.query(`DELETE FROM orders WHERE id IN (?)`, [ids]);
  res.json({ message: 'Orders deleted successfully' });
});












//////////////////////////////////////////////////////////////جلب جميع الأنواع مع ميزاتها ويب //////////////////////////////////////////////////////////////////////


// جلب جميع أنواع المواقع مع الميزات
app.get('/api/site_types', async (req, res) => {
  try {
    const [types] = await db.query('SELECT * FROM site_types ORDER BY price ASC');

    const typeIds = types.map(type => type.id);
    let features = [];

    if (typeIds.length) {
      [features] = await db.query(`
SELECT wtf.web_type_id, wf.id, wf.name 
FROM web_features wf
INNER JOIN web_type_features wtf ON wf.id = wtf.feature_id
WHERE wtf.web_type_id IN (?)
      `, [typeIds]);
    }

const result = types.map(type => ({
  ...type,
  features: features.filter(f => f.web_type_id === type.id) // ← عدل هنا فقط
}));

    res.json(result);

  } catch (err) {
    console.error('❌ خطأ في جلب أنواع المواقع:', err);
    res.status(500).json({ error: 'فشل في جلب أنواع المواقع' });
  }
});


// جلب نوع موقع واحد مع ميزاته
app.get('/api/site_types/:id', async (req, res) => {
  const typeId = parseInt(req.params.id, 10);

  if (!typeId) {
    return res.status(400).json({ error: 'رقم نوع الموقع غير صالح' });
  }

  try {
    const [types] = await db.query('SELECT * FROM site_types WHERE id = ?', [typeId]);

    if (!types.length) {
      return res.status(404).json({ error: 'نوع الموقع غير موجود' });
    }

    const type = types[0];

    const [features] = await db.query(`
      SELECT f.id, f.name FROM web_features f
      INNER JOIN web_type_features tf ON f.id = tf.feature_id
      WHERE tf.web_type_id = ?
    `, [typeId]);

    res.json({ ...type, features });

  } catch (err) {
    console.error('❌ فشل في جلب نوع الموقع:', err);
    res.status(500).json({ error: 'فشل في جلب نوع الموقع' });
  }
});

// إضافة نوع موقع جديد
app.post('/api/site_types', async (req, res) => {
  const { name, description, price, unit, is_popular, link, features } = req.body;

  if (!name || !price || !unit) {
    return res.status(400).json({ error: 'الحقول (name, price, unit) مطلوبة' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO site_types (name, description, price, unit, is_popular, link) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description || null, price, unit, is_popular || 0, link || null]
    );

    const typeId = result.insertId;

    if (Array.isArray(features) && features.length > 0) {
      const featureValues = features.map(featureId => [typeId, featureId]);
      await db.query('INSERT INTO web_type_features (web_type_id, feature_id) VALUES ?', [featureValues]);
    }

    res.status(201).json({ message: '✅ تم إضافة نوع الموقع بنجاح', typeId });

  } catch (err) {
    console.error('❌ فشل في إضافة نوع الموقع:', err);
    res.status(500).json({ error: 'فشل في إضافة نوع الموقع' });
  }
});




// تعديل نوع موقع موجود
app.put('/api/site_types/:id', async (req, res) => {
  const typeId = parseInt(req.params.id, 10);
  const { name, description, price, unit, is_popular, link, features } = req.body;

  if (!typeId || !name || !price || !unit) {
    return res.status(400).json({ error: 'الحقول (id, name, price, unit) مطلوبة' });
  }

  try {
    await db.query(
      'UPDATE site_types SET name=?, description=?, price=?, unit=?, is_popular=?, link=? WHERE id=?',
      [name, description || null, price, unit, is_popular || 0, link || null, typeId]
    );

    await db.query('DELETE FROM web_type_features WHERE web_type_id=?', [typeId]);

    if (Array.isArray(features) && features.length > 0) {
      const featureValues = features.map(featureId => [typeId, featureId]);
      await db.query('INSERT INTO web_type_features (web_type_id, feature_id) VALUES ?', [featureValues]);
    }

    res.json({ message: '✅ تم تحديث نوع الموقع بنجاح!' });

  } catch (err) {
    console.error('❌ فشل في تحديث نوع الموقع:', err);
    res.status(500).json({ error: 'فشل في تحديث نوع الموقع' });
  }
});

// حذف نوع موقع موجود
app.delete('/api/site_types/:id', async (req, res) => {
  const typeId = parseInt(req.params.id, 10);

  if (!typeId) {
    return res.status(400).json({ error: 'رقم نوع الموقع غير صالح' });
  }

  try {
    await db.query('DELETE FROM web_type_features WHERE site_type_id=?', [typeId]); // 👈 مهم جدًا
    await db.query('DELETE FROM site_types WHERE id=?', [typeId]);
    res.json({ message: '✅ تم حذف نوع الموقع بنجاح!' });

  } catch (err) {
    console.error('❌ فشل في حذف نوع الموقع:', err);
    res.status(500).json({ error: 'فشل في حذف نوع الموقع' });
  }
});



//////////////////////////////////////////////////////////////////////////////////////////////////////////////
// جلب جميع ميزات المطورين
app.get('/api/developer-features', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM developer_features ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error('❌ فشل في جلب ميزات المطور:', err);
    res.status(500).json({ error: 'فشل في جلب ميزات المطور' });
  }
});









app.get('/api/system-types', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM system_types ORDER BY id ASC');
  res.json(rows);
});

// جلب جميع خطط المطور مع الميزات
app.get('/api/web-developer', async (req, res) => {
  try {
    const [devPlans] = await db.query('SELECT * FROM web_developer ORDER BY price ASC');

    const devPlanIds = devPlans.map(dev => dev.id);
    let features = [];

    if (devPlanIds.length) {
      [features] = await db.query(`
        SELECT wdf.developer_id, df.id, df.name 
        FROM developer_features df
        INNER JOIN web_developer_features wdf ON df.id = wdf.feature_id
        WHERE wdf.developer_id IN (?)
      `, [devPlanIds]);
    }

    const result = devPlans.map(dev => ({
      ...dev,
      features: features.filter(f => f.developer_id === dev.id)
    }));

    res.json(result);

  } catch (err) {
    console.error('❌ خطأ في جلب خطط المطور:', err);
    res.status(500).json({ error: 'فشل في جلب خطط المطور' });
  }
});

// جلب خطة مطور واحدة مع ميزاتها
app.get('/api/web-developer/:id', async (req, res) => {
  const devId = parseInt(req.params.id, 10);

  if (!devId) {
    return res.status(400).json({ error: 'رقم خطة المطور غير صالح' });
  }

  try {
    const [devPlans] = await db.query('SELECT * FROM web_developer WHERE id = ?', [devId]);

    if (!devPlans.length) {
      return res.status(404).json({ error: 'خطة المطور غير موجودة' });
    }

    const devPlan = devPlans[0];

    const [features] = await db.query(`
      SELECT f.id, f.name FROM developer_features f
      INNER JOIN web_developer_features df ON f.id = df.feature_id
      WHERE df.developer_id = ?
    `, [devId]);

    res.json({ ...devPlan, features });

  } catch (err) {
    console.error('❌ فشل في جلب خطة المطور:', err);
    res.status(500).json({ error: 'فشل في جلب خطة المطور' });
  }
});

// إضافة خطة مطور جديدة
app.post('/api/web-developer', async (req, res) => {
  const { name, description, price, unit, duration, is_popular, link, features } = req.body;

  if (!name || !price || !unit) {
    return res.status(400).json({ error: 'الحقول (name, price, unit) مطلوبة' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO web_developer (name, description, price, unit, duration, is_popular, link) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, description || null, price, unit, duration || null, is_popular || 0, link || null]
    );

    const devId = result.insertId;

    if (Array.isArray(features) && features.length > 0) {
      const featureValues = features.map(featureId => [devId, featureId]);
      await db.query('INSERT INTO web_developer_features (developer_id, feature_id) VALUES ?', [featureValues]);
    }

    res.status(201).json({ message: '✅ تم إضافة خطة المطور بنجاح', devId });

  } catch (err) {
    console.error('❌ فشل في إضافة خطة المطور:', err);
    res.status(500).json({ error: 'فشل في إضافة خطة المطور' });
  }
});


// تعديل خطة مطور موجودة
app.put('/api/web-developer/:id', async (req, res) => {
  const devId = parseInt(req.params.id, 10);
  const { name, description, price, unit, duration, is_popular, link, features } = req.body;

  if (!devId || !name || !price || !unit) {
    return res.status(400).json({ error: 'الحقول (id, name, price, unit) مطلوبة' });
  }

  try {
    await db.query(
      'UPDATE web_developer SET name=?, description=?, price=?, unit=?, duration=?, is_popular=?, link=? WHERE id=?',
      [name, description || null, price, unit, duration || null, is_popular || 0, link || null, devId]
    );

    await db.query('DELETE FROM web_developer_features WHERE developer_id=?', [devId]);

    if (Array.isArray(features) && features.length > 0) {
      const featureValues = features.map(featureId => [devId, featureId]);
      await db.query('INSERT INTO web_developer_features (developer_id, feature_id) VALUES ?', [featureValues]);
    }

    res.json({ message: '✅ تم تحديث خطة المطور بنجاح!' });

  } catch (err) {
    console.error('❌ فشل في تحديث خطة المطور:', err);
    res.status(500).json({ error: 'فشل في تحديث خطة المطور' });
  }
});


// حذف خطة مطور موجودة
app.delete('/api/web-developer/:id', async (req, res) => {
  const devId = parseInt(req.params.id, 10);

  if (!devId) {
    return res.status(400).json({ error: 'رقم خطة المطور غير صالح' });
  }

  try {
    await db.query('DELETE FROM web_developer WHERE id=?', [devId]);
    res.json({ message: '✅ تم حذف خطة المطور بنجاح!' });

  } catch (err) {
    console.error('❌ فشل في حذف خطة المطور:', err);
    res.status(500).json({ error: 'فشل في حذف خطة المطور' });
  }
});


// جلب الميزات الخاصة بنوع خدمة معين حسب id الخدمة
app.get('/api/system-types/:id/features', async (req, res) => {
  const systemTypeId = parseInt(req.params.id, 10);

  try {
    const [features] = await db.query(`
      SELECT df.id, df.name
      FROM developer_features df
      INNER JOIN system_type_features stf ON df.id = stf.feature_id
      WHERE stf.system_type_id = ?
    `, [systemTypeId]);

    res.json(features);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في جلب ميزات الخدمة' });
  }
});



// لربط ميزات مع خدمة معينة من الإدارة
app.post('/api/system-types/:id/features', async (req, res) => {
  const systemTypeId = parseInt(req.params.id, 10);
  const { features } = req.body; // array of feature IDs

  try {
    await db.query('DELETE FROM system_type_features WHERE system_type_id = ?', [systemTypeId]);

    if (Array.isArray(features) && features.length) {
      const values = features.map(featureId => [systemTypeId, featureId]);
      await db.query('INSERT INTO system_type_features (system_type_id, feature_id) VALUES ?', [values]);
    }

    res.json({ message: 'تم تحديث الميزات بنجاح!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في تحديث الميزات' });
  }
});











app.get('/api/budgets', async (req, res) => {
  try {
    const section = req.query.section;
    let sql = 'SELECT id, label, value, min_price, max_price FROM budgets';
    let params = [];
    if (section) {
      sql += ' WHERE section = ?';
      params.push(section);
    }
    sql += ' ORDER BY min_price ASC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('❌ فشل في جلب الميزانيات:', err);
    res.status(500).json({ error: 'فشل في جلب الميزانيات' });
  }
});



    // Static lookups
    const staticEndpoints = [
      { path: '/api/site-types', table: 'site_types' },
      { path: '/api/platforms', table: 'app_platforms' },
      { path: '/api/features', table: 'extra_features' },
      { path: '/api/budgets', table: 'budgets' }
    ];
    staticEndpoints.forEach(({ path, table }) => {
      app.get(path, async (req, res) => {
        try {
          let sql;
          if (table === 'budgets') {
            sql = 'SELECT id, label, value, min_price, max_price FROM budgets ORDER BY id';
          } else {
            sql = `SELECT * FROM ${table} ORDER BY id`;
          }
          const [rows] = await db.query(sql);
          res.json(rows);
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: `فشل في جلب البيانات من ${table}` });
        }
      });
    });




app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email=?', [email]);
    if (!rows.length) return res.status(401).json({ error: 'البريد غير موجود' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });

    res.json({
      message: 'تم تسجيل الدخول بنجاح!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'فشل في الدخول' });
  }
});







    ///////////////////////////////////////;كلمة مرور ااااامنه 


    app.post('/api/create-user', async (req, res) => {
  const { name, first_name, last_name, email, phone, password, avatar, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    // تأكد من عدم تكرار المستخدم
    const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser.length) {
      return res.status(409).json({ error: "User already exists" });
    }

    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 10);

    // إدخال المستخدم الجديد
    await db.query(
      `INSERT INTO users 
      (name, first_name, last_name, email, phone, password, full_name, avatar, role, last_online)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [name, first_name, last_name, email, phone, hashedPassword, `${first_name} ${last_name}`, avatar || '/avatars/default.svg', role || 'user']
    );

    res.status(201).json({ message: "User created successfully ✅" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});



///////////////////////////////////////////////////////////////////////


  ///////روت جلب بيانت اليووزر

    app.get('/api/user/me', verifyToken, async (req, res) => {
  const userId = req.user.id; // نستخدم التوكن (آمن)

  try {
    const [rows] = await db.query(
      `SELECT id, email, phone, first_name, last_name, country, city FROM users WHERE id = ?`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('❌ خطأ في جلب بيانات المستخدم:', err);
    res.status(500).json({ error: 'خطأ في الخادم الداخلي' });
  }
});


///////روت تحديث بيانت اليووزر

app.patch('/api/user/me', verifyToken, async (req, res) => {
  const userId = req.user.id; // آمن أيضًا

  const { first_name, last_name, phone, city, country } = req.body;

  try {
    const sql = `
      UPDATE users
      SET first_name = ?, last_name = ?, phone = ?, city = ?, country = ?, updated_at = NOW()
      WHERE id = ?
    `;
    const values = [first_name, last_name, phone, city, country, userId];

    const [result] = await db.query(sql, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    res.json({ message: '✅ تم تحديث البيانات بنجاح!' });

  } catch (err) {
    console.error('❌ خطأ أثناء تحديث المستخدم:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء التحديث' });
  }
});




    // جلب الطلبات مع اسم الميزانية وبياناتها
  // routes/orders.js أو في ملف السيرفر الرئيسي

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


app.get('/api/my-orders', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { status, start_date, end_date, section } = req.query;

  let sql = `
    SELECT
      o.id,
      o.type,
      o.section,
      CASE 
        WHEN o.section = 'تطوير الأنظمة' THEN 'تطوير الأنظمة'
        WHEN o.section = 'برمجة مواقع' THEN 'برمجة مواقع'
        WHEN o.section = 'تطبيقات الجوال' THEN 'تطبيقات الجوال'
        WHEN o.section LIKE '%SEO%' THEN 'SEO & تسويق رقمي'
        ELSE o.section
      END AS section_ar,
      COALESCE(wt.name, syt.name, at.name, o.type) AS type_ar,
      o.platform,
      o.notes,
      o.status,
      o.created_at,
      o.description,
      b.label AS budget_label,
      b.min_price,
      b.max_price
    FROM orders o
    LEFT JOIN web_types wt ON o.site_type_id = wt.id
    LEFT JOIN system_types syt ON o.system_type_id = syt.id
    LEFT JOIN budgets b ON o.budget_id = b.id
    LEFT JOIN app_types at ON o.app_type_id = at.id
    WHERE o.user_id = ?
  `;

  const values = [userId];

  if (status) {
    sql += ' AND o.status = ?';
    values.push(status);
  }

  if (section) {
    sql += ' AND o.section = ?';
    values.push(section);
  }

  if (start_date && end_date) {
    sql += ' AND DATE(o.created_at) BETWEEN ? AND ?';
    values.push(start_date, end_date);
  }

  sql += ' ORDER BY o.created_at DESC';

  try {
    const [rows] = await db.query(sql, values);
    const ids = rows.map(r => r.id);

    let featuresMap = {};
    let platformsMap = {};

    if (ids.length) {
      const [webFeatures] = await db.query(
        `SELECT of.order_id, ef.name AS feature
         FROM order_features of
         JOIN extra_features ef ON of.feature_id = ef.id
         WHERE of.order_id IN (?)`, [ids]
      );

      webFeatures.forEach(r => {
        featuresMap[r.order_id] ||= [];
        featuresMap[r.order_id].push(r.feature);
      });

      const [systemFeatures] = await db.query(
        `SELECT osf.order_id, df.name AS feature
         FROM order_system_features osf
         JOIN developer_features df ON osf.feature_id = df.id
         WHERE osf.order_id IN (?)`, [ids]
      );

      systemFeatures.forEach(r => {
        featuresMap[r.order_id] ||= [];
        featuresMap[r.order_id].push(r.feature);
      });

      const [platforms] = await db.query(
        `SELECT op.order_id, ap.name AS platform_name
         FROM order_platforms op
         JOIN app_platforms ap ON op.platform_id = ap.id
         WHERE op.order_id IN (?)`, [ids]
      );

      platforms.forEach(r => {
        platformsMap[r.order_id] ||= [];
        platformsMap[r.order_id].push(r.platform_name);
      });
    }

    const result = rows.map(o => ({
      id: o.id,
      type: o.type,
      section: o.section,
      type_ar: o.type_ar,
      section_ar: o.section_ar,
      platform: o.platform,
      notes: o.notes,
      status: o.status,
      created_at: o.created_at,
      description: o.description,
      budget: o.budget,
      budget_obj: {
        label: o.budget_label || o.budget,
        min: o.min_price,
        max: o.max_price
      },
      features: featuresMap[o.id] || [],
      platforms: platformsMap[o.id] || []
    }));

    res.json({ orders: result });

  } catch (err) {
    console.error('❌ فشل في جلب الطلبات:', err);
    res.status(500).json({ error: 'خطأ في جلب الطلبات' });
  }
});




app.get('/api/my-orders/stats', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { start_date, end_date } = req.query;

  let sql = `
    SELECT
      COUNT(*) AS total,
      SUM(status='pending') AS pending,
      SUM(status='accepted') AS accepted,
      SUM(status='paid') AS paid,
      SUM(status='rejected') AS rejected,
      SUM(status='blocked') AS blocked,
      SUM(status='refunded') AS refunded
    FROM orders WHERE user_id=?
  `;

  const values = [userId];

  if (start_date && end_date) {
    sql += ' AND DATE(created_at) BETWEEN ? AND ?';
    values.push(start_date, end_date);
  }

  try {
    const [stats] = await db.query(sql, values);
    res.json(stats[0]);
  } catch (err) {
    console.error('❌ فشل في جلب إحصائيات طلبات المستخدم:', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // Auth
app.post('/api/register', async (req, res) => {
  let { name, email, phone, password, first_name, last_name, city, country } = req.body;

  // توليد الاسم الكامل في حال ما وصلك name
  name = name || `${first_name || ""} ${last_name || ""}`.trim();

  if (!name || !email || !phone || !password) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة.' });
  }

  try {
    const [exist] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (exist.length) return res.status(409).json({ error: 'البريد مستخدم مسبقًا' });

    const hash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO users (name, email, password, phone, first_name, last_name, city, country)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, hash, phone, first_name || "", last_name || "", city || "", country || ""]
    );

    const insertedId = result.insertId;

    // ✅ رجّع بيانات المستخدم الجديدة
    res.status(201).json({
  message: '✅ تم إنشاء الحساب بنجاح!',
  user: {
    id: insertedId,
    name,
    email,
    phone,
    first_name,
    last_name,
    city,
    country
  }
});


  } catch (err) {
    console.error('Register Error:', err);
    res.status(500).json({ error: 'خطأ في التسجيل' });
  }
});

///////////////////////تسجيل الدخول ///////////////////////تسجيل الدخول 
// ✅ مكتمل ويعطي توكن JWT صحيح 100%
// في الـ backend عند /api/login





///////////////////////تسجيل الدخول ///////////////////////تسجيل الدخول 



// جلب جميع الطلبات للإدارة (مع اسم العميل، المنتجات، السعر، الحالة، إلخ)






////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// جميع الطلبات (إداري)
// جميع الطلبات (إداري)
app.get('/api/admin/orders', async (req, res) => {
  try {
    const { section, platform } = req.query;

  let sql = `
  SELECT 
    o.id,
    o.created_at,
    o.site_type_id,
    st.name AS site_type_name, -- هذا هو اسم نوع الموقع الصحيح
    o.seo_goal_id,
    o.details,
    o.app_type_id,
    o.app_name, 
    o.idea,
CASE
  WHEN LOWER(o.section) = 'seo & تسويق رقمي' THEN o.seo_status
  WHEN LOWER(o.section) = 'تطبيقات الجوال' AND o.platform = 'iOS' THEN o.ios_status
  WHEN LOWER(o.section) = 'تطبيقات الجوال' AND o.platform = 'Android' THEN o.android_status
  WHEN LOWER(o.section) = 'برمجة مواقع' THEN o.web_status
  WHEN LOWER(o.section) = 'web' THEN o.web_status
  WHEN LOWER(o.section) = 'تطوير الأنظمة' THEN o.system_status
  WHEN LOWER(o.section) = 'خدمات المطورين' THEN o.developer_status
  ELSE o.status
END AS status,
    u.full_name AS customer,
    u.avatar,
    o.platform AS product,
    o.budget,
    o.budget_id,
    o.title,
    o.description,
    o.audience,
    o.notes,
    o.type,
    o.section,
    b.label AS budget_label,
    b.min_price AS min_price,
    b.max_price AS max_price,
    CASE
      WHEN o.budget = '3000-7000' THEN 5000
      WHEN o.budget = '7000-15000' THEN 11000
      WHEN o.budget = '15000-30000' THEN 22500
      WHEN o.budget = '30000+' THEN 30000
      WHEN o.type IN ('iOS App', 'Android App') AND mp.price IS NOT NULL THEN mp.price
      WHEN o.type = 'SEO Rocket' AND b.min_price IS NOT NULL THEN b.min_price
      ELSE 0
    END AS revenue
  FROM orders o
  LEFT JOIN users u ON o.user_id = u.id
  LEFT JOIN site_types st ON o.site_type_id = st.id
  LEFT JOIN seo_goals sg ON o.seo_goal_id = sg.id
  LEFT JOIN mobile_plans mp ON o.app_type_id = mp.id
  LEFT JOIN budgets b ON o.budget_id = b.id
  WHERE 1=1
`;

    const values = [];

if (section) {
  let sectionValue = section;
  // دعم القيم المختصرة أو الإنجليزية
  if (section === 'seo') sectionValue = 'SEO & تسويق رقمي';
  else if (section === 'mobile') sectionValue = 'تطبيقات الجوال';
  else if (section === 'web')    sectionValue = 'Web';     
  else if (section === 'system') sectionValue = 'تطوير الأنظمة';
  else if (section === 'developer') sectionValue = 'خدمات المطورين';
  sql += ` AND o.section = ? `;
  values.push(sectionValue);
}

    if (platform) {
      sql += ` AND o.platform = ?`;
      values.push(platform === 'ios' ? 'iOS' : 'Android');
    }

    sql += ` ORDER BY o.id DESC LIMIT 200`;

    const [orders] = await db.query(sql, values);

    const orderIds = orders.map(o => o.id);
let featuresMap = {};

if (orderIds.length) {

  // جلب الميزات العامة (الأقسام الحالية ويب، SEO، موبايل، ...)
  const [orderFeatures] = await db.query(`
    SELECT of.order_id, ef.name AS feature
    FROM order_features of
    JOIN extra_features ef ON of.feature_id = ef.id
    WHERE of.order_id IN (?)
  `, [orderIds]);

 orderFeatures.forEach(f => {
  if (!featuresMap[f.order_id]) featuresMap[f.order_id] = [];
  featuresMap[f.order_id].push(f.feature); // هذا يرجع فقط الاسم كنص
});

  // جلب ميزات تطوير الأنظمة (إضافة جديدة فقط)
const [orderSystemFeatures] = await db.query(`
  SELECT osf.order_id, df.id, df.name
  FROM order_system_features osf
  JOIN developer_features df ON osf.feature_id = df.id
  WHERE osf.order_id IN (?)
`, [orderIds]);

orderSystemFeatures.forEach(f => {
  if (!featuresMap[f.order_id]) featuresMap[f.order_id] = [];
  featuresMap[f.order_id].push({ id: f.id, name: f.name });
});

}

const finalOrders = orders.map(order => ({
  ...order,
  features: featuresMap[order.id] || [],
  budget_obj: {
    label: order.budget_label || order.budget,
    min: order.min_price,
    max: order.max_price
  }
}));

res.json(finalOrders);
} catch (err) {
  console.error(err);
  res.status(500).json({ error: 'Failed to fetch admin orders' });
}
});




// Revenue chart data
app.get('/api/admin/orders/revenue-chart', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DATE(created_at) AS date,
        SUM(
          CASE
            WHEN section = 'SEO & تسويق رقمي' THEN (
              SELECT min_price FROM budgets WHERE id = budget_id LIMIT 1
            )
            WHEN section = 'تطبيقات الجوال' THEN (
              SELECT price FROM mobile_plans WHERE id = app_type_id LIMIT 1
            )
            WHEN section IN ('برمجة مواقع', 'تطوير الأنظمة', 'خدمات المطورين') THEN (
              CASE
                WHEN budget = '3000-7000' THEN 5000
                WHEN budget = '7000-15000' THEN 11000
                WHEN budget = '15000-30000' THEN 22500
                WHEN budget = '30000+' THEN 30000
                ELSE 0
              END
            )
            ELSE 0
          END
        ) AS revenue
      FROM orders
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error('❌ خطأ:', err);
    res.status(500).json({ error: 'Failed to fetch revenue data' });
  }
});








// تعديل طلب (حالة أو بيانات أخرى)
app.patch('/api/admin/order/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const fields = req.body;
  if (!id || !fields || !Object.keys(fields).length)
    return res.status(400).json({ error: 'Invalid data' });

  const allowed = ['status', 'notes', 'description']; // فقط الحقول القابلة للتحديث بشكل آمن
  const keys = Object.keys(fields).filter(f => allowed.includes(f));
  if (!keys.length) return res.status(400).json({ error: 'No updatable fields' });

  const set = keys.map(f => `${f} = ?`).join(', ');
  const values = keys.map(f => fields[f]);
  values.push(id);

  try {
    await db.query(`UPDATE orders SET ${set}, updated_at = NOW() WHERE id = ?`, values);
    res.json({ message: 'Order updated!' });
  } catch (err) {
    console.error('❌ فشل في تعديل الطلب:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// حذف طلب
app.delete('/api/admin/order/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid order id' });
  try {
    await db.query('DELETE FROM orders WHERE id = ?', [id]);
    res.json({ message: 'Order deleted' });
  } catch (err) {
    console.error('❌ فشل في حذف الطلب:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////











// PATCH بيانات أساسية أو avatar
app.patch('/api/admin/:id', async (req, res) => {
  const { first_name, last_name, email, avatar } = req.body;
  const id = parseInt(req.params.id,10);
  await db.query(
    `UPDATE users
     SET first_name=?, last_name=?, email=?, avatar=?, full_name=CONCAT(?, ' ', ?)
     WHERE id=?`,
    [first_name, last_name, email, avatar, first_name, last_name, id]
  );
  res.json({ message: 'Profile updated' });
});




// PATCH كلمة المرور
app.patch('/api/admin/:id/password', async (req, res) => {
  const { new_password } = req.body;
  const id = parseInt(req.params.id,10);
  const hash = await bcrypt.hash(new_password, 10);
  await db.query(
    'UPDATE users SET password=?, updated_at=NOW() WHERE id=?',
    [hash, id]
  );
  res.json({ message: 'Password changed' });
});



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////







// جلب جميع المستخدمين للإدارة
app.get('/api/admin/users', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, full_name, email, role, avatar, created_at
      FROM users
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error:'Server error' });
  }
});

// حذف مستخدم
app.delete('/api/admin/user/:id', async (req, res) => {
  const id = parseInt(req.params.id,10);
  if (!id) return res.status(400).json({ error:'Invalid user id' });
  try {
    await db.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message:'✅ تم الحذف' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error:'Server error' });
  }
});

// (التعديل موجود) PATCH /api/user/:id  — راجعته واشتغل تمام :contentReference[oaicite:0]{index=0}:contentReference[oaicite:1]{index=1}






// جلب جميع الطلبات للإدارة (مع اسم العميل، المنتجات، السعر، الحالة، إلخ)

// Order endpoints (Android, iOS, SEO, generic)


   


    


    // طلبات الويب العامة
    app.post('/api/orders', async (req, res) => {
        console.log("🚀 بيانات الطلب المستلمة:", req.body); // هنا يظهر كل الداتا القادمة من الفرونت

      try {
        const { user_id, site_type_id, description, features, platforms, budget_id } = req.body;
        if (!site_type_id || !description)
          return res.status(400).json({ error: 'site_type_id و description مطلوبة' });

        // fetch section name
        const [[st]] = await db.query('SELECT name FROM site_types WHERE id=? LIMIT 1', [site_type_id]);
        const section = 'Web'; // st?.name || 'Web'; // هنا تم تعديل اسم القسم ليكون ثابتًا على Web

        const orderId = await createOrder({
          user_id: user_id || null, site_type_id, type: section, section,
          platform: 'Web', description, notes: description,
          status: 'قيد المعالجة', budget_id: budget_id || null
        });

        if (Array.isArray(features) && features.length) {
          const vals = features.map(f => [orderId, f]);
          await db.query('INSERT INTO order_features (order_id, feature_id) VALUES ?', [vals]);
        }
        if (Array.isArray(platforms) && platforms.length) {
          const [[...pRows]] = await db.query(
            'SELECT id FROM app_platforms WHERE name IN (?)', [platforms]
          );
          const pv = pRows.map(r => [orderId, r.id]);
          if (pv.length) await db.query('INSERT INTO order_platforms (order_id, platform_id) VALUES ?', [pv]);
        }

        const [[newOrder]] = await db.query('SELECT * FROM orders WHERE id=?', [orderId]);
        res.status(201).json({ message: '✅ تم إنشاء الطلب بنجاح!', order: newOrder });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل في إنشاء الطلب' });
      }
    });

  // ...existing imports...
app.post('/api/orders/system', async (req, res) => {
  try {
    const {
      user_id,
      site_type_id,
      description,
      audience,
      budget_id,
      features,
      idea,
      details,
      system_type_id
    } = req.body;

    if (!system_type_id || !description) {
      return res.status(400).json({ error: 'system_type_id و description مطلوبة' });
    }

    // جلب اسم الخدمة
    const [[service]] = await db.query('SELECT id, name FROM system_types WHERE id=? LIMIT 1', [system_type_id]);
    const serviceName = service?.name || 'تطوير الأنظمة';

    // جلب تفاصيل الميزانية (اختياري)
    let budgetInfo = null;
    if (budget_id) {
      const [[budget]] = await db.query('SELECT id, label, min_price, max_price FROM budgets WHERE id=? LIMIT 1', [budget_id]);
      budgetInfo = budget || null;
    }

    // إنشاء الطلب
    const orderId = await createOrder({
      user_id: user_id || null,
      system_type_id,
      type: serviceName,
      section: "تطوير الأنظمة",
      platform: 'خدمة التطوير',
      description,
      idea: idea || null,
      details: details || null,
      notes: audience || null,
      status: 'قيد المعالجة',
      budget_id: budget_id || null
    });

    // ربط الميزات المختارة
    if (Array.isArray(features) && features.length) {
      const featureValues = features.map(f => [orderId, f]);
      await db.query('INSERT INTO order_system_features (order_id, feature_id) VALUES ?', [featureValues]);
    }

    // جلب تفاصيل الطلب مع كل العلاقات
    const [[order]] = await db.query(`
      SELECT o.*, s.name AS service_name, b.label AS budget_label, b.min_price, b.max_price
      FROM orders o
      LEFT JOIN system_types s ON o.system_type_id = s.id
      LEFT JOIN budgets b ON o.budget_id = b.id
      WHERE o.id = ?
    `, [orderId]);

    // جلب الميزات المرتبطة بالطلب
const [orderFeatures] = await db.query(`
  SELECT osf.order_id, df.id, df.name
  FROM order_system_features osf
  JOIN developer_features df ON osf.feature_id = df.id
  WHERE osf.order_id = ?
`, [orderId]);

    res.status(201).json({
      message: '✅ تم إنشاء طلب تطوير النظام بنجاح!',
      order: {
        ...order,
        features: orderFeatures,
        budget: budgetInfo,
        service: service
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'فشل في إنشاء طلب النظام' });
  }
});







   



// ==== إحصائيات الطلبات للمستخدم ====
// أضف هذا القسم بعد تعريف db وقبل app.listen(...)




//////////////////////////////////////////////////////////////////////////

app.get('/api/users-stats', async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT 
        COUNT(*) AS total_users,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS new_registrations,
        SUM(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS active_users,
        SUM(CASE WHEN updated_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS inactive_users
      FROM users
    `);
    res.json(results[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});



app.get('/api/orders-stats-daily', async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT 
        DATE(created_at) AS order_date,
        COUNT(*) AS total_orders,
        SUM(CASE WHEN status = 'قيد المعالجة' THEN 1 ELSE 0 END) AS processing,
        SUM(CASE WHEN status = 'مقبولة' THEN 1 ELSE 0 END) AS accepted,
        SUM(CASE WHEN status = 'مدفوعة' THEN 1 ELSE 0 END) AS paid,
        SUM(CASE WHEN status = 'مرفوضة' THEN 1 ELSE 0 END) AS rejected
      FROM orders
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY order_date ASC
    `);
    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});



app.get('/api/admin/order-stats', async (req, res) => {
  try {
    const [stats] = await db.query(`
      SELECT COUNT(*) AS total,
        SUM(status='pending') AS pending,
        SUM(status='accepted') AS accepted,
        SUM(status='paid') AS paid,
        SUM(status='rejected') AS rejected,
        SUM(status='blocked') AS blocked,
        SUM(status='refunded') AS refunded
      FROM orders
    `);
    res.json(stats[0]);
  } catch (err) {
    console.error('❌ admin order-stats error:', err);
    res.status(500).json({ error: 'internal' });
  }
});




// جميع الأعضاء مع الحالة
app.get("/api/admin/team", async (_, res) => {
  const [rows] = await db.query(`
    SELECT id, full_name, avatar, email, last_online,
           CASE WHEN last_online >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                THEN 'online' ELSE 'offline' END AS status
    FROM users
  `);
  res.json(rows);
});




// 2) آخر 8 فواتير
// routes/admin.js
app.get("/api/admin/invoices", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "10", 10);
    const [rows] = await db.query(
      `SELECT id, customer_name, total, paid
       FROM invoices ORDER BY id DESC LIMIT ?`, [limit]
    );

    // تحويل total إلى رقم بشكل صريح
    const formattedRows = rows.map(row => ({
      ...row,
      total: parseFloat(row.total)
    }));

    res.json(formattedRows);
  } catch (err) {
    console.error("Invoices error:", err);
    res.status(500).json({ error: "Server error" });
  }
});





// 3) إحصاء Paid / Unpaid آخر 30 يوم
app.get("/api/admin/invoices-stats", async (req, res) => {
  try {
    const [[row]] = await db.query(`
      SELECT
        SUM(CASE WHEN paid=1 THEN 1 ELSE 0 END) AS paid,
        SUM(CASE WHEN paid=0 THEN 1 ELSE 0 END) AS unpaid
      FROM invoices
    `);
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error:"Server error" });
  }
});



//////////////////////////////////////////////////////////////





app.get('/api/admin/:id', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id,10);

  // التأكد أن المستخدم يطلب بياناته هو فقط (حماية إضافية)
  if (req.user.id !== id) return res.status(403).json({ error: 'Forbidden - You can only access your own data' });

  const [rows] = await db.query(
    `SELECT id, first_name, last_name,
            CONCAT(first_name,' ',last_name) AS full_name,
            email, role, avatar, created_at
     FROM users
     WHERE id = ? AND role='admin'`, [id]
  );
  if (!rows.length) return res.status(404).json({ error:'Not found' });
  res.json(rows[0]);
});



///////////////////////////////////////////////////////////////////////////





    // Start listening
   app.listen(PORT, () =>
      console.log(`🚀 Server listening on port ${PORT}`)
    );

  } catch (err) {
    console.error('❌ فشل في تهيئة DB أو تشغيل السيرفر', err);
    process.exit(1);
  }
}

// نداء لتشغيل الدالة
initDatabaseAndServer();
