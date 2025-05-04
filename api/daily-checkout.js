export const config = {
    schedule: '30 12 * * *' // 6:00 PM IST (12:30 UTC)
  };
  
  export default async function handler(req, res) {
    try {
      const response = await fetch(`${process.env.BASE_URL}/force-checkout`, {
        method: 'POST'
      });
  
      const result = await response.json();
      res.status(200).json({ message: 'Scheduled checkout triggered', result });
    } catch (err) {
      res.status(500).json({ error: 'Scheduled function failed', details: err.message });
    }
  }
  