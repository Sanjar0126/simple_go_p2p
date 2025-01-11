let ws;
let peerConnection;
let dataChannel;
let peerId = Math.random().toString(36).substr(2, 9);
let currentRoom;
let file;
let receivedSize = 0;
let receivedData = [];
let isAudioFile = false;

let audioContext;
const BUFFER_SIZE = 128 * 1024; // 128KB chunks

let localStream;

let peerConnections = {};
let remoteStreams = {};
let peers = new Set();

let peerName = '';
const peerNames = new Map();

function updateParticipantsList() {
    const participantsList = document.getElementById('participantsList');
    participantsList.innerHTML = '';
    
    const title = document.createElement('h3');
    title.textContent = `Participants (${peers.size})`;
    participantsList.appendChild(title);
    
    const list = document.createElement('ul');
    
    list.appendChild(createParticipantItem(peerId, true));
    
    peers.forEach(peer => {
        if (peer !== peerId) {
            list.appendChild(createParticipantItem(peer));
        }
    });
    
    participantsList.appendChild(list);
}

function createParticipantItem(text) {
    const li = document.createElement('li');
    const displayName = isCurrentUser ? 
        (peerName || peerId + ' (You)') : 
        (peerNames.get(peerId) || peerId);
    li.textContent = isCurrentUser ? displayName + ' (You)' : displayName;
    return li;
}

async function joinRoom() {
    const roomId = document.getElementById('roomId').value;
    const inputName = document.getElementById('peerName').value;
    if (!roomId) return;
    
    peerName = inputName || peerId;
    currentRoom = roomId;
    ws = new WebSocket(`wss://${window.location.host}/ws`);
    
    ws.onopen = () => {
        ws.send(JSON.stringify({
            event: 'join',
            data: { 
                peerId,
                peerName 
            },
            room: roomId
        }));
        updateStatus('Joined room: ' + roomId);
        
        peers.add(peerId);
        updateParticipantsList();
    };

    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.event) {
            case 'peers-in-room':
                const existingPeers = message.data.peers;
                peers.clear();
                for (const peer of existingPeers) {
                    if (peer.id !== peerId) {
                        peers.add(peer.id);
                        peerNames.set(peer.id, peer.name); 
                        await createPeerConnection(peer.id);
                        createOffer(peer.id);
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
