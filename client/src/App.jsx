import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { LayoutGrid } from 'lucide-react';
import TaskInput from './components/TaskInput';
import QueueDashboard from './components/QueueDashboard';
import InputModal from './components/InputModal';
import ParticleBackground from './components/ParticleBackground';

const socket = io('http://localhost:3000');

function App() {
  const [queue, setQueue] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [inputRequest, setInputRequest] = useState(null); // { taskId, question }

  useEffect(() => {
    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('queueUpdate', (data) => {
      setQueue(data);
      // Auto-detect input request from queue state
      const waitingTask = data.find(t => t.status === 'waiting_input' && t.currentQuestion);
      if (waitingTask) {
        setInputRequest({ taskId: waitingTask.id, question: waitingTask.currentQuestion });
      } else {
        setInputRequest(null);
      }
    });

    socket.on('requestInput', (data) => {
      // Redundant but safe fallback
      setInputRequest(data);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('queueUpdate');
      socket.off('requestInput');
    };
  }, []);

  const handleInputSubmit = (value) => {
    socket.emit('provideInput', { value });
    setInputRequest(null);
  };

  return (
    <div className="min-h-screen bg-transparent p-6 md:p-12 font-sans selection:bg-primary/30 relative">
      <ParticleBackground />

      <div className="relative z-10 max-w-7xl mx-auto h-[calc(100vh-6rem)] flex flex-col">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-primary to-secondary rounded-lg shadow-lg shadow-primary/20">
              <LayoutGrid className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                Form Automation
              </h1>
              <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">
                Queue Management System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface/50 border border-white/5 backdrop-blur-sm">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
            <span className="text-xs font-medium text-gray-400">
              {isConnected ? 'System Online' : 'Connecting...'}
            </span>
          </div>
        </header>

        <main className="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
          <div className="lg:col-span-5 h-full">
            <TaskInput />
          </div>

          <div className="lg:col-span-7 h-full">
            <QueueDashboard queue={queue} />
          </div>
        </main>
      </div>
      <InputModal
        isOpen={!!inputRequest}
        question={inputRequest?.question}
        onSubmit={handleInputSubmit}
      />
    </div>
  );
}

export default App;
