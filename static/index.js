let ws;
let peerConnection;
let dataChannel;
let peerId = Math.random().toString(36).substr(2, 9);
let currentRoom;
let file;
let receivedSize = 0;
let receivedData = [];
let remotePeerId = null;

function log(message) {
    console.log(message);
    const logDiv = document.getElementById('log');
    logDiv.innerHTML += message + '<br>';
    logDiv.scrollTop = logDiv.scrollHeight;
}

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
};

function joinRoom() {
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
        log('Connected to WebSocket server');
        updateStatus('Joined room: ' + roomId);
    };

    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        log('Received message: ' + message.event);
        
        switch (message.event) {
            case 'peer-joined':
                remotePeerId = message.data.peerId;
                updateStatus('Peer joined: ' + remotePeerId);
                await initiatePeerConnection();
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
}

async function initiatePeerConnection() {
    log('Initiating peer connection');
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

function createPeerConnection() {
    log(config.iceServers[3])
    peerConnection = new RTCPeerConnection(config);
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                event: 'ice-candidate',
                data: {
                    candidate: event.candidate,
                    target: remotePeerId,
                    peerId: peerId
                },
                room: currentRoom
            }));
        }
    };

    peerConnection.onconnectionstatechange = () => {
        log('Connection state: ' + peerConnection.connectionState);
    };

    peerConnection.ondatachannel = (event) => {
        log('Received data channel');
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
    };
}

function createDataChannel() {
    try {
        dataChannel = peerConnection.createDataChannel('fileTransfer', {
            ordered: true
        });
        log('Created data channel');
        setupDataChannel(dataChannel);
    } catch (e) {
        log('Error creating data channel: ' + e.message);
    }
}

function setupDataChannel(channel) {
    channel.binaryType = 'arraybuffer';
    
    channel.onopen = () => {
        log('Data channel is open');
        updateStatus('Connection established - ready to transfer files');
    };

    channel.onclose = () => {
        log('Data channel closed');
        updateStatus('Connection closed');
    };

    channel.onerror = (error) => {
        log('Data channel error: ' + error);
    };

    channel.onmessage = async (event) => {
        try {
            if (typeof event.data === 'string') {
                const metadata = JSON.parse(event.data);
                log('Received file metadata: ' + JSON.stringify(metadata));
                file = metadata;
                updateStatus(`Receiving ${metadata.fileName} (${metadata.fileSize} bytes)`);
                receivedSize = 0;
                receivedData = [];
                document.getElementById('progress').style.display = 'block';
            } else {
                receivedData.push(event.data);
                receivedSize += event.data.byteLength;
                
                const progress = document.getElementById('progress');
                progress.value = (receivedSize / file.fileSize) * 100;
                
                if (receivedSize === file.fileSize) {
                    const blob = new Blob(receivedData);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = file.fileName;
                    a.click();
                    URL.revokeObjectURL(url);
                    updateStatus('File received and downloaded');
                    progress.style.display = 'none';
                    log('File transfer completed');
                }
            }
        } catch (e) {
            log('Error handling message: ' + e.message);
        }
    };
}

async function handleOffer(message) {
    log('Handling offer');
    remotePeerId = message.data.peerId;
    if (!peerConnection) {
        createPeerConnection();
    }
    
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        ws.send(JSON.stringify({
            event: 'answer',
            data: {
                answer,
                target: remotePeerId,
                peerId: peerId
            },
            room: currentRoom
        }));
    } catch (e) {
        log('Error handling offer: ' + e.message);
    }
}

async function handleAnswer(message) {
    log('Handling answer');
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data.answer));
    } catch (e) {
        log('Error handling answer: ' + e.message);
    }
}

async function handleICECandidate(message) {
    if (message.data.candidate) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.data.candidate));
            log('Added ICE candidate');
        } catch (e) {
            log('Error adding ICE candidate: ' + e.message);
        }
    }
}

document.getElementById('fileInput').addEventListener('change', (event) => {
    file = event.target.files[0];
    if (file) {
        updateStatus(`Selected file: ${file.name}`);
        log('File selected: ' + file.name);
    }
});

async function sendFile() {
    if (!file) {
        log('No file selected');
        return;
    }
    if (!dataChannel) {
        log('No data channel available');
        return;
    }
    if (dataChannel.readyState !== 'open') {
        log('Data channel is not open. Current state: ' + dataChannel.readyState);
        return;
    }
    
    log('Starting file transfer');
    const metadata = {
        fileName: file.name,
        fileSize: file.size
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
            log('File transfer completed');
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
    log(message);
}
