async function startCall() {
    try {
        // Get user media with specific constraints
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // Create peer connection if it doesn't exist
        if (!peerConnection) {
            createPeerConnection();
        }

        // Add tracks to the peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Create and send offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        ws.send(JSON.stringify({
            event: 'offer',
            data: {
                offer,
                target: remotePeerId,
                peerId: peerId,
                type: 'audio-call'
            },
            room: currentRoom
        }));

        updateStatus('Calling peer...');
        
    } catch (error) {
        console.error('Error starting call:', error);
        updateStatus('Failed to start call: ' + error.message);
    }
}

function endCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    if (remoteAudio) {
        remoteAudio.srcObject = null;
        remoteAudio = null;
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    updateStatus('Call ended');
    createPeerConnection(); // Create new connection for future calls
}
