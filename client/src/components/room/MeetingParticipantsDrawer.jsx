import React, { useState } from 'react';
import { X, Search, Users, Mic, MicOff, Video, VideoOff, Monitor, Pin, PinOff, UserX, Shield } from 'lucide-react';

/**
 * In-Meeting Real-time Participants List & Moderation Drawer Component
 * Google Meet Dark Theme aesthetic (#202124 / #28292C)
 */
export default function MeetingParticipantsDrawer({
  isOpen,
  onClose,
  participants = [],
  pinnedId,
  hostId,
  currentSocketId,
  onTogglePin,
  onMutePeer,
  onKickPeer,
}) {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  // Determine if current user on this machine is the true Room Host
  const isCurrentUserHost = !!(
    (currentSocketId && hostId && currentSocketId === hostId) ||
    (!hostId && participants.some((p) => p.isLocal))
  );

  const filteredParticipants = participants.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getAvatarColor = (id) => {
    if (id === 'local' || id === 'local-screen') return 'bg-blue-600';
    const colors = [
      'bg-emerald-600',
      'bg-amber-600',
      'bg-indigo-600',
      'bg-rose-600',
      'bg-cyan-600',
      'bg-purple-600',
    ];
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash += id.charCodeAt(i);
    }
    return colors[hash % colors.length];
  };

  return (
    <aside className="w-80 sm:w-96 h-full bg-[#202124] border-l border-slate-700/60 flex flex-col justify-between z-20 shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 select-none">
      {/* Drawer Header */}
      <header className="px-5 py-4 bg-[#28292C] border-b border-slate-700/60 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <Users className="w-5 h-5 text-blue-400" />
          <h3 className="text-base font-semibold text-white">
            People <span className="text-xs text-slate-400 font-normal">({participants.length})</span>
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors outline-none focus:outline-none"
          title="Close panel"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Search Input Box */}
      <div className="p-3.5 bg-[#28292C]/50 border-b border-slate-800">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search for people..."
            className="w-full bg-[#3C4043] text-white placeholder-slate-400 text-xs pl-9 pr-4 py-2.5 rounded-full border border-transparent focus:border-blue-500 outline-none transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Participants List */}
      <div className="flex-1 p-3 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700">
        {filteredParticipants.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs px-4">
            <Users className="w-10 h-10 mb-2 opacity-30" />
            <p>No participants found matching "{searchTerm}"</p>
          </div>
        ) : (
          filteredParticipants.map((p) => {
            const isPinned = pinnedId === p.id;
            const isLocalUser = p.isLocal;
            const isParticipantHost =
              (hostId && (p.id === hostId || p.userId === hostId)) ||
              (!hostId && isLocalUser);

            return (
              <div
                key={p.id}
                className="w-full px-3 py-2.5 rounded-xl bg-[#28292C]/70 hover:bg-[#35373A] border border-slate-800 flex items-center justify-between transition-colors group"
              >
                {/* Left: Avatar & Name */}
                <div className="flex items-center space-x-3 min-w-0 flex-1 pr-2">
                  <div
                    className={`w-9 h-9 rounded-full ${getAvatarColor(
                      p.id
                    )} text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm`}
                  >
                    {getInitials(p.name)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-medium text-slate-200 truncate">
                        {p.name}
                      </span>
                      {isParticipantHost && (
                        <span className="text-[10px] bg-blue-900/60 text-blue-300 border border-blue-700/50 px-1.5 py-0.2 rounded font-semibold shrink-0">
                          Host
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 mt-0.5 text-[10px] text-slate-400">
                      {p.isScreenSharing ? (
                        <span className="flex items-center space-x-1 text-blue-400 font-semibold">
                          <Monitor className="w-3 h-3" />
                          <span>Presenting</span>
                        </span>
                      ) : (
                        <span>{isParticipantHost ? 'Meeting Host' : 'Participant'}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Quick Action & Status Controls */}
                <div className="flex items-center space-x-1 shrink-0">
                  {/* Status Indicator Badges */}
                  <div className="flex items-center space-x-1 mr-1">
                    {/* Mic Status */}
                    {p.isMuted ? (
                      <div className="p-1 rounded-full bg-red-950/60 text-red-400 border border-red-800/40" title="Microphone Muted">
                        <MicOff className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <div className="p-1 rounded-full bg-slate-800 text-emerald-400" title="Microphone Active">
                        <Mic className="w-3.5 h-3.5" />
                      </div>
                    )}

                    {/* Camera Status */}
                    {p.isCameraOff ? (
                      <div className="p-1 rounded-full bg-slate-800 text-slate-500" title="Camera Off">
                        <VideoOff className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <div className="p-1 rounded-full bg-slate-800 text-slate-300" title="Camera On">
                        <Video className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>

                  {/* Pin Stream Button (Available to everyone) */}
                  <button
                    onClick={() => onTogglePin && onTogglePin(p.id)}
                    className={`p-1.5 rounded-lg transition-colors outline-none focus:outline-none ${
                      isPinned
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                    title={isPinned ? 'Unpin stream from stage' : 'Pin stream to main stage'}
                  >
                    {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                  </button>

                  {/* Remote Mute Button (Host action ONLY for remote peers) */}
                  {isCurrentUserHost && !isLocalUser && !p.isScreenSharing && (
                    <button
                      onClick={() => onMutePeer && onMutePeer(p.id)}
                      className="p-1.5 rounded-lg hover:bg-red-950/60 text-slate-400 hover:text-red-400 transition-colors outline-none focus:outline-none"
                      title="Mute participant (Host action)"
                    >
                      <MicOff className="w-3.5 h-3.5" />
                    </button>
                  )}


                  {/* Kick Participant Button (Host action ONLY for remote peers) */}
                  {isCurrentUserHost && !isLocalUser && (
                    <button
                      onClick={() => onKickPeer && onKickPeer(p.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-950/80 text-slate-400 hover:text-rose-400 transition-colors outline-none focus:outline-none"
                      title="Remove participant from call"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <footer className="px-4 py-3 bg-[#28292C] border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center space-x-1.5">
          <Shield className="w-3.5 h-3.5 text-blue-400" />
          <span>{isCurrentUserHost ? 'You are the Host' : 'Host controls active'}</span>
        </div>
        <span>{participants.length} Active</span>
      </footer>
    </aside>
  );
}

