import express from 'express';
import cors from 'cors';
import axios from 'axios';
import 'dotenv/config';
import { differenceInMinutes } from 'date-fns';

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabaseHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
};

async function fetchAttendanceToday() {
    const { data } = await axios.get(`${SUPABASE_URL}/rest/v1/attendance?select=*,users(name)`, {
        headers: supabaseHeaders
    });
    return data;
}

async function fetchAttendanceByDateRange(start_date, end_date) {
    const query = new URLSearchParams();
    if (start_date) query.append('created_at', `gte.${start_date}`);
    if (end_date) query.append('created_at', `lte.${end_date}`);

    const { data } = await axios.get(
        `${SUPABASE_URL}/rest/v1/attendance?select=*,users(name)&${query.toString()}`,
        { headers: supabaseHeaders }
    );

    return data;
}

function calculateTimeSpent(checkIn, checkOut) {
    return differenceInMinutes(new Date(checkOut), new Date(checkIn));
}

app.get('/analytics/current', async (req, res) => {
    try {
        const attendance = await fetchAttendanceToday();
        const todayDate = new Date().toISOString().split('T')[0];
        const todayAttendance = attendance.filter(entry =>
            new Date(entry.created_at).toISOString().startsWith(todayDate)
        );

        const userStatus = {};
        const peoplePresent = [];

        todayAttendance.forEach((entry) => {
            const userId = entry.rfid_uid;
            const status = entry.Check;

            if (status === 'IN') {
                userStatus[userId] = { status: 'IN', time_in: entry.created_at, name: entry.users?.name };
            }
            if (status === 'OUT' && userStatus[userId]?.status === 'IN') {
                userStatus[userId].status = 'OUT';
            }
        });

        for (const userId in userStatus) {
            if (userStatus[userId].status === 'IN') {
                peoplePresent.push({
                    name: userStatus[userId].name,
                    rfid_uid: userId,
                    time_in: userStatus[userId].time_in
                });
            }
        }

        res.json({
            count: peoplePresent.length,
            users: peoplePresent
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/analytics/weekly', async (req, res) => {
    try {
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - 7);
        const endOfWeek = new Date();

        const { data } = await axios.get(
            `${SUPABASE_URL}/rest/v1/attendance?select=created_at,rfid_uid&created_at=gte.${startOfWeek.toISOString()}&created_at=lte.${endOfWeek.toISOString()}`,
            { headers: supabaseHeaders }
        );

        const occupancy = {};
        data.forEach(entry => {
            const date = new Date(entry.created_at).toISOString().split('T')[0];
            if (!occupancy[date]) occupancy[date] = new Set();
            occupancy[date].add(entry.rfid_uid);
        });

        const weeklyData = Object.keys(occupancy).map(date => ({
            date,
            occupancy_count: occupancy[date].size
        }));

        res.json(weeklyData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/analytics/rush-hours', async (req, res) => {
    try {
        const attendance = await fetchAttendanceToday();
        const hourlyCheckIns = {};

        attendance.forEach(entry => {
            const hour = new Date(entry.created_at).getHours();
            hourlyCheckIns[hour] = (hourlyCheckIns[hour] || 0) + 1;
        });

        const sortedHours = Object.keys(hourlyCheckIns).map(hour => ({
            hour: `${hour}:00`,
            check_ins: hourlyCheckIns[hour]
        })).sort((a, b) => b.check_ins - a.check_ins);

        res.json(sortedHours);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/attendance", async (req, res) => {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
        return res.status(400).json({ message: "Start date and end date are required" });
    }

    try {
        const attendance = await fetchAttendanceByDateRange(start_date, end_date);
        if (!attendance || attendance.length === 0) {
            return res.status(404).json({ message: "No data found" });
        }
        res.status(200).json(attendance);
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
});


app.post('/force-checkout', async (req, res) => {
    try {
        const response = await axios.get(`${process.env.BASE_URL}/analytics/current`); 
        const currentUsers = response.data.users;

        const now = new Date().toISOString();

        const updates = await Promise.all(currentUsers.map(user => {
            return axios.post(`${SUPABASE_URL}/rest/v1/attendance`, {
                rfid_uid: user.rfid_uid,
                Check: "OUT",
                created_at: now
            }, {
                headers: supabaseHeaders
            });
        }));

        res.status(200).json({ message: `${currentUsers.length} users force-checked out.` });
    } catch (error) {
        console.error('Force checkout failed:', error.message);
        res.status(500).json({ error: 'Force checkout failed' });
    }
});





app.get('/', async (req, res) => {
    const responseText = `
  ------------------------------------------------------------
  🎓 \x1b[36mIntelligent Systems Design Lab - Attendance API\x1b[0m ✅
  ------------------------------------------------------------
  
  📍 \x1b[33mLab:\x1b[0m       Intelligent Systems Design Lab, SRMIST 🧠
  🌐 \x1b[33mWebsite:\x1b[0m   https://isdlab-webpage.vercel.app/
  📊 \x1b[33mApp:\x1b[0m       https://isdlab-attendance.vercel.app/
  📦 \x1b[33mRepo:\x1b[0m      https://github.com/Intelligent-Systems-Design-Lab-SRM
  
  ------------------------------------------------------------
  🧑‍💻 \x1b[36mDeveloper:\x1b[0m Harshil Malhotra 💡
  ------------------------------------------------------------
  
  🔗 \x1b[35mGitHub:\x1b[0m     https://github.com/Harshilmalhotra
  🔗 \x1b[35mLinkedIn:\x1b[0m   https://www.linkedin.com/in/harshilmalhotra/
  🔗 \x1b[35mPortfolio:\x1b[0m  https://harshil-malhotra.vercel.app/
  🔗 \x1b[35mTwitter:\x1b[0m    https://x.com/Harshil_on_X
  
  ------------------------------------------------------------
  ✅ \x1b[32mSystem Status\x1b[0m
  ------------------------------------------------------------
  
  📡 \x1b[36mAPI:\x1b[0m             /analytics/current ............ ✅
  📈 \x1b[36mSupabase:\x1b[0m       Database Connectivity .......... ✅
  🖥️  \x1b[36mFrontend:\x1b[0m       ISD App Responsive UI .......... ✅
  ⏱️  \x1b[36mScheduled Tasks:\x1b[0m 6:00 PM Checkout Enabled ...... ✅
  
  ------------------------------------------------------------
  📘 \x1b[34mEndpoints Available:\x1b[0m
  ------------------------------------------------------------
  
  ➡️  /analytics/current        → Current lab occupants
  ➡️  /analytics/weekly         → Weekly occupancy trends
  ➡️  /analytics/rush-hours     → Most active lab hours
  ➡️  /api/attendance?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
  
  ------------------------------------------------------------
  
  🚀 Built and Maintained with ❤️ by Harshil Malhotra
  🔧 Powered by Node.js, Express, Supabase, and Vercel
  
  ------------------------------------------------------------
  `;
  
    res.setHeader('Content-Type', 'text/plain');
    res.send(responseText);
  });
  
  app.get('/cron/auto-checkout', async (req, res) => {
    try {
      // Step 1: Get current occupants
      const response = await axios.get(`${process.env.API_BASE_URL || 'http://localhost:3000'}/analytics/current`);
      const users = response.data.users;
  
      // Step 2: Check each user out
      const results = await Promise.all(users.map(async (user) => {
        const payload = {
          rfid_uid: user.rfid_uid,
          Check: "OUT"
        };
  
        const { data } = await axios.post(
          `${SUPABASE_URL}/rest/v1/attendance`,
          payload,
          {
            headers: supabaseHeaders
          }
        );
  
        return { name: user.name, status: 'Checked Out ✅' };
      }));
  
      res.status(200).json({
        message: `✅ Auto-checkout complete for ${results.length} user(s)`,
        results
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        message: "❌ Auto-checkout failed"
      });
    }
  });
  

export default app;
