import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, CheckCircle, Clock, XCircle, Loader, Play, Download } from 'lucide-react';

const StatusBadge = ({ status }) => {
    const config = {
        pending: { icon: Clock, color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
        processing: { icon: Loader, color: 'text-blue-400 bg-blue-400/10 border-blue-400/20', animate: true },
        completed: { icon: CheckCircle, color: 'text-green-400 bg-green-400/10 border-green-400/20' },
        failed: { icon: XCircle, color: 'text-red-400 bg-red-400/10 border-red-400/20' },
    };

    const { icon: Icon, color, animate } = config[status] || config.pending;

    return (
        <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${color}`}>
            <Icon className={`w-3 h-3 ${animate ? 'animate-spin' : ''}`} />
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
};

const QueueDashboard = ({ queue }) => {
    return (
        <div className="glass rounded-2xl p-6 h-full flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-primary">
                    <Activity className="w-6 h-6" />
                    <h2 className="text-xl font-bold text-white">Live Queue</h2>
                </div>
                <div className="text-xs text-gray-400 font-mono">
                    {queue.length} Tasks
                </div>
            </div>

            <div className="flex-grow overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                <AnimatePresence mode='popLayout'>
                    {queue.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col items-center justify-center h-48 text-gray-500 italic"
                        >
                            No tasks in queue
                        </motion.div>
                    ) : (
                        queue.slice().reverse().map((task, index) => (
                            <motion.div
                                key={task.id}
                                layout
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.2 }}
                                className="bg-surface/30 rounded-xl p-4 border border-white/5 hover:bg-surface/50 transition-colors"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex-1 min-w-0 mr-4">
                                        <h3 className="text-sm font-semibold text-white truncate" title={task.url}>
                                            {task.url}
                                        </h3>
                                        <p className="text-xs text-gray-400 mt-1 font-mono truncate">
                                            ID: {task.id}
                                        </p>
                                    </div>
                                    <StatusBadge status={task.status} />
                                </div>

                                <div className="mt-3 pt-3 border-t border-white/5">
                                    <div className="text-xs text-gray-500 font-mono">
                                        Data: {JSON.stringify(task.formData).substring(0, 50)}...
                                    </div>
                                    {task.error && (
                                        <div className="mt-2 text-xs text-red-400 bg-red-400/5 p-2 rounded">
                                            Error: {task.error}
                                        </div>
                                    )}
                                    {(task.status === 'completed' || task.status === 'failed' || task.status === 'processing') && (
                                        <button
                                            onClick={() => {
                                                window.open(`http://localhost:3000/api/logs/${task.id}`, '_blank');
                                            }}
                                            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                                        >
                                            <Download className="w-3 h-3" />
                                            Download Logs
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        ))
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default QueueDashboard;
