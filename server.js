require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || 'lifecoats-secret-key';

// Auth middleware
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'office') return res.status(403).json({ error: 'Admin only' });
  next();
}

// LOGIN
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .single();
  if (!users || users.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = jwt.sign(
    { id: users.id, username: users.username, role: users.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  res.json({ token, role: users.role, username: users.username });
});

// MATERIALS
app.get('/api/materials', auth, async (req, res) => {
  const { data } = await supabase.from('materials').select('*').order('id');
  res.json(data || []);
});
app.post('/api/materials', auth, adminOnly, async (req, res) => {
  const { data } = await supabase.from('materials').insert(req.body).select().single();
  res.json(data);
});
app.put('/api/materials/:id', auth, adminOnly, async (req, res) => {
  const { data } = await supabase.from('materials').update(req.body).eq('id', req.params.id).select().single();
  res.json(data);
});

app.delete('/api/materials/:id', auth, adminOnly, async (req, res) => {
  await supabase.from('materials').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// CLIENTS
app.get('/api/clients', auth, async (req, res) => {
  const { q } = req.query;
  let query = supabase.from('clients').select('*').order('name');
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data } = await query.limit(20);
  res.json(data || []);
});
app.post('/api/clients', auth, async (req, res) => {
  const { data } = await supabase.from('clients').insert(req.body).select().single();
  res.json(data);
});
app.get('/api/clients/:id/orders', auth, async (req, res) => {
  const { data } = await supabase.from('orders').select('*').eq('client_id', req.params.id).order('created_at', { ascending: false });
  res.json(data || []);
});

// RECEPTION SETTINGS
app.get('/api/reception-settings', auth, async (req, res) => {
  const { data } = await supabase.from('reception_settings').select('*').eq('setting_key','dashboard').single();
  res.json(data || { selected_items: [] });
});
app.put('/api/reception-settings', auth, async (req, res) => {
  const { data } = await supabase.from('reception_settings').upsert({ setting_key:'dashboard', selected_items: req.body.selected_items, updated_at: new Date().toISOString() }, { onConflict: 'setting_key' }).select().single();
  res.json(data);
});

// COMPANY SETTINGS
app.get('/api/company-settings', auth, async (req, res) => {
  const { data } = await supabase.from('company_settings').select('*');
  const settings = {};
  (data || []).forEach(s => { settings[s.setting_key] = s.value; });
  res.json(settings);
});
app.put('/api/company-settings', auth, async (req, res) => {
  const updates = req.body;
  const promises = Object.keys(updates).map(key =>
    supabase.from('company_settings').upsert({ setting_key: key, value: updates[key], updated_at: new Date().toISOString() }, { onConflict: 'setting_key' })
  );
  await Promise.all(promises);
  res.json({ success: true });
});

// TV SETTINGS
app.get('/api/tv-settings', auth, async (req, res) => {
  const { data } = await supabase.from('tv_settings').select('*').eq('setting_key','main').single();
  res.json(data || { selected_items: [] });
});
app.put('/api/tv-settings', auth, async (req, res) => {
  const { data } = await supabase.from('tv_settings').upsert({ setting_key:'main', selected_items: req.body.selected_items, groups: req.body.groups||[], updated_at: new Date().toISOString() }, { onConflict: 'setting_key' }).select().single();
  res.json(data);
});

// MANUFACTURED STOCK
app.get('/api/manufactured-stock', auth, async (req, res) => {
  const { data } = await supabase.from('manufactured_stock').select('*').order('id');
  res.json(data || []);
});
app.post('/api/manufactured-stock', auth, async (req, res) => {
  const { data } = await supabase.from('manufactured_stock').insert(req.body).select().single();
  res.json(data);
});
app.put('/api/manufactured-stock/:id', auth, async (req, res) => {
  const { data } = await supabase.from('manufactured_stock').update(req.body).eq('id', req.params.id).select().single();
  res.json(data);
});

// BATCH RECIPES
app.get('/api/batch-recipes', auth, async (req, res) => {
  const { data } = await supabase.from('batch_recipes').select('*').order('id');
  res.json(data || []);
});
app.post('/api/batch-recipes', auth, async (req, res) => {
  const { data } = await supabase.from('batch_recipes').insert(req.body).select().single();
  res.json(data);
});
app.put('/api/batch-recipes/:id', auth, async (req, res) => {
  const { data } = await supabase.from('batch_recipes').update(req.body).eq('id', req.params.id).select().single();
  res.json(data);
});
app.delete('/api/batch-recipes/:id', auth, async (req, res) => {
  await supabase.from('batch_recipes').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// BATCH LOGS
app.post('/api/batch-logs', auth, async (req, res) => {
  const { data } = await supabase.from('batch_logs').insert(req.body).select().single();
  res.json(data);
});
app.get('/api/batch-logs', auth, async (req, res) => {
  const { data } = await supabase.from('batch_logs').select('*').order('created_at', { ascending: false }).limit(20);
  res.json(data || []);
});
// BASES
app.get('/api/bases', auth, async (req, res) => {
  const { data } = await supabase.from('bases').select('*').order('id');
  res.json(data || []);
});
app.post('/api/bases', auth, adminOnly, async (req, res) => {
  const { data } = await supabase.from('bases').insert(req.body).select().single();
  res.json(data);
});
app.put('/api/bases/:id', auth, adminOnly, async (req, res) => {
  const { data } = await supabase.from('bases').update(req.body).eq('id', req.params.id).select().single();
  res.json(data);
});

// PACKAGING
app.get('/api/packaging', auth, async (req, res) => {
  const { data } = await supabase.from('packaging').select('*');
  res.json(data || []);
});
app.put('/api/packaging/:id', auth, async (req, res) => {
  const { data } = await supabase.from('packaging').update(req.body).eq('id', req.params.id).select().single();
  res.json(data);
});

// FORMULATIONS
app.get('/api/formulations', auth, async (req, res) => {
  const { data } = await supabase.from('formulations').select('*').order('id');
  res.json(data || []);
});
app.post('/api/formulations', auth, adminOnly, async (req, res) => {
  const { data, error } = await supabase.from('formulations').insert(req.body).select().single();
  if(error){ console.error('formulations insert error:', error); return res.status(500).json({ error: error.message }); }
  res.json(data);
});
app.put('/api/formulations/:id', auth, adminOnly, async (req, res) => {
  const { data, error } = await supabase.from('formulations').update(req.body).eq('id', req.params.id).select().single();
  if(error){ console.error('formulations update error:', error); return res.status(500).json({ error: error.message }); }
  res.json(data);
});
app.delete('/api/formulations/:id', auth, adminOnly, async (req, res) => {
  await supabase.from('formulations').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// ORDERS
app.get('/api/orders', auth, async (req, res) => {
  const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  res.json(data || []);
});
app.post('/api/orders', auth, async (req, res) => {
  const { data } = await supabase.from('orders').insert(req.body).select().single();
  res.json(data);
});
app.put('/api/orders/:id', auth, async (req, res) => {
  const { data } = await supabase.from('orders').update(req.body).eq('id', req.params.id).select().single();
  res.json(data);
});

// BASE LOGS
app.post('/api/base-logs', auth, async (req, res) => {
  const { data } = await supabase.from('base_logs').insert(req.body).select().single();
  res.json(data);
});

// JOB BOOKINGS
app.get('/api/job-bookings', auth, adminOnly, async (req, res) => {
  const { data } = await supabase.from('job_bookings').select('*').order('created_at', { ascending: false });
  res.json(data || []);
});
app.post('/api/job-bookings', auth, adminOnly, async (req, res) => {
  const { data } = await supabase.from('job_bookings').insert(req.body).select().single();
  res.json(data);
});

// Job booking items
app.get('/api/job-bookings/:id/items', auth, adminOnly, async (req, res) => {
  const { data } = await supabase.from('job_booking_items').select('*').eq('job_id', req.params.id).order('booked_at', { ascending: true });
  res.json(data || []);
});
app.post('/api/job-bookings/:id/items', auth, adminOnly, async (req, res) => {
  const { data, error } = await supabase.from('job_booking_items').insert({ job_id: req.params.id, ...req.body }).select().single();
  if(error){ console.error('job items error:', error); return res.status(500).json({ error: error.message }); }
  res.json(data);
});
app.patch('/api/job-bookings/:id', auth, adminOnly, async (req, res) => {
  const { data, error } = await supabase.from('job_bookings').update(req.body).eq('id', req.params.id).select().single();
  if(error){ return res.status(500).json({ error: error.message }); }
  res.json(data);
});

// Serve app for all other routes
app.get('*', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Life Coats app running on port ${PORT}`));
