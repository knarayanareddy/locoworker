import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Sessions from './components/Sessions';
import Commands from './components/Commands';
import Memory from './components/Memory';
import Kairos from './components/Kairos';
import Research from './components/Research';
import Simulation from './components/Simulation';
import Wiki from './components/Wiki';
import Gateway from './components/Gateway';
import Security from './components/Security';
import Providers from './components/Providers';
import GitWorkflow from './components/GitWorkflow';
import SettingsPanel from './components/SettingsPanel';

const SECTION_COMPONENTS: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  sessions: Sessions,
  commands: Commands,
  memory: Memory,
  kairos: Kairos,
  research: Research,
  simulation: Simulation,
  wiki: Wiki,
  gateway: Gateway,
  security: Security,
  providers: Providers,
  git: GitWorkflow,
  settings: SettingsPanel,
};

export default function App() {
  const [activeSection, setActiveSection] = useState('dashboard');

  const SectionComponent = SECTION_COMPONENTS[activeSection] || Dashboard;

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-gray-950/80 backdrop-blur-sm border-b border-gray-800/60 px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500 font-mono">
              <span className="text-gray-600">locoworker</span>
              <span className="text-gray-700 mx-1">/</span>
              <span className="text-violet-400">{activeSection}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5 text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>claude-opus-4-5</span>
            </div>
            <div className="text-gray-600">|</div>
            <div className="text-gray-500">
              <span className="text-amber-400">74%</span> context
            </div>
            <div className="text-gray-600">|</div>
            <div className="text-emerald-400">$22.93 today</div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <SectionComponent />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
