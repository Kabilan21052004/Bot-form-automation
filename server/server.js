require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http'); // Import http module
const { Server } = require("socket.io"); // Import Server from socket.io

const queueManager = require('./queueManager');

const app = express();
const server = http.createServer(app); // Create HTTP server
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for dev
        methods: ["GET", "POST"]
    }
});

const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

// Initialize Queue Manager with Socket.io instance
queueManager.init(io);

// Add Task to Queue
app.post('/api/queue', (req, res) => {
    const { url, formData } = req.body;
    if (!url || !formData) {
        return res.status(400).json({ error: 'URL and FormData are required' });
    }

    const task = queueManager.addTask(url, formData);
    res.status(201).json(task);
});

// Get Queue Status
app.get('/api/queue', (req, res) => {
    res.json(queueManager.getQueueStatus());
});

// Download Log File for a specific task
app.get('/api/logs/:taskId', (req, res) => {
    const { taskId } = req.params;
    const logFilePath = queueManager.getLogFilePath(taskId);

    if (!require('fs').existsSync(logFilePath)) {
        return res.status(404).json({ error: 'Log file not found' });
    }

    res.download(logFilePath, `task_${taskId}.log`, (err) => {
        if (err) {
            console.error('Error downloading log file:', err);
            res.status(500).json({ error: 'Failed to download log file' });
        }
    });
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A user connected');

    // Send initial queue status
    socket.emit('queueUpdate', queueManager.getQueueStatus());

    // Handle User Input
    socket.on('provideInput', ({ value }) => {
        queueManager.resolvePendingInput(value);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
