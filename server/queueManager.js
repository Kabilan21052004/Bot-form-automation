const automationService = require('./automationService');
const fs = require('fs');
const path = require('path');

class QueueManager {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.io = null;
        this.logsDir = path.join(__dirname, 'logs');
        this.ensureLogsDirectory();
    }

    ensureLogsDirectory() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    getLogFilePath(taskId) {
        return path.join(this.logsDir, `task_${taskId}.log`);
    }

    writeLogToFile(taskId, logMessage) {
        try {
            const logFilePath = this.getLogFilePath(taskId);
            const timestamp = new Date().toISOString();
            const logEntry = `[${timestamp}] ${logMessage}\n`;
            fs.appendFileSync(logFilePath, logEntry, 'utf8');
        } catch (error) {
            console.error(`Failed to write log for task ${taskId}:`, error);
        }
    }

    init(io) {
        this.io = io;
    }

    addTask(url, formData) {
        const task = {
            id: Date.now().toString(),
            url,
            formData,
            status: 'pending', // pending, processing, completed, failed
            createdAt: new Date(),
            logs: []
        };
        this.queue.push(task);
        this.emitUpdate();
        this.processQueue();
        return task;
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        // Find next pending task
        const nextTask = this.queue.find(t => t.status === 'pending');
        if (!nextTask) return;

        this.isProcessing = true;
        nextTask.status = 'processing';
        this.emitUpdate();

        try {
            await automationService.runTask(
                nextTask,
                (log) => {
                    nextTask.logs.push(log);
                    this.writeLogToFile(nextTask.id, log);
                    this.emitUpdate();
                },
                // Ask User Callback
                async (question) => {
                    // Update task status to waiting_input AND store the question
                    nextTask.status = 'waiting_input';
                    nextTask.currentQuestion = question; // PERSIST QUESTION
                    this.emitUpdate();

                    // Emit specific event to client if socket.io is initialized
                    if (this.io) {
                        this.io.emit('requestInput', { taskId: nextTask.id, question });
                    } else {
                        console.error(`[QueueManager] No socket.io initialized. Still waiting for input for task ${nextTask.id}...`);
                    }

                    // Return a promise that resolves when user provides input
                    return new Promise((resolve) => {
                        this.pendingInputResolve = resolve;
                    });
                }
            );
            nextTask.status = 'completed';
        } catch (error) {
            console.error(`Task ${nextTask.id} failed:`, error);
            nextTask.status = 'failed';
            nextTask.error = error.message;
        } finally {
            this.isProcessing = false;
            this.pendingInputResolve = null; // Cleanup
            this.emitUpdate();
            // Process next task
            this.processQueue();
        }
    }

    resolvePendingInput(value) {
        if (this.pendingInputResolve) {
            this.pendingInputResolve(value);
            this.pendingInputResolve = null;

            // Set status back to processing (will be updated by automationService flow, but good for UI immediately)
            const currentTask = this.queue.find(t => t.status === 'waiting_input');
            if (currentTask) {
                currentTask.status = 'processing';
                currentTask.currentQuestion = null; // CLEAR QUESTION
                this.emitUpdate();
            }
        }
    }

    getQueueStatus() {
        return this.queue;
    }

    emitUpdate() {
        if (this.io) {
            this.io.emit('queueUpdate', this.queue);
        }
    }
}

module.exports = new QueueManager();
