import React, { useState, useEffect, useRef } from 'react';
import { X, Send, MessageSquare } from 'lucide-react';

/**
 * In-Meeting Real-time Text Chat Drawer Component
 * Google Meet Dark Theme aesthetic (#202124 / #28292C)
 */
export default function MeetingChatDrawer({
  isOpen,
  onClose,
  messages = [],
  onSendMessage,
  currentSocketId,
}) {
  const [inputText, setInputText] = useState('');
  const chatBottomRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    if (isOpen && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    if (onSendMessage) {
      onSendMessage(inputText.trim());
    }
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <aside className="w-80 sm:w-96 h-full bg-[#202124] border-l border-slate-700/60 flex flex-col justify-between z-20 shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 select-text">
      {/* Header */}
      <header className="px-5 py-4 bg-[#28292C] border-b border-slate-700/60 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2.5">
          <MessageSquare className="w-5 h-5 text-blue-400" />
          <h3 className="text-base font-semibold text-white">In-call messages</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors outline-none focus:outline-none"
          title="Close chat"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Security Note Banner */}
      <div className="px-4 py-2.5 bg-[#28292C]/50 border-b border-slate-800 text-[11px] text-slate-400 text-center select-none">
        Messages can be seen only by people in the call and are deleted when the call ends.
      </div>

      {/* Messages Scroll Body */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3.5 scrollbar-thin scrollbar-thumb-slate-700">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs px-4 select-none">
            <MessageSquare className="w-10 h-10 mb-2 opacity-30" />
            <p>No messages yet.</p>
            <p className="mt-1 text-[11px] text-slate-600">Send a message to start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.type === 'system') {
              return (
                <div key={msg.id} className="flex justify-center my-2 select-none">
                  <span className="bg-slate-800/80 text-slate-400 text-[11px] px-3 py-1 rounded-full font-medium shadow-sm">
                    {msg.text}
                  </span>
                </div>
              );
            }

            const isSelf = msg.senderId === currentSocketId || msg.senderId === 'local';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
              >
                {/* Sender & Timestamp */}
                <div className="flex items-center space-x-2 text-[11px] text-slate-400 mb-1 px-1 select-none">
                  <span className="font-semibold text-slate-300">
                    {isSelf ? 'You' : msg.senderName}
                  </span>
                  <span>•</span>
                  <span>{formatTime(msg.timestamp)}</span>
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words shadow-md ${
                    isSelf
                      ? 'bg-blue-600 text-white rounded-tr-xs'
                      : 'bg-[#3C4043] text-slate-100 rounded-tl-xs'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Input Box Footer */}
      <form
        onSubmit={handleSend}
        className="p-3.5 bg-[#28292C] border-t border-slate-700/60 flex items-center space-x-2 select-none"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          className="flex-1 bg-[#3C4043] text-white placeholder-slate-400 text-sm px-4 py-2.5 rounded-full border border-transparent focus:border-blue-500 focus:bg-[#474B4F] outline-none transition-all"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
            inputText.trim()
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md cursor-pointer'
              : 'bg-[#3C4043] text-slate-500 cursor-not-allowed'
          }`}
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </aside>
  );
}
