import express from 'express';
import cors from 'cors';
import axios from 'axios';
import 'dotenv/config'; // For environment variables
import { differenceInMinutes } from 'date-fns'; // For calculating time spent in the lab

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

// Helper function to fetch attendance data
async function fetchAttendanceToday() {
    const { data } = await axios.get(`${SUPABASE_URL}/rest/v1/attendance?select=*,users(name)`, {
        headers: supabaseHeaders
    });
    return data;
}

// Helper function to fetch attendance data with date range
async function fetchAttendanceByDateRange(start_date, end_date) {
    try {
        // Build the query string for filtering by date range
        const query = new URLSearchParams();
        if (start_date) {
            query.append('created_at', `gte.${start_date}`);
        }
        if (end_date) {
            query.append('created_at', `lte.${end_date}`);
        }

        const { data } = await axios.get(`${SUPABASE_URL}/rest/v1/attendance?select=*,users(name)&${query.toString()}`, {
            headers: supabaseHeaders
        });

        return data;
    } catch (error) {
        console.error("Error fetching attendance data:", error);
        throw error;
    }
}

// Helper function to calculate time spent in lab
function calculateTimeSpent(checkIn, checkOut) {
    return differenceInMinutes(new Date(checkOut), new Date(checkIn));
}

// Endpoint to get current people in the lab
app.get('/analytics/current', async (req, res) => {
    try {
        const attendance = await fetchAttendanceToday();
        const todayAttendance = attendance.filter(entry => 
            new Date(entry.created_at).toISOString().startsWith(new Date().toISOString().split('T')[0])
        );

        const userStatus = {}; // Track user check-in/check-out status
        const peoplePresent = [];

        // Iterate through today's attendance records
        todayAttendance.forEach((entry) => {
            const userId = entry.rfid_uid;
            const status = entry.Check;  // IN or OUT

            // If it's a check-in, set status as 'IN'
            if (status === 'IN') {
                userStatus[userId] = { status: 'IN', time_in: entry.created_at, name: entry.users?.name };
            }

            // If it's a check-out and the user has checked in before, update status to 'OUT'
            if (status === 'OUT' && userStatus[userId] && userStatus[userId].status === 'IN') {
                userStatus[userId].status = 'OUT';
            }
        });

        // Collect users who are still 'IN' (not checked out)
        for (const userId in userStatus) {
            if (userStatus[userId].status === 'IN') {
                peoplePresent.push({
                    name: userStatus[userId].name,
                    rfid_uid: userId,
                    time_in: userStatus[userId].time_in
                });
            }
        }

        // Return the count and list of people currently present
        res.json({
            count: peoplePresent.length,
            users: peoplePresent
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoint to get weekly lab occupancy data
app.get('/analytics/weekly', async (req, res) => {
    try {
        // Fetch attendance for the past week
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - 7);
        const endOfWeek = new Date();

        const { data } = await axios.get(`${SUPABASE_URL}/rest/v1/attendance?select=created_at,rfid_uid&created_at=gte.${startOfWeek.toISOString()}&created_at=lte.${endOfWeek.toISOString()}`, {
            headers: supabaseHeaders
        });

        // Group by date and count distinct users for each day
        const occupancy = {};
        data.forEach(entry => {
            const date = new Date(entry.created_at).toISOString().split('T')[0];
            if (!occupancy[date]) {
                occupancy[date] = new Set();
            }
            occupancy[date].add(entry.rfid_uid);
        });

        // Aggregate data for weekly occupancy
        const weeklyData = Object.keys(occupancy).map(date => ({
            date,
            occupancy_count: occupancy[date].size
        }));

        res.json(weeklyData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoint to get busy hours in the lab
app.get('/analytics/rush-hours', async (req, res) => {
    try {
        // Fetch attendance for today
        const attendance = await fetchAttendanceToday();
        const hourlyCheckIns = {};

        // Track check-ins per hour
        attendance.forEach(entry => {
            const hour = new Date(entry.created_at).getHours();
            if (!hourlyCheckIns[hour]) {
                hourlyCheckIns[hour] = 0;
            }
            hourlyCheckIns[hour]++;
        });

        // Sort by the number of check-ins in descending order
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
        // Fetch attendance data from Supabase using the renamed function
        const attendance = await fetchAttendanceByDateRange(start_date, end_date);
        
        if (!attendance || attendance.length === 0) {
            return res.status(404).json({ message: "No data found" });
        }

        // Return the fetched data as JSON
        res.status(200).json(attendance);
    } catch (error) {
        console.error("Error fetching attendance logs:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
});



app.get('/', (req, res) => {
    res.send('Attendance Analytics API working ✅');
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


