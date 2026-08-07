import React from 'react';
import { ShieldCheck, Truck } from 'lucide-react';
import { Load } from '../types';
import { formatWeight } from '../utils';

interface DriverCompletedHistoryProps {
  completedLoads: Load[];
}

export default function DriverCompletedHistory({ completedLoads }: DriverCompletedHistoryProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-3">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">📁 Past Loads Completed ({completedLoads.length})</span>
        <span className="text-[9px] font-mono text-emerald-500 font-bold">SECURED RECORD</span>
      </div>

      {completedLoads.length === 0 ? (
        <p className="text-[10px] text-zinc-500 text-center py-4">No completed loads recorded.</p>
      ) : (
        <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
          {completedLoads.map((l) => (
            <div key={l.id} className="bg-zinc-950 border border-zinc-850 p-2.5 rounded-lg space-y-1.5">
              <div className="flex justify-between items-center text-[10.5px]">
                <strong className="font-mono text-yellow-500 text-xs">#{l.loadNumber}</strong>
                <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-900/40 text-[8.5px] font-bold px-1.5 py-0.2 rounded font-mono">
                  ✓ DELIVERED
                </span>
              </div>
              <div className="text-[10px] text-zinc-400 font-mono flex justify-between">
                <span>{l.pickup.facilityName.split(',')[0]} ➔ {l.delivery.facilityName.split(',')[0]}</span>
                <span className="text-zinc-500">{formatWeight(l.weight)}</span>
              </div>
              {l.podUrl && (
                <div className="text-[8.5px] text-emerald-500 font-mono flex items-center gap-1 bg-emerald-950/30 border border-emerald-900/30 p-1 rounded">
                  <ShieldCheck className="h-3 w-3" />
                  <span>POD Document Secured & Signed</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
