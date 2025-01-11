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

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000; // ms
let reconnectTimeout;
let intentionalDisconnect = false;

function updateParticipantsList() {
    const participantsList = document.getElementById('participantsList');
    participantsList.innerHTML = '';
    
    const title = document.createElement('h3');
    title.textContent = `Participants (${peers.size + 1})`;
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

function createParticipantItem(peerId, isCurrentUser = false) {
    const li = document.createElement('li');
    const displayName = isCurrentUser ? 
        (peerName || peerId + ' (You)') : 
        (peerNames.get(peerId) || peerId);
    li.textContent = isCurrentUser ? displayName + ' (You)' : displayName;
    return li;
}


