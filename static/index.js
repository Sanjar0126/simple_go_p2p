let ws;
let peerConnection;
let dataChannel;
let peerId = Math.random().toString(36).substr(2, 9);
let currentRoom;
let file;
let receivedSize = 0;
let receivedData = [];
let remotePeerId = null;
let isAudioFile = false;

let audioContext;
const BUFFER_SIZE = 128 * 1024; // 128KB chunks

let localStream;
let remoteStream;
let remoteAudio;
let isCallActive = false;

let peerConnections = {};
let remoteStreams = {};
let peers = new Set();

const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
            urls: "stun:stun.relay.metered.ca:80",
        },
        {
            urls: "turn:global.relay.metered.ca:80",
            username: getTurnUsername(),
            credential: getTurnPasswordd()
        },
        {
            urls: "turn:global.relay.metered.ca:80?transport=tcp",
            username: getTurnUsername(),
            credential: getTurnPasswordd()
        },
        {
            urls: "turn:global.relay.metered.ca:443",
            username: getTurnUsername(),
            credential: getTurnPasswordd()
        },
        {
            urls: "turns:global.relay.metered.ca:443?transport=tcp",
            username: getTurnUsername(),
            credential: getTurnPasswordd()
        },
    ]
}

function isAudioMimeType(mimeType) {
    return mimeType && mimeType.startsWith('audio/');
}

async function setupAudioPlayback(mimeType) {
    const audioPlayer = document.getElementById('audioPlayer');
    audioPlayer.style.display = 'block';
    
    try {
        // Initialize AudioContext
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        return true;
    } catch (e) {
        console.error('Error setting up audio context:', e);
        return false;
    }
}

async function playAudioFromBuffer(arrayBuffer) {
    try {
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start(0);
    } catch (e) {
        console.error('Error playing audio:', e);
    }
}

