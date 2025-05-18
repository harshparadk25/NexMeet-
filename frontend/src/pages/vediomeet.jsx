import React, { useEffect, useRef, useState, useCallback } from 'react';
import io from "socket.io-client";
import { Badge, IconButton, TextField } from '@mui/material';
import { Button } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import styles from "../styles/videoComponent.module.css";
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import ChatIcon from '@mui/icons-material/Chat';
import server from '../environment';

const server_url = server;

const peerConfigConnections = {
    "iceServers": [
        { "urls": "stun:stun.l.google.com:19302" }
    ]
};

export default function VideoMeetComponent() {
    // Refs
    const localVideoref = useRef(null);
    const socketRef = useRef(null);
    const socketIdRef = useRef(null);
    const connectionsRef = useRef({});

    // State
    const [videoAvailable, setVideoAvailable] = useState(false);
    const [audioAvailable, setAudioAvailable] = useState(false);
    const [screenAvailable, setScreenAvailable] = useState(false);
    const [videoEnabled, setVideoEnabled] = useState(false);
    const [audioEnabled, setAudioEnabled] = useState(false);
    const [screenSharing, setScreenSharing] = useState(false);
    const [showChat, setShowChat] = useState(false);
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState("");
    const [newMessages, setNewMessages] = useState(0);
    const [askForUsername, setAskForUsername] = useState(true);
    const [username, setUsername] = useState("");
    const [remoteStreams, setRemoteStreams] = useState([]);
    const [isConnected, setIsConnected] = useState(false);

    // Media handling functions
    const handleMediaStream = useCallback((stream) => {
        window.localStream = stream;
        if (localVideoref.current) {
            localVideoref.current.srcObject = stream;
        }

        // Update all peer connections
        updatePeerConnections(stream);
    }, []);

    const updatePeerConnections = useCallback((stream) => {
        const currentConnections = connectionsRef.current;
        Object.entries(currentConnections).forEach(([id, peerConnection]) => {
            if (id === socketIdRef.current) return;

            try {
                // Remove old tracks
                const senders = peerConnection.getSenders();
                senders.forEach(sender => peerConnection.removeTrack(sender));

                // Add new tracks
                stream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, stream);
                });

                // Re-negotiate connection
                peerConnection.createOffer()
                    .then(offer => peerConnection.setLocalDescription(offer))
                    .then(() => {
                        socketRef.current?.emit('signal', id, JSON.stringify({ 'sdp': peerConnection.localDescription }));
                    })
                    .catch(error => console.error('Error renegotiating connection:', error));
            } catch (error) {
                console.error('Error updating peer connection:', error);
            }
        });
    }, []);

    // Initialize media and permissions
    useEffect(() => {
        const getMediaPermissions = async () => {
            try {
                // Check video permission
                try {
                    const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                    videoStream.getTracks().forEach(track => track.stop());
                    setVideoAvailable(true);
                } catch (error) {
                    setVideoAvailable(false);
                }

                // Check audio permission
                try {
                    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    audioStream.getTracks().forEach(track => track.stop());
                    setAudioAvailable(true);
                } catch (error) {
                    setAudioAvailable(false);
                }

                // Check screen sharing availability
                setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);
            } catch (error) {
                console.error('Error checking media permissions:', error);
            }
        };

        getMediaPermissions();

        // Store ref values in variables for cleanup
        const socket = socketRef.current;
        const connections = connectionsRef.current;
        const localVideo = localVideoref.current;

        return () => {
            // Cleanup on unmount
            if (socket) {
                socket.disconnect();
            }
            Object.values(connections).forEach(conn => conn.close());
            if (localVideo?.srcObject) {
                localVideo.srcObject.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    // Handle media stream changes
    useEffect(() => {
        if (isConnected) {
            const getMedia = async () => {
                try {
                    // Stop any existing tracks
                    const localVideo = localVideoref.current;
                    if (localVideo?.srcObject) {
                        localVideo.srcObject.getTracks().forEach(track => track.stop());
                    }

                    // Get new media stream
                    const constraints = {
                        video: videoEnabled && videoAvailable,
                        audio: audioEnabled && audioAvailable
                    };

                    if (constraints.video || constraints.audio) {
                        const stream = await navigator.mediaDevices.getUserMedia(constraints);
                        handleMediaStream(stream);
                    } else {
                        // Create black/silence stream when both are disabled
                        const canvas = document.createElement("canvas");
                        canvas.width = 640;
                        canvas.height = 480;
                        canvas.getContext('2d').fillRect(0, 0, canvas.width, canvas.height);
                        const videoTrack = canvas.captureStream().getVideoTracks()[0];
                        videoTrack.enabled = false;
                        
                        const ctx = new AudioContext();
                        const oscillator = ctx.createOscillator();
                        const dst = oscillator.connect(ctx.createMediaStreamDestination());
                        oscillator.start();
                        const audioTrack = dst.stream.getAudioTracks()[0];
                        audioTrack.enabled = false;
                        
                        const blackSilenceStream = new MediaStream([videoTrack, audioTrack]);
                        handleMediaStream(blackSilenceStream);
                    }
                } catch (error) {
                    console.error('Error getting user media:', error);
                }
            };

            getMedia();
        }
    }, [videoEnabled, audioEnabled, isConnected, videoAvailable, audioAvailable, handleMediaStream]);

    // Handle screen sharing
    const handleScreenSharing = async () => {
        if (screenSharing) {
            stopScreenSharing();
        } else {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                setScreenSharing(true);
                window.localStream = stream;
                if (localVideoref.current) {
                    localVideoref.current.srcObject = stream;
                }
                updatePeerConnections(stream);

                // Handle when screen sharing is stopped
                stream.getVideoTracks()[0].onended = () => {
                    stopScreenSharing();
                };
            } catch (error) {
                console.error('Error starting screen sharing:', error);
                setScreenSharing(false);
            }
        }
    };

    const stopScreenSharing = useCallback(() => {
        setScreenSharing(false);
        setVideoEnabled(true);
        setAudioEnabled(true);
    }, []);

    // Connect to the server and initialize call
    const startCall = async () => {
        if (!username.trim()) return;

        try {
            // Initialize socket connection
            socketRef.current = io.connect(server_url, { secure: false });
            setIsConnected(true);

            // Set up socket event handlers
            const handleSignal = (fromId, message) => {
                if (fromId === socketIdRef.current) return;

                const signal = JSON.parse(message);
                const peerConnection = connectionsRef.current[fromId];

                if (!peerConnection) return;

                if (signal.sdp) {
                    peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp))
                        .then(() => {
                            if (signal.sdp.type === 'offer') {
                                return peerConnection.createAnswer();
                            }
                        })
                        .then(answer => {
                            if (answer) {
                                return peerConnection.setLocalDescription(answer);
                            }
                        })
                        .then(() => {
                            if (signal.sdp.type === 'offer') {
                                socketRef.current?.emit('signal', fromId, JSON.stringify({ 'sdp': peerConnection.localDescription }));
                            }
                        })
                        .catch(error => console.error('Error handling SDP:', error));
                }

                if (signal.ice) {
                    peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice))
                        .catch(error => console.error('Error adding ICE candidate:', error));
                }
            };

            const handleSocketConnect = () => {
                socketIdRef.current = socketRef.current?.id;
                socketRef.current?.emit('join-call', window.location.href);
            };

            const handleChatMessage = (data, sender, socketIdSender) => {
                setMessages(prev => [...prev, { sender, data }]);
                if (socketIdSender !== socketIdRef.current && !showChat) {
                    setNewMessages(prev => prev + 1);
                }
            };

            const handleUserLeft = (id) => {
                if (connectionsRef.current[id]) {
                    connectionsRef.current[id].close();
                    delete connectionsRef.current[id];
                }
                setRemoteStreams(prev => prev.filter(stream => stream.socketId !== id));
            };

            const handleUserJoined = (id, clients) => {
                clients.forEach(socketId => {
                    if (!connectionsRef.current[socketId] && socketId !== socketIdRef.current) {
                        const peerConnection = new RTCPeerConnection(peerConfigConnections);
                        connectionsRef.current[socketId] = peerConnection;

                        peerConnection.onicecandidate = (event) => {
                            if (event.candidate) {
                                socketRef.current?.emit('signal', socketId, JSON.stringify({ 'ice': event.candidate }));
                            }
                        };

                        peerConnection.ontrack = (event) => {
                            setRemoteStreams(prev => {
                                const existingIndex = prev.findIndex(s => s.socketId === socketId);
                                if (existingIndex >= 0) {
                                    const updated = [...prev];
                                    updated[existingIndex] = { ...updated[existingIndex], stream: event.streams[0] };
                                    return updated;
                                }
                                return [...prev, { socketId, stream: event.streams[0] }];
                            });
                        };

                        // Add local stream if available
                        if (window.localStream) {
                            window.localStream.getTracks().forEach(track => {
                                peerConnection.addTrack(track, window.localStream);
                            });
                        }

                        // Create offer for new connection
                        if (id === socketIdRef.current) {
                            peerConnection.createOffer()
                                .then(offer => peerConnection.setLocalDescription(offer))
                                .then(() => {
                                    socketRef.current?.emit('signal', socketId, JSON.stringify({ 'sdp': peerConnection.localDescription }));
                                })
                                .catch(error => console.error('Error creating offer:', error));
                        }
                    }
                });
            };

            socketRef.current.on('signal', handleSignal);
            socketRef.current.on('connect', handleSocketConnect);
            socketRef.current.on('chat-message', handleChatMessage);
            socketRef.current.on('user-left', handleUserLeft);
            socketRef.current.on('user-joined', handleUserJoined);

            // Enable media by default
            setVideoEnabled(true);
            setAudioEnabled(true);
            setAskForUsername(false);
        } catch (error) {
            console.error('Error starting call:', error);
        }
    };

    const sendMessage = () => {
        if (message.trim() && socketRef.current) {
            socketRef.current.emit('chat-message', message.trim(), username);
            setMessage("");
        }
    };

    const handleEndCall = () => {
        if (socketRef.current) {
            socketRef.current.disconnect();
        }
        Object.values(connectionsRef.current).forEach(conn => conn.close());
        if (localVideoref.current?.srcObject) {
            localVideoref.current.srcObject.getTracks().forEach(track => track.stop());
        }
        window.location.href = "/";
    };

    return (
        <div className={styles.container}>
            {askForUsername ? (
                <div className={styles.lobbyContainer}>
                    <h2>Enter into Lobby</h2>
                    <TextField
                        label="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        variant="outlined"
                        fullWidth
                        margin="normal"
                    />
                    <Button
                        variant="contained"
                        onClick={startCall}
                        disabled={!username.trim()}
                    >
                        Join Meeting
                    </Button>

                    <div className={styles.previewVideo}>
                        <video ref={localVideoref} autoPlay muted playsInline></video>
                    </div>
                </div>
            ) : (
                <div className={styles.meetVideoContainer}>
                    {/* Chat Modal */}
                    {showChat && (
                        <div className={styles.chatRoom}>
                            <div className={styles.chatContainer}>
                                <h1>Chat</h1>
                                <div className={styles.chattingDisplay}>
                                    {messages.length > 0 ? (
                                        messages.map((item, index) => (
                                            <div key={index} className={styles.message}>
                                                <p className={styles.sender}>{item.sender}</p>
                                                <p className={styles.messageContent}>{item.data}</p>
                                            </div>
                                        ))
                                    ) : (
                                        <p className={styles.noMessages}>No messages yet</p>
                                    )}
                                </div>
                                <div className={styles.chattingArea}>
                                    <TextField
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        label="Enter your message"
                                        variant="outlined"
                                        fullWidth
                                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                    />
                                    <Button
                                        variant="contained"
                                        onClick={sendMessage}
                                        disabled={!message.trim()}
                                    >
                                        Send
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Remote Videos */}
                    <div className={styles.conferenceView}>
                        {remoteStreams.map(({ socketId, stream }) => (
                            <div key={socketId} className={styles.remoteVideoContainer}>
                                <video
                                    ref={el => el && (el.srcObject = stream)}
                                    autoPlay
                                    playsInline
                                    className={styles.remoteVideo}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Local Video */}
                    <video
                        className={styles.localVideo}
                        ref={localVideoref}
                        autoPlay
                        muted
                        playsInline
                    ></video>

                    {/* Control Buttons */}
                    <div className={styles.buttonContainers}>
                        <IconButton
                            onClick={() => setVideoEnabled(!videoEnabled)}
                            style={{ color: "white" }}
                            disabled={!videoAvailable}
                        >
                            {videoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>
                        <IconButton
                            onClick={handleEndCall}
                            style={{ color: "white", backgroundColor: "red" }}
                        >
                            <CallEndIcon />
                        </IconButton>
                        <IconButton
                            onClick={() => setAudioEnabled(!audioEnabled)}
                            style={{ color: "white" }}
                            disabled={!audioAvailable}
                        >
                            {audioEnabled ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>
                        {screenAvailable && (
                            <IconButton
                                onClick={handleScreenSharing}
                                style={{ color: "white" }}
                            >
                                {screenSharing ? <ScreenShareIcon /> : <StopScreenShareIcon />}
                            </IconButton>
                        )}
                        <Badge badgeContent={newMessages} color="error">
                            <IconButton
                                onClick={() => setShowChat(!showChat)}
                                style={{ color: "white" }}
                            >
                                <ChatIcon />
                            </IconButton>
                        </Badge>
                    </div>
                </div>
            )}
        </div>
    );
}