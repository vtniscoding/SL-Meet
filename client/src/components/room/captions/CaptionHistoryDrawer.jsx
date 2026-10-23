import React, { useMemo, useRef, useEffect } from 'react';
import {
  CloseIcon as X,
  DownloadTranscriptIcon as Download,
  TranscriptFileIcon as FileText,
  MicOnIcon as Mic,
  SignGestureIcon as Hand,
  TimestampClockIcon as Clock,
} from '../../../icons';
import { colorForSender } from './captionUtils';
import { downloadMeetingTranscript } from '../../../utils/exportTranscript';

/**
 * CaptionHistoryDrawer Component:
 * Slide-over drawer displaying chronological history of all speech captions
 * and sign language translations. Allows downloading complete transcript.
 */
export default function CaptionHistoryDrawer({
  isOpen = false,
  onClose,
  speechLogs = [],
  transcriptLogs = [],
  roomId = 'Meeting',
}) {
  const scrollRef = useRef(null);

  // Merge and sort all transcript and speech records chronologically
  const mergedHistory = useMemo(() => {
    const combined = [
      ...speechLogs.map((log) => ({
        id: log.id || `speech-${log.timestamp}`,
        timestamp: log.timestamp || Date.now(),
        timeFormatted: log.time || new Date(log.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        sender: log.sender || 'Speaker',
        senderId: log.senderId || log.sender || 'local',
        type: 'SPEECH',
        text: log.text,
      })),
      ...transcriptLogs.map((log) => ({
        id: log.id || `asl-${log.timestamp}`,
        timestamp: log.timestamp || Date.now(),
        timeFormatted: log.time || new Date(log.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        sender: log.sender || 'Signer',
        senderId: 'asl-sender',
        type: 'ASL',
        text: log.text,
      })),
    ].sort((a, b) => a.timestamp - b.timestamp);

    return combined;
  }, [speechLogs, transcriptLogs]);

  // Auto scroll to bottom when new entries arrive
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOpen, mergedHistory.length]);

  if (!isOpen) return null;

  const handleDownload = () => {
    downloadMeetingTranscript(transcriptLogs, roomId, speechLogs);
  };

  return (
    <aside
      className="w-80 md:w-96 h-full bg-[#202124] border-l border-white/10 flex flex-col z-40 shrink-0 shadow-2xl transition-all duration-300 font-sans select-text"
      role="region"
      aria-label="Caption History"
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#28292C]/50 select-none">
        <div className="flex items-center space-x-2.5">
          <FileText className="w-5 h-5 text-[#8AB4F8]" />
          <div>
            <h3 className="text-sm font-bold text-white">Transcript History</h3>
            <p className="text-[11px] text-slate-400">
              {mergedHistory.length} total entries recorded
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Close history"
          aria-label="Close transcript history"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* History Log Feed */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar text-xs"
      >
        {mergedHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 select-none text-center px-4">
            <Clock className="w-8 h-8 opacity-40 text-slate-400" />
            <p className="text-sm font-medium">No captions recorded yet</p>
            <p className="text-xs text-slate-500">
              Spoken words and sign language translations will be cataloged here in real-time.
            </p>
          </div>
        ) : (
          mergedHistory.map((item) => {
            const isSpeech = item.type === 'SPEECH';
            const badgeColor = isSpeech ? colorForSender(item.senderId) : '#C58AF9';

            return (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1.5 hover:border-white/10 transition-colors"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center space-x-1.5">
                    {isSpeech ? (
                      <Mic className="w-3.5 h-3.5" style={{ color: badgeColor }} />
                    ) : (
                      <Hand className="w-3.5 h-3.5 text-[#C58AF9]" />
                    )}
                    <span className="font-semibold text-slate-200" style={{ color: badgeColor }}>
                      {item.sender}
                    </span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                      ({isSpeech ? 'Voice' : 'ASL'})
                    </span>
                  </div>
                  <span className="text-slate-400 font-mono text-[10px]">
                    {item.timeFormatted}
                  </span>
                </div>

                <p className="text-slate-100 font-normal leading-relaxed text-xs break-words">
                  {item.text}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Action: Download Transcript */}
      <div className="p-3.5 border-t border-white/10 bg-[#28292C]/30 select-none">
        <button
          onClick={handleDownload}
          disabled={mergedHistory.length === 0}
          className={`w-full py-2.5 px-4 rounded-xl font-medium text-xs flex items-center justify-center space-x-2 transition-all ${
            mergedHistory.length > 0
              ? 'bg-[#8AB4F8] hover:bg-[#7ba6ee] text-[#202124] shadow-md font-semibold'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
          title="Export meeting transcript as .txt file"
        >
          <Download className="w-4 h-4" />
          <span>Download Meeting Transcript (.txt)</span>
        </button>
      </div>
    </aside>
  );
}
