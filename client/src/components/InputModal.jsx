import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send } from 'lucide-react';

const InputModal = ({ isOpen, question, onSubmit }) => {
    const [value, setValue] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(value);
        setValue('');
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-lg glass rounded-2xl shadow-2xl p-6 border border-primary/20"
                    >
                        <div className="flex items-center gap-3 mb-4 text-primary">
                            <div className="p-2 bg-primary/20 rounded-lg">
                                <MessageSquare className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white">Input Required</h3>
                        </div>

                        <p className="text-gray-300 mb-6">
                            The automation needs your help. Please provide a value for:
                            <br />
                            <span className="text-white font-semibold text-lg mt-2 block">"{question}"</span>
                        </p>

                        <form onSubmit={handleSubmit} className="flex gap-3">
                            <input
                                autoFocus
                                type="text"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                className="input-field flex-grow"
                                placeholder="Type your answer here..."
                                required
                            />
                            <button
                                type="submit"
                                className="btn-primary"
                            >
                                <Send className="w-4 h-4 mr-2" />
                                Send
                            </button>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default InputModal;
