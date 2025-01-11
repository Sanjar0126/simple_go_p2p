window.addEventListener('beforeunload', () => {
    if (ws && currentRoom) {
        ws.send(JSON.stringify({
            event: 'disconnect',
            data: { peerId },
            room: currentRoom
        }));
    }
    handleDisconnection();
});

function isConnected() {
    return ws && ws.readyState === WebSocket.OPEN;
}

function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    if (connected) {
        statusEl.textContent = '🟢 Connected';
        statusEl.style.backgroundColor = '#4CAF50';
        statusEl.style.color = 'white';
    } else {
        statusEl.textContent = '🔴 Disconnected';
        statusEl.style.backgroundColor = '#f44336';
        statusEl.style.color = 'white';
    }
}

setInterval(() => {
    updateConnectionStatus(isConnected());
}, 1000);

async function connectWebSocket() {
    ws = new WebSocket(`wss://${window.location.host}/ws`);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0;

        if (currentRoom) {
            ws.send(JSON.stringify({
                event: 'join',
                data: { 
                    peerId,
                    peerName 
                },
                room: currentRoom
            }));
            updateStatus('Connected to room: ' + currentRoom);
        }
        
        peers.add(peerId);
        updateParticipantsList();
    };

    ws.onclose = () => {
        if (!intentionalDisconnect && currentRoom) {
            handleReconnection();
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateStatus('Connection error. Attempting to reconnect...');
    };

    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.event) {
            case 'peers-in-room':
                const existingPeers = message.data.peers;
                peers.clear();
                for (const peer of existingPeers) {
                    if (peer.peerId !== peerId) {
                        peers.add(peer.peerId);
                        peerNames.set(peer.peerId, peer.name); 
                        await createPeerConnection(peer.peerId);
                        createOffer(peer.peerId);
                    }
                }
                updateParticipantsList();
                break;

            case 'peer-joined':
                const newPeerId = message.data.peerId;
                const newPeerName = message.data.peerName;
                if (newPeerId !== peerId) {
                    peers.add(newPeerId);
                    peerNames.set(newPeerId, newPeerName);
                    updateParticipantsList();
                }
                break;

            case 'peer-left':
                const leftPeerId = message.data.peerId;
                handlePeerLeft(leftPeerId);
                break;

            case 'offer':
                await handleOffer(message);
                break;

            case 'answer':
                await handleAnswer(message);
                break;

            case 'ice-candidate':
                await handleICECandidate(message);
                break;
        }
    };

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        //local audio preview
        const localAudio = new Audio();
        localAudio.muted = true;
        localAudio.srcObject = localStream;
        localAudio.play();
    } catch (err) {
        console.error('Error accessing microphone:', err);
        updateStatus('Error accessing microphone. Please check permissions.');
    }
}

function handleReconnection() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        updateStatus('Failed to reconnect after multiple attempts. Please try joining the room again.');
        handleDisconnection(); //clean up
        return;
    }

    reconnectAttempts++;
    updateStatus(`Connection lost. Attempting to reconnect... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
    }

    reconnectTimeout = setTimeout(() => {
        if (currentRoom) {
            connectWebSocket();
        }
    }, RECONNECT_DELAY);
}

function handleDisconnection() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    Object.keys(peerConnections).forEach(peerId => {
        if (peerConnections[peerId]) {
            peerConnections[peerId].close();
            delete peerConnections[peerId];
        }
    });

    Object.keys(remoteStreams).forEach(peerId => {
        delete remoteStreams[peerId];
    });

    if (ws) {
        ws.close();
        ws = null;
    }

    peers.clear();
    currentRoom = null;
    reconnectAttempts = 0;
    updateParticipantsList();
    updateStatus('Disconnected from room');
}
