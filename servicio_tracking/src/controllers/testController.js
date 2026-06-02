const supabase = require('../config/supabaseClient');

const testApi = (req, res) => {
  res.json({
    service: 'servicio_tracking',
    status: 'ok'
  });
};

const testDb = async (req, res) => {
  try {
    if (!supabase) return res.json({ database: 'error', message: 'No client' });
    const { data, error } = await supabase.from('test_table').select('*').limit(1);
    // Ignore table missing errors
    if (error && error.code !== '42P01' && error.code !== 'PGRST116') {
      return res.json({ database: 'error', error: error.message });
    }
    res.json({ database: 'connected' });
  } catch (err) {
    res.json({ database: 'error', error: err.message });
  }
};

module.exports = { testApi, testDb };
