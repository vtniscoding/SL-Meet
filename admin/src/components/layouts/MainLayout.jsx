import React from 'react';
import Navbar from './Navbar';

/**
 * Main Application Layout
 * Provides root frame structure, top draggable navigation bar, and responsive body viewport.
 */
export default function MainLayout({
  activeTab = 'training',
  onTabChange,
  children,
}) {
  return (
    <div className="w-screen h-screen max-h-screen bg-[#000000] text-white flex flex-col font-sans select-none overflow-hidden">
      {/* Top Navbar with Navigation Pills and TitleBar Controls */}
      <Navbar activeTab={activeTab} onTabChange={onTabChange} />

      {/* Main Studio Body Container (100% full width, #000000 meeting room background) */}
      <main className="flex-1 flex flex-row overflow-hidden min-h-0 relative bg-[#000000]">
        {children}
      </main>
    </div>
  );
}

