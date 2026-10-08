import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../services/socket';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

/**
 * Custom Hook: Manages WebRTC P2P Peer Connections for both Camera and Screen Share streams.
 */
export function useWebRTC(roomId, localStream, screenStream, presentingUsers = {}) {
  const peerConnections = useRef(new Map());
  const localStreamRef = useRef(localStream);
  const screenStreamRef = useRef(screenStream);
  const presentingUsersRef = useRef(presentingUsers);
  const iceCandidatesQueue = useRef(new Map());
  const [peerStreams, setPeerStreams] = useState({});
  const [peerScreenStreams, setPeerScreenStreams] = useState({});

  useEffect(() => {
    presentingUsersRef.current = presentingUsers;
  }, [presentingUsers]);

  // Synchronize localStreamRef & update active RTCPeerConnection camera senders
  useEffect(() => {
    localStreamRef.current = localStream;
    if (localStream && peerConnections.current.size > 0) {
      peerConnections.current.forEach((pc) => {
        if (pc.connectionState !== 'closed') {
          const senders = pc.getSenders();
          localStream.getTracks().forEach((track) => {
            const sender = senders.find((s) => s.track && s.track.kind === track.kind && s.track.id !== screenStreamRef.current?.getVideoTracks()[0]?.id);
            if (sender) {
              sender.replaceTrack(track).catch((err) => console.warn('replaceTrack failed:', err));
            } else {
              try {
                pc.addTrack(track, localStream);
              } catch (err) {
                console.warn('addTrack camera failed:', err);
              }
            }
          });
        }
      });
    }
  }, [localStream]);

  // Synchronize screenStreamRef & update active RTCPeerConnection screen senders
  useEffect(() => {
    screenStreamRef.current = screenStream;
    if (peerConnections.current.size > 0) {
      peerConnections.current.forEach(async (pc, peerId) => {
        if (pc.connectionState !== 'closed') {
          const senders = pc.getSenders();
          if (screenStream) {
            const screenTrack = screenStream.getVideoTracks()[0];
            if (screenTrack) {
              const existingSender = senders.find((s) => s.track && s.track.id === screenTrack.id);
              if (!existingSender) {
                try {
                  pc.addTrack(screenTrack, screenStream);
                  // Trigger offer renegotiation to notify peer of new screen track
                  const offer = await pc.createOffer();
                  await pc.setLocalDescription(offer);
                  const socket = getSocket();
                  socket.emit('webrtc_offer', { targetId: peerId, offer });
                } catch (err) {
                  console.warn('addTrack screen failed:', err);
                }
              }
            }
          } else {
            // Screen share stopped: remove any non-camera screen senders
            let senderRemoved = false;
            senders.forEach((sender) => {
              const track = sender.track;
              if (
                track &&
                localStreamRef.current &&
                !localStreamRef.current.getTracks().some((t) => t.id === track.id)
              ) {
                try {
                  pc.removeTrack(sender);
                  senderRemoved = true;
                } catch (err) {
                  console.warn('removeTrack screen failed:', err);
                }
              }
            });
            if (senderRemoved) {
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                const socket = getSocket();
                socket.emit('webrtc_offer', { targetId: peerId, offer });
              } catch (err) {
                console.warn('renegotiate offer failed after screen removal:', err);
              }
            }
          }
        }
      });
    }
  }, [screenStream]);

  const peerStreamsRef = useRef({});
  const peerScreenStreamsRef = useRef({});
  const peerCameraStreamIdRef = useRef({});
  const peerScreenStreamIdRef = useRef({});

  // Synchronize stream refs for synchronous lookup in ontrack
  useEffect(() => {
    peerStreamsRef.current = peerStreams;
  }, [peerStreams]);

  useEffect(() => {
    peerScreenStreamsRef.current = peerScreenStreams;
  }, [peerScreenStreams]);

  // Handle remote track reception (separate camera vs screen stream)
  const handleRemoteTrack = useCallback((peerId, event) => {
    const { track, streams } = event;
    const remoteStream = streams && streams[0] ? streams[0] : null;
    const remoteStreamId = remoteStream ? remoteStream.id : null;

    if (track.kind === 'audio') {
      if (remoteStreamId) {
        peerCameraStreamIdRef.current[peerId] = remoteStreamId;
      }
      setPeerStreams((prev) => {
        const currentCamera = prev[peerId] || new MediaStream();
        if (!currentCamera.getAudioTracks().some((t) => t.id === track.id)) {
          currentCamera.addTrack(track);
        }
        const updated = { ...prev, [peerId]: new MediaStream(currentCamera.getTracks()) };
        peerStreamsRef.current = updated;
        return updated;
      });
      return;
    }

    if (track.kind === 'video') {
      const socketKnownScreenStreamId = presentingUsersRef.current[peerId]?.screenStreamId;
      const knownCameraStreamId = peerCameraStreamIdRef.current[peerId];
      const knownScreenStreamId = peerScreenStreamIdRef.current[peerId] || socketKnownScreenStreamId;

      const currentCameraStream = peerStreamsRef.current[peerId];
      const hasCameraVideo = currentCameraStream && currentCameraStream.getVideoTracks().length > 0;
      const isCameraTrack = currentCameraStream && currentCameraStream.getVideoTracks().some((t) => t.id === track.id);

      const isExplicitScreenTrack =
        (track.label &&
          (track.label.toLowerCase().includes('screen') ||
            track.label.toLowerCase().includes('window') ||
            track.label.toLowerCase().includes('display'))) ||
        (track.getSettings && track.getSettings().displaySurface);

      let isScreenShare = false;

      if (isExplicitScreenTrack) {
        isScreenShare = true;
        if (remoteStreamId) peerScreenStreamIdRef.current[peerId] = remoteStreamId;
      } else if (remoteStreamId) {
        if (knownScreenStreamId && remoteStreamId === knownScreenStreamId) {
          isScreenShare = true;
        } else if (knownCameraStreamId && remoteStreamId === knownCameraStreamId) {
          isScreenShare = false;
        } else if (hasCameraVideo && !isCameraTrack) {
          isScreenShare = true;
          peerScreenStreamIdRef.current[peerId] = remoteStreamId;
        } else {
          isScreenShare = false;
          peerCameraStreamIdRef.current[peerId] = remoteStreamId;
        }
      } else {
        isScreenShare = hasCameraVideo && !isCameraTrack;
      }

      if (!isScreenShare) {
        // Camera Stream Video Track
        setPeerStreams((prev) => {
          const current = prev[peerId] || new MediaStream();
          if (!current.getVideoTracks().some((t) => t.id === track.id)) {
            current.addTrack(track);
          }
          const updated = { ...prev, [peerId]: new MediaStream(current.getTracks()) };
          peerStreamsRef.current = updated;
          return updated;
        });
      } else {
        // Secondary / Presentation Video Track -> Screen Share Stream!
        setPeerScreenStreams((prev) => {
          const currentScreen = prev[peerId] || new MediaStream();
          if (!currentScreen.getVideoTracks().some((t) => t.id === track.id)) {
            currentScreen.addTrack(track);
          }
          const updated = { ...prev, [peerId]: new MediaStream(currentScreen.getTracks()) };
          peerScreenStreamsRef.current = updated;
          return updated;
        });
      }
    }
  }, []);

  const closePeerConnection = useCallback((peerId) => {
    if (peerConnections.current.has(peerId)) {
      const pc = peerConnections.current.get(peerId);
      pc.close();
      peerConnections.current.delete(peerId);
    }
    iceCandidatesQueue.current.delete(peerId);
    setPeerStreams((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    setPeerScreenStreams((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const createPeerConnection = useCallback(
    (peerId, socket) => {
      if (peerConnections.current.has(peerId)) {
        const existingPc = peerConnections.current.get(peerId);
        if (existingPc.connectionState !== 'closed') {
          return existingPc;
        }
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnections.current.set(peerId, pc);

      // Add local camera tracks to peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          try {
            pc.addTrack(track, localStreamRef.current);
          } catch (err) {
            console.warn('Error adding initial camera track to pc:', err);
          }
        });
      }

      // Add local screen tracks if active
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => {
          try {
            pc.addTrack(track, screenStreamRef.current);
          } catch (err) {
            console.warn('Error adding initial screen track to pc:', err);
          }
        });
      }

      // Handle ICE Candidate generation
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc_candidate', {
            targetId: peerId,
            candidate: event.candidate,
          });
        }
      };

      pc.ontrack = (event) => {
        handleRemoteTrack(peerId, event);
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === 'disconnected' ||
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed'
        ) {
          closePeerConnection(peerId);
        }
      };

      return pc;
    },
    [closePeerConnection, handleRemoteTrack]
  );

  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();

    const processQueuedIceCandidates = async (peerId, pc) => {
      const queued = iceCandidatesQueue.current.get(peerId);
      if (queued && queued.length > 0) {
        for (const candidate of queued) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.warn('Error adding queued ICE candidate:', err);
          }
        }
        iceCandidatesQueue.current.delete(peerId);
      }
    };

    const onRoomUsers = async ({ participants }) => {
      if (!participants) return;
      for (const p of participants) {
        if (p.userId && p.userId !== socket.id) {
          const pc = createPeerConnection(p.userId, socket);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('webrtc_offer', { targetId: p.userId, offer });
          } catch (err) {
            console.error('Error creating WebRTC offer for user:', p.userId, err);
          }
        }
      }
    };

    const onUserJoined = ({ userId }) => {
      if (!userId || userId === socket.id) return;
      createPeerConnection(userId, socket);
    };

    const onWebRtcOffer = async ({ senderId, offer }) => {
      const pc = createPeerConnection(senderId, socket);
      try {
        if (pc.signalingState !== 'stable') {
          await Promise.all([
            pc.setLocalDescription({ type: 'rollback' }),
            pc.setRemoteDescription(new RTCSessionDescription(offer)),
          ]);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
        }
        await processQueuedIceCandidates(senderId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc_answer', { targetId: senderId, answer });
      } catch (err) {
        console.error('Error handling WebRTC offer:', err);
      }
    };

    const onWebRtcAnswer = async ({ senderId, answer }) => {
      if (peerConnections.current.has(senderId)) {
        const pc = peerConnections.current.get(senderId);
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await processQueuedIceCandidates(senderId, pc);
        } catch (err) {
          console.error('Error setting WebRTC answer:', err);
        }
      }
    };

    const onWebRtcCandidate = async ({ senderId, candidate }) => {
      const pc = peerConnections.current.has(senderId) ? peerConnections.current.get(senderId) : null;
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('Error adding ICE candidate:', err);
        }
      } else {
        if (!iceCandidatesQueue.current.has(senderId)) {
          iceCandidatesQueue.current.set(senderId, []);
        }
        iceCandidatesQueue.current.get(senderId).push(candidate);
      }
    };

    const onUserLeft = ({ userId }) => {
      closePeerConnection(userId);
    };

    socket.on('room_users', onRoomUsers);
    socket.on('user_joined', onUserJoined);
    socket.on('webrtc_offer', onWebRtcOffer);
    socket.on('webrtc_answer', onWebRtcAnswer);
    socket.on('webrtc_candidate', onWebRtcCandidate);
    socket.on('user_left', onUserLeft);

    return () => {
      socket.off('room_users', onRoomUsers);
      socket.off('user_joined', onUserJoined);
      socket.off('webrtc_offer', onWebRtcOffer);
      socket.off('webrtc_answer', onWebRtcAnswer);
      socket.off('webrtc_candidate', onWebRtcCandidate);
      socket.off('user_left', onUserLeft);

      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
      iceCandidatesQueue.current.clear();
      setPeerStreams({});
      setPeerScreenStreams({});
    };
  }, [roomId, createPeerConnection, closePeerConnection]);

  return {
    peerStreams,
    peerScreenStreams,
  };
}


