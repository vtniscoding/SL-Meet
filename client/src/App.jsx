import React, { useEffect } from 'react';
import Navbar from './components/Navbar';
import VisionCamera from './components/VisionCamera';
import SocketControls from './components/SocketControls';
import GestureLog from './components/GestureLog';
import { useMediaPipe } from './hooks/useMediaPipe';
import { useSocket } from './hooks/useSocket';

export default function App() {
  const {
    videoRef,
    canvasRef,
    isReady,
    isProcessing,
    activeGesture,
    fps,
    detectedCount,
    handSide,
    startCamera,
    stopCamera,
  } = useMediaPipe();

  const {
    serverUrl,
    setServerUrl,
    isConnected,
    socketId,
    currentRoom,
    logs,
    remoteGestures,
    toggleConnection,
    joinRoom,
    leaveRoom,
    sendGesture,
  } = useSocket();

  // Auto-broadcast recognized gestures to Socket room when active & connected
  useEffect(() => {
    if (
      isConnected &&
      currentRoom &&
      activeGesture &&
      activeGesture.confidence > 0.8 &&
      activeGesture.gesture !== 'No Hands Detected' &&
      activeGesture.gesture !== 'Tracking Hands...'
    ) {
      sendGesture(activeGesture);
    }
  }, [activeGesture, isConnected, currentRoom, sendGesture]);

  const handleToggleCamera = () => {
    if (isProcessing) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  const handleSendTestGesture = () => {
    sendGesture({ gesture: 'Test Signal 👋', confidence: 0.99 });
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Top Navbar Header */}
      <Navbar
        isConnected={isConnected}
        serverUrl={serverUrl}
        socketId={socketId}
        isProcessing={isProcessing}
        fps={fps}
        onToggleCamera={handleToggleCamera}
        onToggleSocket={toggleConnection}
      />

      {/* Main Workspace Body */}
      <main className="flex-1 p-6 flex flex-col space-y-4 overflow-hidden max-w-7xl mx-auto w-full">
        {/* Top Split Layout: Vision Video Feed vs Socket Controls */}
        <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden">
          <VisionCamera
            videoRef={videoRef}
            canvasRef={canvasRef}
            isProcessing={isProcessing}
            activeGesture={activeGesture}
            fps={fps}
            detectedCount={detectedCount}
            handSide={handSide}
            onStart={startCamera}
          />

          <SocketControls
            serverUrl={serverUrl}
            setServerUrl={setServerUrl}
            isConnected={isConnected}
            socketId={socketId}
            currentRoom={currentRoom}
            logs={logs}
            onToggleConnection={toggleConnection}
            onJoinRoom={joinRoom}
            onLeaveRoom={leaveRoom}
            onSendTestGesture={handleSendTestGesture}
          />
        </div>

        {/* Bottom Real-Time Gesture Recognition Log */}
        <GestureLog activeGesture={activeGesture} remoteGestures={remoteGestures} />
      </main>
    </div>
  );
}
