import React from 'react';
import { Sparkles, Radio, CheckCircle2 } from 'lucide-react';

export default function GestureLog({ activeGesture, remoteGestures }) {
  return (
    <div className="h-44 p-4 rounded-2xl glass-card border border-slate-800/90 flex flex-col shadow-xl">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Real-Time Recognized Sign Language Stream
          </h3>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">Live Broadcast</span>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto pr-1">
        {/* Local Active Recognition */}
        <div className="p-3 rounded-xl bg-slate-900/80 border border-indigo-500/20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Local Camera AI</div>
              <div className="text-sm font-extrabold text-indigo-200">{activeGesture.gesture}</div>
            </div>
          </div>
          {activeGesture.confidence > 0 && (
            <div className="text-right">
              <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded font-bold">
                {Math.round(activeGesture.confidence * 100)}%
              </span>
            </div>
          )}
        </div>

        {/* Remote Socket Stream */}
        <div className="p-3 rounded-xl bg-slate-900/80 border border-cyan-500/20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Remote Participant Signal</div>
              <div className="text-sm font-extrabold text-cyan-200">
                {remoteGestures.length > 0 ? remoteGestures[0].gesture : 'Awaiting Signals...'}
              </div>
            </div>
          </div>
          {remoteGestures.length > 0 && (
            <div className="text-right">
              <span className="text-[10px] font-mono text-slate-400">
                User: {remoteGestures[0].senderId ? remoteGestures[0].senderId.slice(0, 5) : 'Peer'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
