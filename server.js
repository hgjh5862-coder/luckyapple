const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'Apple_of_Fortune_No_Ads.html'));
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
};
const newId = () => 'AF-' + crypto.randomBytes(4).toString('hex').toUpperCase();
const newCode = () => 'APPLE-' + Math.floor(100000 + Math.random() * 900000);

async function getUser(id) {
  const r = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return r.rows[0];
}

async function resetDaily(user) {
  if (user.daily_date !== today()) {
    await pool.query(
      'UPDATE users SET daily_date=$1, daily_gift=0, wheel_free=0, wheel_ad=0, ads_count=0 WHERE id=$2',
      [today(), user.id]
    );
    return getUser(user.id);
  }
  return user;
}

async function auth(req, res, next) {
  const id = req.headers['x-user-id'];
  if (!id) return res.status(401).json({ error: 'no user' });
  const user = await getUser(id);
  if (!user) return res.status(401).json({ error: 'invalid user' });
  req.user = await resetDaily(user);
  next();
}

app.post('/api/register', async (req, res) => {
  try {
    const refCode = (req.body || {}).refCode;
    const id = newId();
    const code = newCode();
    let referredBy = null;

    if (refCode) {
      const r = await pool.query('SELECT id FROM users WHERE code = $1', [refCode]);
      if (r.rows[0]) referredBy = r.rows[0].id;
    }

    await pool.query(
      'INSERT INTO users (id, code, balance, daily_date, referred_by, created_at) VALUES ($1,$2,1000,$3,$4,$5)',
      [id, code, today(), referredBy, Date.now()]
    );

    if (referredBy) {
      await pool.query('UPDATE users SET balance = balance + 45 WHERE id = $1', [referredBy]);
    }

    res.json({ id: id, code: code, balance: 1000, best: 1 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

app.get('/api/me', auth, (req, res) => {
  res.json({
    id: req.user.id,
    code: req.user.code,
    balance: req.user.balance,
    best: req.user.best,
    daily: {
      giftClaimed: !!req.user.daily_gift,
      wheelFree: req.user.wheel_free,
      wheelAd: req.user.wheel_ad,
      adsCount: req.user.ads_count
    }
  });
});

const ALLOWED = ['round_win', 'round_lose', 'gift', 'wheel', 'ad'];

app.post('/api/balance', auth, async (req, res) => {
  try {
    const body = req.body || {};
    const delta = body.delta;
    const type = body.type;

    if (ALLOWED.indexOf(type) === -1) return res.status(400).json({ error: 'bad type' });
    if (typeof delta !== 'number' || !isFinite(delta)) return res.status(400).json({ error: 'bad delta' });

    const u = req.user;

    if (type === 'ad') {
      if (u.ads_count >= 20) return res.status(400).json({ error: 'ad limit reached' });
      if (delta !== 20) return res.status(400).json({ error: 'bad ad reward' });
      await pool.query('UPDATE users SET ads_count = ads_count + 1 WHERE id = $1', [u.id]);
    }

    if (type === 'gift') {
      if (u.daily_gift) return res.status(400).json({ error: 'gift already claimed' });
      if (delta < 20 || delta > 400) return res.status(400).json({ error: 'bad gift' });
      await pool.query('UPDATE users SET daily_gift = 1 WHERE id = $1', [u.id]);
    }

    if (type === 'wheel') {
      if (u.wheel_free >= 3) return res.status(400).json({ error: 'no free spins' });
      if (delta < 10 || delta > 250) return res.status(400).json({ error: 'bad wheel reward' });
      await pool.query('UPDATE users SET wheel_free = wheel_free + 1 WHERE id = $1', [u.id]);
    }

    if (type === 'round_lose') {
      if (delta > 0) return res.status(400).json({ error: 'lose must be negative' });
      if (Math.abs(delta) > u.balance) return res.status(400).json({ error: 'not enough balance' });
    }

    if (type === 'round_win') {
      if (delta < 0) return res.status(400).json({ error: 'win must be positive' });
      if (delta > 100000) return res.status(400).json({ error: 'reward too big' });
    }

    const nb = Math.max(0, u.balance + delta);
    await pool.query('UPDATE users SET balance = $1 WHERE id = $2', [nb, u.id]);
    res.json({ balance: nb });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

app.post('/api/best', auth, async (req, res) => {
  try {
    const best = (req.body || {}).best;
    if (typeof best !== 'number' || best < 1 || best > 100) {
      return res.status(400).json({ error: 'bad best' });
    }
    if (best > req.user.best) {
      await pool.query('UPDATE users SET best = $1 WHERE id = $2', [best, req.user.id]);
    }
    res.json({ best: Math.max(best, req.user.best) });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

const PACKAGES = { 35: { coins: 35000 }, 100: { coins: 100000 }, 200: { coins: 200000 } };

app.post('/api/withdraw', auth, async (req, res) => {
  try {
    const body = req.body || {};
    const amount = body.amount;
    const method = body.method;
    const wallet = body.wallet;
    const name = body.name;

    const pkg = PACKAGES[amount];
    if (!pkg) return res.status(400).json({ error: 'invalid package' });
    if (!/^01[0-2,5][0-9]{8}$/.test(wallet)) return res.status(400).json({ error: 'bad wallet' });
    if (!name || name.length < 2) return res.status(400).json({ error: 'bad name' });
    if (['Vodafone Cash', 'Orange Cash', 'Etisalat Cash'].indexOf(method) === -1) {
      return res.status(400).json({ error: 'bad method' });
    }
    if (req.user.balance < pkg.coins) return res.status(400).json({ error: 'not enough balance' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [pkg.coins, req.user.id]);
      const r = await client.query(
        'INSERT INTO withdrawals (user_id, amount, coins, method, wallet, name, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [req.user.id, amount, pkg.coins, method, wallet, name, Date.now()]
      );
      await client.query('COMMIT');
      res.json({ ok: true, requestId: r.rows[0].id, balance: req.user.balance - pkg.coins });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

app.get('/api/withdrawals', auth, async (req, res) => {
  const r = await pool.query(
    'SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
    [req.user.id]
  );
  res.json(r.rows);
});

app.get('/api/leaderboard', async (req, res) => {
  const r = await pool.query('SELECT id, best, balance FROM users ORDER BY best DESC LIMIT 10');
  res.json(r.rows.map(function (x) { return { id: x.id.slice(0, 8) + '...', best: x.best, balance: x.balance }; }));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () { console.log('Server running on port ' + PORT); });
