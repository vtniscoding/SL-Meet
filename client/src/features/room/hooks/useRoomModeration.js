import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@sl-meet/shared';
import { ROLES } from '@sl-meet/shared/constants';

/**
 * Custom Hook: useRoomModeration
 * 
 * Encapsulates room-level confirmation dialogs, host teardown synchronization,
 * remote moderation event listeners (mute, kick, end room), and Supabase realtime room status tracking.
 */
export function useRoomModeration({
  roomId,
  isHost,
  socketId,
  hostId,
  endRoom,
  handleLeave,
  muteMic,
  userRole,
  isHandTrackingEnabled,
  setIsHandTrackingEnabled,
  activeSignerId,
  setActiveSignerId,
}) {
  const [confirmModalConfig, setConfirmModalConfig] = useState({
    isOpen: false,
    title: '',
    description: '',
    infoPill: '',
    actions: [],
  });

  const handleLeaveRef = useRef(handleLeave);
  useEffect(() => {
    handleLeaveRef.current = handleLeave;
  }, [handleLeave]);

  const muteMicRef = useRef(muteMic);
  useEffect(() => {
    muteMicRef.current = muteMic;
  }, [muteMic]);

  const roomControlChannelRef = useRef(null);

  const closeConfirmModal = useCallback(() => {
    setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Listen for host remote moderation events (remote mute request / kicked / room ended)
  useEffect(() => {
    const handleRemoteMute = () => {
      if (muteMicRef.current) {
        muteMicRef.current();
      }
    };
    const handleRemoteLeave = () => {
      if (handleLeaveRef.current) {
        handleLeaveRef.current();
      }
    };

    window.addEventListener('sl_meet_mute_local_mic', handleRemoteMute);
    window.addEventListener('sl_meet_kicked_from_room', handleRemoteLeave);
    window.addEventListener('sl_meet_room_ended', handleRemoteLeave);

    return () => {
      window.removeEventListener('sl_meet_mute_local_mic', handleRemoteMute);
      window.removeEventListener('sl_meet_kicked_from_room', handleRemoteLeave);
      window.removeEventListener('sl_meet_room_ended', handleRemoteLeave);
    };
  }, []);

  // Subscribe to Supabase Realtime room control channel & room status changes for instant multi-device room termination
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`sl-meet-room-control-${roomId}`)
      .on('broadcast', { event: 'room_ended' }, () => {
        if (handleLeaveRef.current) {
          handleLeaveRef.current();
        }
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload?.new?.status === 'ended' && handleLeaveRef.current) {
            handleLeaveRef.current();
          }
        }
      )
      .subscribe();

    roomControlChannelRef.current = channel;

    return () => {
      roomControlChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // Host Action: Terminate room for everyone across all devices
  const handleEndRoomForEveryone = useCallback(async () => {
    if (endRoom) {
      endRoom(roomId);
    }
    try {
      if (roomControlChannelRef.current) {
        roomControlChannelRef.current.send({
          type: 'broadcast',
          event: 'room_ended',
          payload: { roomId },
        });
      }
    } catch {}
    try {
      if (roomId) {
        localStorage.setItem(`sl_meet_ended_room_${roomId}`, Date.now().toString());
        localStorage.removeItem(`sl_meet_chat_${roomId}`);
      }
    } catch {}
    try {
      if (roomId) {
        supabase
          .from('rooms')
          .update({ status: 'ended' })
          .eq('id', roomId)
          .then(() => {})
          .catch((err) => console.warn('Could not update room status in Supabase:', err));
      }
    } catch (err) {
      console.warn('Could not update room status in Supabase:', err);
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (handleLeaveRef.current) {
      handleLeaveRef.current();
    }
  }, [endRoom, roomId]);

  // Trigger leave confirmation modal based on user role (Host vs Participant)
  const handleRequestLeave = useCallback(() => {
    const isUserHost = Boolean(isHost || (socketId && hostId && socketId === hostId));
    if (isUserHost) {
      setConfirmModalConfig({
        isOpen: true,
        title: 'Leave meeting or end for all?',
        description:
          'As the meeting host, you can leave the call or end the meeting for everyone in the room.',
        infoPill:
          'Ending the call will disconnect everyone and archive this room session.',
        actions: [
          {
            label: 'Leave the call',
            variant: 'secondary',
            onClick: () => {
              closeConfirmModal();
              if (handleLeaveRef.current) handleLeaveRef.current();
            },
          },
          {
            label: 'End call for everyone',
            variant: 'danger',
            onClick: () => {
              closeConfirmModal();
              handleEndRoomForEveryone();
            },
          },
        ],
      });
    } else {
      setConfirmModalConfig({
        isOpen: true,
        title: 'Leave the call?',
        description:
          'Are you sure you want to leave this meeting? You can rejoin anytime using the meeting code.',
        infoPill: '',
        actions: [
          {
            label: 'Leave the call',
            variant: 'danger',
            onClick: () => {
              closeConfirmModal();
              if (handleLeaveRef.current) handleLeaveRef.current();
            },
          },
        ],
      });
    }
  }, [isHost, socketId, hostId, closeConfirmModal, handleEndRoomForEveryone]);

  // Trigger AI Vision activation confirmation modal for Signer role
  const handleRequestHandTracking = useCallback(() => {
    if (userRole !== ROLES.SIGNER) return;
    if (isHandTrackingEnabled) {
      setIsHandTrackingEnabled(false);
      if (activeSignerId === 'local') {
        setActiveSignerId(null);
      }
      return;
    }
    setConfirmModalConfig({
      isOpen: true,
      title: 'Turn on AI Vision?',
      description:
        'Camera will track your hand gestures to interpret American Sign Language (ASL) in real time.',
      infoPill:
        'Video frames are processed locally on your device for complete privacy and 60 FPS responsiveness.',
      actions: [
        {
          label: 'Cancel',
          variant: 'secondary',
          onClick: () => {
            closeConfirmModal();
          },
        },
        {
          label: 'Turn on',
          variant: 'brand',
          onClick: () => {
            closeConfirmModal();
            setIsHandTrackingEnabled(true);
          },
        },
      ],
    });
  }, [userRole, isHandTrackingEnabled, setIsHandTrackingEnabled, activeSignerId, setActiveSignerId, closeConfirmModal]);

  return {
    confirmModalConfig,
    closeConfirmModal,
    handleRequestLeave,
    handleEndRoomForEveryone,
    handleRequestHandTracking,
  };
}

