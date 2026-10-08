import React from 'react';
import { Camera, Radio, Cpu, Sparkles, Monitor, Activity } from 'lucide-react';

export default function Navbar({
  isConnected,
  serverUrl,
  socketId,
  isProcessing,
  fps,
  onToggleCamera,
  onToggleSocket,
}) {
  return (
    <header className="h-16 px-6 glass-panel flex items-center justify-between z-50 border-b border-slate-800/80 select-none">
      {/* Brand & App Title */}
      <div className="flex items-center space-x-3">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 shadow-lg shadow-indigo-500/25">
          <Sparkles className="w-5 h-5 text-white" />
          <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
          </span>
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-indigo-300">
              SL-Meet AI
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Electron + Vision
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            Real-Time Sign Language & Socket Service
          </p>
        </div>
      </div>

      {/* Middle Telemetry & Status Badges */}
      <div className="hidden md:flex items-center space-x-4">
        {/* Render Socket Service Badge */}
        <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-300 ${
          isConnected
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 glow-emerald'
            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
        }`}>
          <Radio className={`w-3.5 h-3.5 ${isConnected ? 'animate-pulse text-emerald-400' : ''}`} />
          <span>Render Socket: {isConnected ? 'Online' : 'Offline'}</span>
          {isConnected && (
            <span className="text-[10px] text-slate-400 font-mono">({socketId ? socketId.slice(0, 6) : ''})</span>
          )}
        </div>

        {/* MediaPipe Engine Badge */}
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-800/80 text-cyan-400 border border-slate-700/60 text-xs font-semibold">
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          <span>MediaPipe Hands</span>
          <span className="px-1.5 py-0.2 bg-cyan-950 text-cyan-300 text-[10px] rounded font-mono">{fps} FPS</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleCamera}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shadow-md ${
            isProcessing
              ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
          }`}
        >
          <Camera className="w-4 h-4" />
          <span>{isProcessing ? 'Stop Vision' : 'Start Camera'}</span>
        </button>

        <button
          onClick={onToggleSocket}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-200 ${
            isConnected
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border-cyan-500/40'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>{isConnected ? 'Disconnect' : 'Connect Socket'}</span>
        </button>
      </div>
    </header>
  );
}
