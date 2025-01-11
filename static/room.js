function generateRoomId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

function createRoom() {
    const roomId = generateRoomId();
    const roomLink = `${window.location.origin}?room=${roomId}`;
    
    document.getElementById('linkContainer').style.display = 'block';
    document.getElementById('roomLink').value = roomLink;
    document.getElementById('create-room-button').style.display = 'none';
    
    joinRoom(roomId);
}

function copyRoomLink() {
    const roomLink = document.getElementById('roomLink');
    roomLink.select();
    document.execCommand('copy');
    
    const copyButton = document.querySelector('[onclick="copyRoomLink()"]');
    const originalText = copyButton.textContent;
    copyButton.textContent = 'Copied!';
    setTimeout(() => {
        copyButton.textContent = originalText;
    }, 2000);
}

async function joinRoom(roomId) {
    // const roomId = document.getElementById('roomId').value;
    const inputName = document.getElementById('peerName').value;
    if (!roomId) return;

    if (!roomId && window.location.search) {
        const urlParams = new URLSearchParams(window.location.search);
        roomId = urlParams.get('room');
    }
    
    peerName = inputName || peerId;
    currentRoom = roomId;

    connectWebSocket();
}

function leaveRoom() {
    intentionalDisconnect = true;

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    Object.keys(peerConnections).forEach(peerId => {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
    });

    remoteStreams = {};

    peers.clear();
    updateParticipantsList();
    updateStatus('Left the room');

    if (isConnected()) {
        ws.send(JSON.stringify({
            event: 'disconnect',
            data: { peerId },
            room: currentRoom
        }));
    }

    handleDisconnection();
    intentionalDisconnect = false;

    reCreateRoomControl()
}

function reCreateRoomControl() {
    document.getElementById('linkContainer').style.display = 'none';
    document.getElementById('create-room-button').style.display = 'block';
    document.getElementById('join-room').style.display = 'none';

    window.history.replaceState({}, document.title, window.location.pathname);
}

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    
    if (roomId) {
        document.getElementById('create-room-button').style.display = 'none';
        document.getElementById('join-room').style.display = 'block';
        // joinRoom(roomId);
    }
});

function joinRoomBtn() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');

    joinRoom(roomId);
}