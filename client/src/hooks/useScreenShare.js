import { useState, useCallback } from 'react';

/**
 * Custom Hook: Manages Screen Sharing via navigator.mediaDevices.getDisplayMedia
 */
export function useScreenShare(onStopCallback) {
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);

  const stopScreenShare = useCallback(
    (streamToStop) => {
      const targetStream = streamToStop || screenStream;
      if (targetStream) {
        targetStream.getTracks().forEach((track) => track.stop());
      }
      setScreenStream(null);
      setIsScreenSharing(false);
      if (onStopCallback) {
        onStopCallback();
      }
    },
    [screenStream, onStopCallback]
  );

  const startScreenShare = useCallback(async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const videoTrack = displayStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenShare(displayStream);
        };
      }

      setScreenStream(displayStream);
      setIsScreenSharing(true);
      return displayStream;
    } catch (err) {
      console.warn('Screen sharing canceled or failed:', err);
      setIsScreenSharing(false);
      setScreenStream(null);
      return null;
    }
  }, [stopScreenShare]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      await startScreenShare();
    }
  }, [isScreenSharing, startScreenShare, stopScreenShare]);

  return {
    isScreenSharing,
    screenStream,
    startScreenShare,
    stopScreenShare,
    toggleScreenShare,
  };
}