async function joinRoom() {
    const roomId = document.getElementById('roomId').value;
    if (!roomId) return;
    
    currentRoom = roomId;
    ws = new WebSocket(`wss://${window.location.host}/ws`);
    
    ws.onopen = () => {
        ws.send(JSON.stringify({
            event: 'join',
            data: { peerId },
            room: roomId
        }));
        updateStatus('Joined room: ' + roomId);
    };

    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.event) {
            case 'peers-in-room':
                const existingPeers = message.data.peers;
                for (const existingPeer of existingPeers) {
                    if (existingPeer !== peerId) {
                        await createPeerConnection(existingPeer);
                        createOffer(existingPeer);
                    }
                }
                break;

            case 'peer-joined':
                const newPeerId = message.data.peerId;
                if (newPeerId !== peerId) {
                    peers.add(newPeerId);
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

    ws.onclose = () => {
        handleDisconnection();
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

async function initiatePeerConnection() {
    createPeerConnection();
    createDataChannel();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({
        event: 'offer',
        data: {
            offer,
            target: remotePeerId,
            peerId: peerId
        },
        room: currentRoom
    }));
}

async function createPeerConnection(targetPeerId) {
    if (peerConnections[targetPeerId]) {
        console.log('Peer connection already exists for:', targetPeerId);
        return peerConnections[targetPeerId];
    }

    const peerConnection = new RTCPeerConnection(config);
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


function createAudioElement(peerId) {
    const audioElement = new Audio();
    audioElement.id = `audio-${peerId}`;
    audioElement.autoplay = true;
    audioElement.controls = true;
    audioElement.srcObject = remoteStreams[peerId];
    
    const participantDiv = document.createElement('div');
    participantDiv.id = `participant-${peerId}`;
    participantDiv.className = 'participant';
    
    const label = document.createElement('div');
    label.textContent = `Participant ${peerId}`;
    
    participantDiv.appendChild(label);
    participantDiv.appendChild(audioElement);

    audioElement.play().catch(error => {
        console.log('Autoplay prevented. Click to enable audio.');
        document.addEventListener('click', () => {
            audioElement.play();
        }, { once: true });
    });
}

function createDataChannel() {
    dataChannel = peerConnection.createDataChannel('fileTransfer', {
        ordered: true
    });
    setupDataChannel(dataChannel);
}

function setupDataChannel(channel) {
    channel.binaryType = 'arraybuffer';
    
    channel.onopen = () => {
        updateStatus('Connection established - ready to transfer files');
    };

    channel.onclose = () => {
        updateStatus('Connection closed');
    };

    channel.onmessage = async (event) => {
        if (typeof event.data === 'string') {
            try {
                const metadata = JSON.parse(event.data);
                file = metadata;
                isAudioFile = isAudioMimeType(metadata.mimeType);
                
                if (isAudioFile) {
                    document.getElementById('audioControls').style.display = 'block';
                    await setupAudioPlayback(metadata.mimeType);
                }
                
                updateStatus(`Receiving ${metadata.fileName} (${metadata.fileSize} bytes)`);
                receivedSize = 0;
                receivedData = [];
                document.getElementById('progress').style.display = 'block';
            } catch (e) {
                console.error('Error processing metadata:', e);
            }
        } else {
            try {
                receivedData.push(event.data);
                receivedSize += event.data.byteLength;
                
                if (file && file.fileSize) {  // Check if file metadata exists
                    const progress = document.getElementById('progress');
                    progress.value = (receivedSize / file.fileSize) * 100;

                    if (receivedSize === file.fileSize) {
                        const blob = new Blob(receivedData);
                        
                        if (isAudioFile) {
                            const arrayBuffer = await blob.arrayBuffer();
                            await playAudioFromBuffer(arrayBuffer);
                        } else {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = file.fileName;
                            a.click();
                            URL.revokeObjectURL(url);
                        }
                        
                        updateStatus('File transfer completed');
                        progress.style.display = 'none';
                        receivedData = [];
                        receivedSize = 0;
                    }
                }
            } catch (e) {
                console.error('Error processing file chunk:', e);
            }
        }
    };
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
    updateParticipantsList();
    updateStatus(`Peer ${peerId} left the room`);
}

function handleDisconnection() {
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
    updateParticipantsList();
    updateStatus('Disconnected from room');
}

function updateParticipantsList() {
    const participantsList = document.getElementById('participantsList');
    participantsList.innerHTML = '';
    
    const title = document.createElement('h3');
    title.textContent = `Participants (${peers.size + 1})`;
    participantsList.appendChild(title);
    
    const list = document.createElement('ul');
    list.appendChild(createParticipantItem(peerId + ' (You)'));
    peers.forEach(peer => {
        list.appendChild(createParticipantItem(peer));
    });
    
    participantsList.appendChild(list);
}

function createParticipantItem(text) {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
}

function leaveRoom() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    Object.keys(peerConnections).forEach(peerId => {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
    });

    remoteStreams = {};

    if (ws) {
        ws.close();
    }

    peers.clear();
    updateParticipantsList();
    updateStatus('Left the room');

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            event: 'disconnect',
            data: { peerId },
            room: currentRoom
        }));
    }

    handleDisconnection();
}

document.getElementById('fileInput').addEventListener('change', (event) => {
    file = event.target.files[0];
    if (file) {
        updateStatus(`Selected file: ${file.name}`);
    }
});

async function sendFile() {
    if (!file || !dataChannel) return;
    if (dataChannel.readyState !== 'open') {
        updateStatus('Connection not ready. Please wait...');
        return;
    }

    const metadata = {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream'
    };
    dataChannel.send(JSON.stringify(metadata));
    
    const chunkSize = 16384;
    const fileReader = new FileReader();
    let offset = 0;
    
    fileReader.addEventListener('load', (event) => {
        dataChannel.send(event.target.result);
        offset += event.target.result.byteLength;
        
        const progress = document.getElementById('progress');
        progress.style.display = 'block';
        progress.value = (offset / file.size) * 100;
        
        if (offset < file.size) {
            readSlice(offset);
        } else {
            updateStatus('File sent successfully');
            progress.style.display = 'none';
        }
    });
    
    const readSlice = (o) => {
        const slice = file.slice(o, o + chunkSize);
        fileReader.readAsArrayBuffer(slice);
    };
    
    readSlice(0);
}

function updateStatus(message) {
    const status = document.getElementById('status');
    status.textContent = message;
    console.log(message);
}

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