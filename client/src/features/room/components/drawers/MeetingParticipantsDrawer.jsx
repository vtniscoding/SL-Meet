import React, { useState } from 'react';
import {
  CloseIcon as X,
  SearchIcon as Search,
  ParticipantsDrawerIcon as Users,
  MicOnIcon as Mic,
  MicOffIcon as MicOff,
  CameraOnIcon as Video,
  CameraOffIcon as VideoOff,
  ScreenShareIcon as Monitor,
  PinIcon as Pin,
  UnpinIcon as PinOff,
  ModerationKickIcon as UserX,
  HandsIcon as Hands,
  ChevronDownIcon,
} from '@sl-meet/shared/icons';
import ParticipantAvatar from '../video/ParticipantAvatar';

/**
 * In-Meeting Real-time Participants List & Moderation Drawer Component
 * Google Meet Dark Theme aesthetic (#202124 / #28292C)
 * Smooth Slide-in Panel with responsive width.
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
  const [isHostOpen, setIsHostOpen] = useState(true);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(true);

  // Determine if current user on this machine is the true Room Host
  const isCurrentUserHost = !!(
    (currentSocketId && hostId && currentSocketId === hostId) ||
    (!hostId && participants.some((p) => p.isLocal))
  );

  const isParticipantHostFn = (p) => {
    if (p.isLocal) {
      return Boolean((currentSocketId && hostId && currentSocketId === hostId) || !hostId);
    }
    return Boolean(hostId && (p.id === hostId || p.userId === hostId));
  };

  const filteredParticipants = participants.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const hostParticipants = filteredParticipants.filter(isParticipantHostFn);
  const otherParticipants = filteredParticipants.filter((p) => !isParticipantHostFn(p));

  if (!isOpen) return null;

  const renderParticipantRow = (p) => {
    const isPinned = pinnedId === p.id;
    const isLocalUser = p.isLocal;
    const isParticipantHost = isParticipantHostFn(p);

    return (
      <div
        key={p.id}
        className="w-full px-3 py-2 rounded-lg bg-[#28292C]/70 hover:bg-[#35373A] border border-slate-800 flex items-center justify-between transition-colors group"
      >
        {/* Left: Avatar & Name */}
        <div className="flex items-center space-x-3 min-w-0 flex-1 pr-2">
          <ParticipantAvatar
            name={p.name}
            id={p.id}
            avatarUrl={p.avatarUrl}
            avatarColor={p.avatarColor}
            className="w-9 h-9 text-xs"
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-medium text-slate-200 truncate">
                {p.name}
              </span>

              {/* Tag signer / standard only (no duplicate host tag) */}
              {p.role === 'signer' ? (
                <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded font-semibold flex items-center space-x-1 shrink-0">
                  <Hands className="w-2.5 h-2.5" />
                  <span>Signer</span>
                </span>
              ) : (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-semibold flex items-center space-x-1 shrink-0">
                  <Mic className="w-2.5 h-2.5" />
                  <span>Standard</span>
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
        <div className="flex items-center space-x-1.5 shrink-0">
          {/* Pin / Unpin button */}
          <button
            onClick={() => onTogglePin(p.id)}
            className={`p-1.5 rounded-full transition-colors outline-none cursor-pointer ${
              isPinned
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
            }`}
            title={isPinned ? 'Unpin' : 'Pin to screen'}
          >
            {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>

          {/* Mic Mute Indicator or Host Moderation Action */}
          {isCurrentUserHost && !isLocalUser ? (
            <button
              onClick={() => onMutePeer && onMutePeer(p.id)}
              disabled={p.isMuted}
              className={`p-1.5 rounded-full transition-colors outline-none cursor-pointer ${
                p.isMuted
                  ? 'text-rose-500 bg-rose-500/10 cursor-not-allowed'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
              }`}
              title={p.isMuted ? 'Muted' : 'Mute participant'}
            >
              {p.isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <div
              className={`p-1.5 rounded-full ${
                p.isMuted ? 'text-rose-500' : 'text-slate-400'
              }`}
              title={p.isMuted ? 'Microphone OFF' : 'Microphone ON'}
            >
              {p.isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </div>
          )}

          {/* Camera Indicator */}
          <div
            className={`p-1.5 rounded-full ${
              p.isCameraOff ? 'text-rose-500' : 'text-slate-400'
            }`}
            title={p.isCameraOff ? 'Camera OFF' : 'Camera ON'}
          >
            {p.isCameraOff ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
          </div>

          {/* Host Kick Option */}
          {isCurrentUserHost && !isLocalUser && (
            <button
              onClick={() => onKickPeer && onKickPeer(p.id)}
              className="p-1.5 rounded-full text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 transition-colors outline-none cursor-pointer"
              title="Remove participant from call"
            >
              <UserX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col justify-between overflow-hidden select-none">
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
          className="p-1.5 rounded-full hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors outline-none focus:outline-none cursor-pointer"
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
              className="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Participants Categorized List */}
      <div className="flex-1 p-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
        {filteredParticipants.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs px-4">
            <Users className="w-10 h-10 mb-2 opacity-30" />
            <p>No participants found matching "{searchTerm}"</p>
          </div>
        ) : (
          <div>
            {/* Title: In the meeting */}
            <h4 className="text-xs font-semibold text-slate-300 px-1 mb-2.5">
              In the meeting
            </h4>

            {/* Host Section Dropdown */}
            <div className="border border-slate-700/60 rounded-xl bg-transparent overflow-hidden mb-2.5">
              <button
                type="button"
                onClick={() => setIsHostOpen((prev) => !prev)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-200 hover:bg-white/5 transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center space-x-1.5">
                  <span>Host</span>
                  <span className="text-slate-400 font-normal">({hostParticipants.length})</span>
                </div>
                <ChevronDownIcon
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                    isHostOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {isHostOpen && (
                <div className="p-1.5 space-y-1.5 border-t border-slate-700/40">
                  {hostParticipants.length === 0 ? (
                    <div className="py-2.5 text-center text-slate-500 text-xs">No host found</div>
                  ) : (
                    hostParticipants.map(renderParticipantRow)
                  )}
                </div>
              )}
            </div>

            {/* Participant Section Dropdown */}
            <div className="border border-slate-700/60 rounded-xl bg-transparent overflow-hidden">
              <button
                type="button"
                onClick={() => setIsParticipantsOpen((prev) => !prev)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-200 hover:bg-white/5 transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center space-x-1.5">
                  <span>Participant</span>
                  <span className="text-slate-400 font-normal">({otherParticipants.length})</span>
                </div>
                <ChevronDownIcon
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                    isParticipantsOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {isParticipantsOpen && (
                <div className="p-1.5 space-y-1.5 border-t border-slate-700/40">
                  {otherParticipants.length === 0 ? (
                    <div className="py-2.5 text-center text-slate-500 text-xs">No participants found</div>
                  ) : (
                    otherParticipants.map(renderParticipantRow)
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
