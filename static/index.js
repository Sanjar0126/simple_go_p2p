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
