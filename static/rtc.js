async function createPeerConnection(targetPeerId) {
    if (peerConnections[targetPeerId]) {
        console.log('Peer connection already exists for:', targetPeerId);
        return peerConnections[targetPeerId];
    }

    const peerConnection = new RTCPeerConnection(getRTCConfig());
    peerConnections[targetPeerId] = peerConnection;

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                event: 'ice-candidate',
                data: {
                    candidate: event.candidate,
                    target: targetPeerId,
                    peerId: peerId
                },
                room: currentRoom
            }));
        }
    };

    peerConnection.ontrack = (event) => {
        console.log('Got remote track from:', targetPeerId);
        if (!remoteStreams[targetPeerId]) {
            remoteStreams[targetPeerId] = new MediaStream();
            createAudioElement(targetPeerId);
        }
        event.streams[0].getTracks().forEach(track => {
            remoteStreams[targetPeerId].addTrack(track);
        });
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE Connection State with ${targetPeerId}:`, 
                    peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'disconnected') {
            handlePeerLeft(targetPeerId);
        }
    };

    return peerConnection;
}

async function createOffer(targetPeerId) {
    const peerConnection = await createPeerConnection(targetPeerId);
    
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        ws.send(JSON.stringify({
            event: 'offer',
            data: {
                offer,
                target: targetPeerId,
                peerId: peerId
            },
            room: currentRoom
        }));
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

async function handleOffer(message) {
    const offerPeerId = message.data.peerId;
    
    try {
        const peerConnection = await createPeerConnection(offerPeerId);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data.offer));
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        ws.send(JSON.stringify({
            event: 'answer',
            data: {
                answer,
                target: offerPeerId,
                peerId: peerId
            },
            room: currentRoom
        }));
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

async function handleAnswer(message) {
    const answerPeerId = message.data.peerId;
    const peerConnection = peerConnections[answerPeerId];
    
    if (peerConnection) {
        try {
            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(message.data.answer)
            );
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }
}

async function handleICECandidate(message) {
    const candidatePeerId = message.data.peerId;
    const peerConnection = peerConnections[candidatePeerId];
    
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(
                new RTCIceCandidate(message.data.candidate)
            );
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }
}

function handlePeerLeft(peerId) {
    if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
    }

    if (remoteStreams[peerId]) {
        delete remoteStreams[peerId];
    }

    const participantDiv = document.getElementById(`participant-${peerId}`);
    if (participantDiv) {
        participantDiv.remove();
    }

    peers.delete(peerId);
    peerNames.delete(peerId);
    updateParticipantsList();
    updateStatus(`Peer ${peerNames.get(peerId) || peerId} left the room`);
}
