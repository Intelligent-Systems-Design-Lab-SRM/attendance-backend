import axios from 'axios';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  const supabaseHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const { data } = await axios.get(`https://attendance-backend-pied.vercel.app/analytics/current`);
    const users = data.users;
    if (!users.length) return res.send(`<pre>✅ No users present at ${now}</pre>`);

    let logs = [];

    for (const user of users) {
      try {
        await axios.post(`${SUPABASE_URL}/rest/v1/attendance`, {
          rfid_uid: user.rfid_uid,
          Check: "OUT"
        }, { headers: supabaseHeaders });

        logs.push(`✅ ${user.name} (${user.rfid_uid}) checked out`);
      } catch (err) {
        logs.push(`❌ ${user.name} (${user.rfid_uid}): ${err.message}`);
      }
    }

    return res.send(`<pre>${logs.join('\n')}</pre>`);
  } catch (error) {
    console.error("Auto-checkout failed:", error);
    return res.status(500).send(`<pre>❌ Auto-checkout failed: ${error.message}</pre>`);
  }
}
