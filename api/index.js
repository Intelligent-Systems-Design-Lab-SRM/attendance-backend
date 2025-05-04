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





app.get('/', (req, res) => {
    res.send('Attendance Analytics API working ✅');
});



app.get('/cron/auto-checkout', async (req, res) => {
    try {
        console.log(`⏰ Auto-checkout triggered at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

        // Fetch users currently inside the lab
        const { data } = await axios.get(`https://attendance-backend-pied.vercel.app/analytics/current`);
        const usersInside = data.users;

        if (!usersInside.length) {
            return res.send(`<pre style="color:green;">✅ No users to check out at 6 PM. Lab is empty.</pre>`);
        }

        let results = [];

        for (const user of usersInside) {
            try {
                const payload = {
                    rfid_uid: user.rfid_uid,
                    Check: "OUT"
                };

                const response = await axios.post(`${SUPABASE_URL}/rest/v1/attendance`, payload, {
                    headers: supabaseHeaders
                });

                results.push(`✅ Checked out: ${user.name} (${user.rfid_uid}) at ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
            } catch (err) {
                results.push(`❌ Failed to check out ${user.name} (${user.rfid_uid}): ${err.message}`);
            }
        }

        const html = `
        <pre style="background:#111;color:#0f0;padding:1em;border-radius:10px;">
🔁 Auto-checkout Results for ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}:

${results.join('\n')}
        </pre>`;

        res.send(html);

    } catch (error) {
        console.error("❌ Auto-checkout failed:", error.message);
        return res.status(500).send(`<pre style="color:red;">❌ Auto-checkout failed: ${error.message}</pre>`);
    }
});


export default app;
