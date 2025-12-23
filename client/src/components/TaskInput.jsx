import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Plus, Link, FileJson, Send } from 'lucide-react';

const TaskInput = () => {
    const [url, setUrl] = useState('');
    const [formData, setFormData] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            // Validate JSON
            let parsedData;
            try {
                parsedData = JSON.parse(formData);
            } catch (err) {
                throw new Error('Invalid JSON format');
            }

            await axios.post('http://localhost:3000/api/queue', {
                url,
                formData: parsedData
            });

            setMessage({ type: 'success', text: 'Task added to queue!' });
            setUrl('');
            setFormData('');
        } catch (error) {
            setMessage({ type: 'error', text: error.message || 'Failed to add task' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-6 h-full flex flex-col"
        >
            <div className="flex items-center gap-2 mb-6 text-primary">
                <Plus className="w-6 h-6" />
                <h2 className="text-xl font-bold text-white">New Automation Task</h2>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-grow gap-4">
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                        <Link className="w-4 h-4" />
                        Google Form URL
                    </label>
                    <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://docs.google.com/forms/..."
                        className="input-field"
                        required
                    />
                </div>

                <div className="space-y-2 flex-grow flex flex-col">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                        <FileJson className="w-4 h-4" />
                        Form Data (JSON)
                    </label>
                    <textarea
                        value={formData}
                        onChange={(e) => setFormData(e.target.value)}
                        placeholder={'{\n  "Name": "John Doe",\n  "Email": "john@example.com"\n}'}
                        className="input-field flex-grow font-mono text-sm resize-none"
                        required
                    />
                </div>

                {message && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`p-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-500/20 text-red-200 border border-red-500/30' : 'bg-green-500/20 text-green-200 border border-green-500/30'}`}
                    >
                        {message.text}
                    </motion.div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full flex items-center justify-center gap-2 group"
                >
                    {loading ? 'Adding...' : (
                        <>
                            Add to Queue
                            <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </button>
            </form>
        </motion.div>
    );
};

export default TaskInput;
