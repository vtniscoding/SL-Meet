import React, { useState, useRef, useEffect } from 'react';
import {
  EditActionIcon as Edit,
  DeleteActionIcon as Trash,
  CopyActionIcon as Copy,
  CheckmarkIcon as Check,
  CloseIcon as X,
  CameraOnIcon as Video,
} from '../../icons';

/**
 * Format timestamp into human-readable relative or short date string.
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(timestamp).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * RoomHistoryCard Component:
 * Clean, interactive card for a saved meeting room in Dock 2.
 * Supports inline renaming, copying room ID, quick rejoining, and deletion.
 */
export default function RoomHistoryCard({ room, onJoin, onRename, onDelete }) {
  const { id: roomId, name: roomName, joinedAt } = room;

  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(roomName || `Meeting ${roomId}`);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  // Sync draftName when room.name changes externally
  useEffect(() => {
    setDraftName(roomName || `Meeting ${roomId}`);
  }, [roomName, roomId]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSaveRename = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    const clean = draftName.trim();
    if (clean && clean !== roomName) {
      onRename(roomId, clean);
    }
    setIsEditing(false);
  };

  const handleCancelRename = (e) => {
    e?.stopPropagation();
    setDraftName(roomName || `Meeting ${roomId}`);
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSaveRename(e);
    } else if (e.key === 'Escape') {
      handleCancelRename(e);
    }
  };

  const handleCopyId = (e) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const formattedTime = formatRelativeTime(joinedAt);

  return (
    <div
      onClick={() => !isEditing && onJoin(roomId)}
      className={`w-full bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs hover:border-[#5CA0F2]/50 transition-all p-3 flex flex-col space-y-2 group select-none ${
        !isEditing ? 'cursor-pointer hover:bg-slate-50/50' : ''
      }`}
    >
      {/* Top Row: Room Name / Inline Editor + Quick Actions */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        {isEditing ? (
          <form
            onSubmit={handleSaveRename}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 flex items-center space-x-1.5 min-w-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Room name..."
              className="flex-1 text-xs font-semibold text-slate-900 bg-white border border-[#5CA0F2] rounded-lg px-2 py-1 outline-none shadow-2xs min-w-0"
            />
            <button
              type="submit"
              className="p-1 rounded-lg bg-[#5CA0F2] text-white hover:bg-[#4A8FE0] transition-colors shrink-0 cursor-pointer"
              title="Save name"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleCancelRename}
              className="p-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0 cursor-pointer"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <>
            <div className="flex items-center space-x-1.5 min-w-0 flex-1">
              <span
                className="text-xs font-bold text-slate-900 truncate"
                title={roomName || `Meeting ${roomId}`}
              >
                {roomName || `Meeting ${roomId}`}
              </span>
            </div>

            {/* Action Buttons: Rename & Delete */}
            <div
              className="flex items-center space-x-1 opacity-70 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Rename room"
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(roomId)}
                className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                title="Remove from history"
              >
                <Trash className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Bottom Row: Room ID Badge + Time + Quick Join CTA */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5 border-t border-slate-100/80">
        <div className="flex items-center space-x-2 min-w-0">
          {/* Room ID Badge with Copy trigger */}
          <button
            type="button"
            onClick={handleCopyId}
            className="inline-flex items-center space-x-1 font-mono text-[10px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200/80 px-1.5 py-0.5 rounded-md transition-colors cursor-pointer"
            title="Click to copy Room ID"
          >
            <span className="truncate max-w-[120px]">{roomId}</span>
            {copied ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <Copy className="w-3 h-3 text-slate-400" />
            )}
          </button>

          {formattedTime && (
            <span className="text-[10px] text-slate-400 truncate">
              {formattedTime}
            </span>
          )}
        </div>

        {/* Join Button */}
        {!isEditing && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onJoin(roomId);
            }}
            className="inline-flex items-center space-x-1 text-[11px] font-bold text-[#0B57D0] hover:text-[#0842a0] bg-blue-50/70 hover:bg-blue-100 px-2 py-0.5 rounded-md transition-colors cursor-pointer shrink-0"
            title="Join this room"
          >
            <Video className="w-3 h-3" />
            <span>Join</span>
          </button>
        )}
      </div>
    </div>
  );
}
