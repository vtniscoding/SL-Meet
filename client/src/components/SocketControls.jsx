import React, { useState } from 'react';
import { Server, Users, ArrowRight, ShieldAlert, Terminal, Play, LogOut } from 'lucide-react';

export default function SocketControls({
  serverUrl,
  setServerUrl,
  isConnected,
  socketId,
  currentRoom,
  logs,
  onToggleConnection,
  onJoinRoom,
  onLeaveRoom,
  onSendTestGesture,
}) {
  const [inputRoom, setInputRoom] = useState('sign-room-1');

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    if (inputRoom.trim()) {
      onJoinRoom(inputRoom.trim());
    }
  };

  return (
    <div className="w-full lg:w-96 flex flex-col space-y-4">
      {/* Socket Configuration Card */}
      <div className="p-4 rounded-2xl glass-card border border-slate-800/90 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Server className="w-4 h-4 text-indigo-400" />
            <h2 className="font-bold text-sm text-slate-200">Render Socket Service</h2>
          </div>
          <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400 shadow-glow-emerald' : 'bg-rose-500'}`} />
        </div>

        {/* Server Endpoint Input */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Server Endpoint URL
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              disabled={isConnected}
              className="flex-1 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700/80 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono disabled:opacity-60"
            />
            <button
              onClick={onToggleConnection}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                isConnected
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                  : 'bg-indigo-600 text-white hover:bg-indigo-500'
              }`}
            >
              {isConnected ? 'Disconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Room Joining & Active Room Info */}
        {isConnected && (
          <div className="pt-2 border-t border-slate-800 space-y-3">
            {!currentRoom ? (
              <form onSubmit={handleJoinSubmit} className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Join Meeting Room
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="Enter Room ID"
                    value={inputRoom}
                    onChange={(e) => setInputRoom(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-1"
                  >
                    <span>Join</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30">
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Active Room</div>
                    <div className="text-xs font-mono font-bold text-cyan-300">{currentRoom}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={onSendTestGesture}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600/60 hover:bg-indigo-500/60 text-white text-[11px] font-medium flex items-center space-x-1"
                  >
                    <Play className="w-3 h-3" />
                    <span>Broadcast</span>
                  </button>
                  <button
                    onClick={onLeaveRoom}
                    className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
                    title="Leave Room"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Terminal Log Console */}
      <div className="flex-1 flex flex-col p-4 rounded-2xl glass-card border border-slate-800/90 shadow-xl overflow-hidden min-h-[220px]">
        <div className="flex items-center space-x-2 mb-2 pb-2 border-b border-slate-800">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Socket Event Stream</span>
        </div>
        <div className="flex-1 overflow-y-auto font-mono text-[11px] space-y-1.5 pr-1">
          {logs.length === 0 ? (
            <div className="text-slate-600 italic py-4 text-center">No socket events logged yet...</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex items-start space-x-2 leading-tight">
                <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                <span className={`break-all ${
                  log.type === 'success' ? 'text-emerald-400' :
                  log.type === 'error' ? 'text-rose-400' :
                  log.type === 'warning' ? 'text-amber-400' :
                  log.type === 'gesture' ? 'text-cyan-300 font-bold' : 'text-slate-300'
                }`}>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
