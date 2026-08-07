import React from 'react';
import { Truck } from 'lucide-react';
import { Load, LoadStatus } from '../types';
import { formatWeight } from '../utils';

interface DriverPendingLoadProps {
  pendingLoad: Load;
  onUpdateLoadStatus: (loadId: string, status: LoadStatus) => void;
}

export default function DriverPendingLoad({ pendingLoad, onUpdateLoadStatus }: DriverPendingLoadProps) {
  return (
    <div className="bg-zinc-900 border border-yellow-600/30 rounded-xl p-3.5 space-y-3 relative animate-[fadeIn_0.15s]">
      <span className="absolute -top-2 right-3 bg-yellow-600 text-zinc-950 font-mono text-[8.5px] font-extrabold uppercase px-2 py-0.5 rounded border border-yellow-500 animate-pulse">
        ⚠️ PENDING ASSIGNMENT
      </span>

      <div className="flex justify-between items-center border-b border-zinc-850 pb-2">
        <span className="text-[10px] font-mono text-zinc-500">ASSIGNMENT ID #</span>
        <strong className="text-sm font-mono font-bold text-yellow-500">{pendingLoad.loadNumber}</strong>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-zinc-500 text-[10px] uppercase font-mono">Broker/Shipper</span>
          <strong className="text-zinc-200">{pendingLoad.companyName || 'Not Specified'}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500 text-[10px] uppercase font-mono">Cargo Type</span>
          <strong className="text-zinc-200">{pendingLoad.cargoType}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500 text-[10px] uppercase font-mono">Weight</span>
          <strong className="text-zinc-200">{formatWeight(pendingLoad.weight)}</strong>
        </div>
        <div className="flex justify-between border-t border-zinc-850 pt-1.5 mt-1.5 font-mono">
          <span className="text-zinc-500 text-[10px] uppercase font-mono font-bold text-yellow-500">Routing Path</span>
          <strong className="text-zinc-200 text-[10px] truncate max-w-[150px]">
            {pendingLoad.pickup.facilityName.split(',')[0]} ➔ {pendingLoad.delivery.facilityName.split(',')[0]}
          </strong>
        </div>
      </div>

      <div className="pt-2">
        <button
          onClick={() => {
            onUpdateLoadStatus(pendingLoad.id, 'dispatched');
            alert(`Job accepted!\nLoad ${pendingLoad.loadNumber} is now active in your workspace.`);
          }}
          className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-heading font-extrabold text-[11px] uppercase tracking-wider rounded-xl shadow-lg hover:scale-[1.01] active:scale-98 transition flex items-center justify-center gap-2"
        >
          <Truck className="h-4 w-4 shrink-0" />
          Accept Job & Acknowledge Dispatch
        </button>
      </div>
    </div>
  );
}
