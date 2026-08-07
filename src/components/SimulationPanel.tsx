import React, { useState } from 'react';
import { Terminal, Play, Square, MessageSquare, ShieldAlert, Sparkles, User, HelpCircle, ArrowRight, Zap, RefreshCw, Layers } from 'lucide-react';
import { Company, Load, User as AppUser } from '../types';

interface SimulationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeRole: string;
  activeCompanyId: string;
  companies: Company[];
  loads: Load[];
  users: AppUser[];
  isAutoGpsActive: boolean;
  onToggleAutoGps: (loadId: string) => void;
  onSimulateIncomingMessage: (text: string, role: 'driver' | 'dispatcher') => void;
  onSimulateNewTenant: () => void;
  onSimulateStripeWebhook: () => void;
  onSimulateRoadHazard: (city: string) => void;
}

export default function SimulationPanel({
  isOpen,
  onClose,
  activeRole,
  activeCompanyId,
  companies,
  loads,
  users,
  isAutoGpsActive,
  onToggleAutoGps,
  onSimulateIncomingMessage,
  onSimulateNewTenant,
  onSimulateStripeWebhook,
  onSimulateRoadHazard,
}: SimulationPanelProps) {
  const [logMessages, setLogMessages] = useState<string[]>([
    'SYSTEM: SimuTrack Controller initialized.',
    'SYSTEM: Ready to inject cross-role simulation telemetry.',
  ]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogMessages((prev) => [`[${timestamp}] ${message}`, ...prev.slice(0, 15)]);
  };

  // Find active in-transit loads for the current company
  const companyLoads = loads.filter((l) => l.companyId === activeCompanyId);
  const inTransitLoad = companyLoads.find((l) => l.status === 'in_transit');
  const activeCompany = companies.find((c) => c.id === activeCompanyId);

  const handleToggleGps = () => {
    if (!inTransitLoad) {
      addLog('ERR: No "In-Transit" load found for active tenant. Go to Dispatcher -> assign a driver -> set to Roll Mode first.');
      alert('Simulation notice:\nTo run the live GPS route simulator, please select the DISPATCHER or DRIVER role and transition any booked load to "In-Transit" (Roll Mode) first.');
      return;
    }
    if (inTransitLoad.gpsTrackingRequired === false) {
      addLog(`ERR: GPS Tracking is toggled OFF on Load ${inTransitLoad.loadNumber}.`);
      alert(`GPS Tracking is disabled for Load #${inTransitLoad.loadNumber}.\n\nTo run live driving simulation, edit the load details in Dispatcher View and toggle "GPS Tracking Required" to ON.`);
      return;
    }
    onToggleAutoGps(inTransitLoad.id);
    const nextState = !isAutoGpsActive;
    addLog(`GPS SIMULATOR: ${nextState ? 'STARTED auto-tracking for Load ' + inTransitLoad.loadNumber : 'PAUSED'}`);
  };

  const handleTriggerMessage = (role: 'driver' | 'dispatcher', presetText: string) => {
    onSimulateIncomingMessage(presetText, role);
    addLog(`MESSAGE INJECTED: [${role.toUpperCase()}] "${presetText}"`);
  };

  const handleTenantSimulation = () => {
    onSimulateNewTenant();
    addLog('TENANT SIMULATION: Registered new pending carrier "Titan Heavy Haul" (DOT #2901923)');
  };

  const handleStripeUpgrade = () => {
    if (activeCompany?.plan === 'Premium') {
      addLog(`BILLING SYNC: Company "${activeCompany?.name || 'SaaS Customer'}" is already at Premium Tier.`);
      return;
    }
    onSimulateStripeWebhook();
    addLog(`STRIPE WEBHOOK: Dispatched "checkout.session.completed" to billing webhook handler.`);
  };

  const handleHazardSimulation = () => {
    const cities = ['Houston', 'Dallas', 'St. Louis', 'Chicago', 'Atlanta'];
    const randomCity = cities[Math.floor(Math.random() * cities.length)];
    onSimulateRoadHazard(randomCity);
    addLog(`SAFETY BROADCAST: Weather/hazard caution sent for ${randomCity} corridor.`);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col justify-between text-white animate-[slideIn_0.25s_ease-out]"
      id="simutrack-overlay-drawer"
    >
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-purple-400 animate-pulse" />
          <div>
            <h3 className="font-heading font-extrabold text-xs uppercase tracking-wide">
              SimuTrack™ Control Deck
            </h3>
            <p className="text-[10px] text-slate-500 font-mono">Telemetry Event Injector</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition text-xs"
        >
          ✕
        </button>
      </div>

      {/* Control Deck Body */}
      <div className="flex-grow overflow-y-auto p-4 space-y-5">
        <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800/60 text-[11px] text-slate-400 leading-normal">
          <span className="font-bold text-white block mb-1">💡 What is this?</span>
          This simulation dashboard allows you to trigger real-time multi-tenant events instantly. Avoid manually logging in as different roles to test the app—just trigger them from this panel!
        </div>

        {/* SECTION 1: Automatic GPS Truck Route Tracking */}
        <div className="space-y-2">
          <span className="text-[10px] font-mono font-bold text-purple-400 uppercase tracking-wider block">
            🛰️ Real-Time GPS Route Simulator
          </span>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex justify-between items-start text-xs">
              <div>
                <strong className="block text-slate-200">Live Driving Simulation</strong>
                <span className="text-[10px] text-slate-500">
                  Auto-increments driver coordinates along active route.
                </span>
              </div>
              <span
                className={`h-2.5 w-2.5 rounded-full ${isAutoGpsActive ? 'bg-emerald-500 animate-ping' : 'bg-slate-600'}`}
              ></span>
            </div>

            {inTransitLoad ? (
              <div className="bg-slate-900 border border-slate-850 p-2 rounded-lg text-[10px] font-mono text-slate-400 space-y-1">
                <div>Active Truck: <span className="text-purple-400 font-bold">Jack Nelson</span></div>
                <div>Load Target: <span className="text-white font-bold">{inTransitLoad.loadNumber}</span></div>
                <div>Cargo: <span className="text-yellow-500">{inTransitLoad.cargoType}</span></div>
              </div>
            ) : (
              <div className="bg-slate-900/40 p-2 rounded-lg text-[9.5px] font-mono text-amber-500/80 border border-amber-900/20 text-center">
                ⚠ No active load is marked "In-Transit"
              </div>
            )}

            <button
              onClick={handleToggleGps}
              className={`w-full py-2.5 rounded-lg text-xs font-heading font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 transition ${
                isAutoGpsActive
                  ? 'bg-rose-600 text-white hover:bg-rose-500 shadow-rose-950/20 shadow-md'
                  : 'bg-purple-600 text-white hover:bg-purple-500 shadow-purple-950/20 shadow-md'
              }`}
            >
              {isAutoGpsActive ? (
                <>
                  <Square className="h-3.5 w-3.5 fill-current" /> Pause Live Driver Movement
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" /> Start Live Driver Movement
                </>
              )}
            </button>
          </div>
        </div>

        {/* SECTION 2: Instant Messaging Trigger */}
        <div className="space-y-2">
          <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-wider block">
            💬 Quick Chat Message Injections
          </span>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
            <p className="text-[10px] text-slate-500">
              Simulate chat updates on the active channel.
            </p>
            <div className="grid grid-cols-1 gap-1.5 pt-1">
              <button
                onClick={() =>
                  handleTriggerMessage(
                    'driver',
                    'ELD Alert: Reached high traffic zone near city border. Continuing on secondary highway.'
                  )
                }
                className="text-left bg-slate-900 hover:bg-slate-850 p-2 rounded border border-slate-800 text-[10.5px] transition flex justify-between items-center group"
              >
                <span className="text-slate-300">"Traffic delay near border..."</span>
                <span className="text-[9px] font-mono bg-amber-500/10 text-amber-500 px-1 py-0.5 rounded uppercase">
                  From Driver
                </span>
              </button>
              <button
                onClick={() =>
                  handleTriggerMessage(
                    'driver',
                    'Arrived at cargo terminal checkpoint. Beginning digital signature and POD scan.'
                  )
                }
                className="text-left bg-slate-900 hover:bg-slate-850 p-2 rounded border border-slate-800 text-[10.5px] transition flex justify-between items-center group"
              >
                <span className="text-slate-300">"Arrived at receiver terminal..."</span>
                <span className="text-[9px] font-mono bg-amber-500/10 text-amber-500 px-1 py-0.5 rounded uppercase">
                  From Driver
                </span>
              </button>
              <button
                onClick={() =>
                  handleTriggerMessage(
                    'dispatcher',
                    'URGENT Dispatch bulletin: Customer requested temperature setpoint decrease to 34°F.'
                  )
                }
                className="text-left bg-slate-900 hover:bg-slate-850 p-2 rounded border border-slate-800 text-[10.5px] transition flex justify-between items-center group"
              >
                <span className="text-slate-300">"Urgent temp setpoint bulletin..."</span>
                <span className="text-[9px] font-mono bg-indigo-500/10 text-indigo-400 px-1 py-0.5 rounded uppercase">
                  From Dispatch
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 3: SaaS / DOT Compliance Event triggers */}
        <div className="space-y-2">
          <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider block">
            🛡️ Platform Admin & SaaS Billing Webhooks
          </span>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
            <p className="text-[10px] text-slate-500">
              Trigger background billing or compliance verification scenarios.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleTenantSimulation}
                className="bg-slate-900 hover:bg-slate-850 border border-slate-800 p-2.5 rounded-lg text-center text-[11px] transition flex flex-col items-center justify-center gap-1"
              >
                <Layers className="h-4 w-4 text-emerald-400" />
                <span className="font-semibold text-slate-200">Simulate Carrier DOT Sign Up</span>
              </button>
              <button
                onClick={handleStripeUpgrade}
                className="bg-slate-900 hover:bg-slate-850 border border-slate-800 p-2.5 rounded-lg text-center text-[11px] transition flex flex-col items-center justify-center gap-1"
              >
                <Zap className="h-4 w-4 text-amber-400" />
                <span className="font-semibold text-slate-200">Trigger Stripe Paid Upgrade</span>
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 4: Live Bulletin Broadcast */}
        <div className="space-y-2">
          <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wider block">
            ⚠️ DOT Dispatch Bulletins
          </span>
          <button
            onClick={handleHazardSimulation}
            className="w-full bg-slate-950 hover:bg-slate-900 border border-slate-800 p-3 rounded-xl transition text-left flex items-start gap-3"
          >
            <ShieldAlert className="h-5 w-5 text-rose-500 mt-0.5 animate-pulse shrink-0" />
            <div>
              <strong className="block text-xs text-slate-200">Inject Weather Hazard Bulletin</strong>
              <span className="text-[10px] text-slate-500 block">
                Broadcast corridor safety advisory to all driver screens instantly.
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Real-time System Logs Console Terminal */}
      <div className="p-3 bg-slate-950 border-t border-slate-850 flex flex-col h-44 font-mono select-text">
        <div className="flex justify-between items-center text-[9px] text-slate-500 border-b border-slate-900 pb-1.5 mb-1.5">
          <span>CONSOLE LOGS Telemetry</span>
          <span className="text-emerald-500 flex items-center gap-1">
            <span className="h-1 w-1 bg-emerald-500 rounded-full animate-ping"></span> LOGS LIVE
          </span>
        </div>
        <div className="flex-grow overflow-y-auto text-[9.5px] text-zinc-400 space-y-1.5 scrollbar-thin">
          {logMessages.map((log, index) => (
            <div key={index} className="leading-normal">
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
