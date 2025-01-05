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
        updateStatus('Joined room: ' + roomId);
    };

    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.event) {
            case 'peer-joined':
                remotePeerId = message.data.peerId;
                updateStatus('Peer joined: ' + remotePeerId);
                if (!peerConnection) {
                    createPeerConnection();
                }
                break;
            case 'offer':
                await handleOffer(message);
                break;
            case 'answer':
                if (peerConnection) {
                    await peerConnection.setRemoteDescription(
                        new RTCSessionDescription(message.data.answer)
                    );
                }
                break;
            case 'ice-candidate':
                if (peerConnection) {
                    await peerConnection.addIceCandidate(
                        new RTCIceCandidate(message.data.candidate)
                    );
                }
                break;
        }
    };
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

function createPeerConnection() {
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

    peerConnection.ontrack = (event) => {
        console.log('Got remote track:', event.streams[0]);
        if (!remoteAudio) {
            remoteAudio = new Audio();
            remoteAudio.volume = 1.0;
        }
        remoteAudio.srcObject = event.streams[0];
        
        // Force play the audio
        const playPromise = remoteAudio.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.log('Autoplay prevented. Please click to enable audio.');
                document.addEventListener('click', () => {
                    remoteAudio.play();
                }, { once: true });
            });
        }
    };

    // Add connection monitoring
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE Connection State:', peerConnection.iceConnectionState);
    };
    
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection State:', peerConnection.connectionState);
    };

    return peerConnection;
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
    try {
        if (!peerConnection) {
            createPeerConnection();
        }

        const offer = message.data.offer;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        // Get user media if not already obtained
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }

        // Create and send answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        ws.send(JSON.stringify({
            event: 'answer',
            data: {
                answer,
                target: message.data.peerId,
                peerId: peerId
            },
            room: currentRoom
        }));

        updateStatus('Connected to call');

    } catch (error) {
        console.error('Error handling offer:', error);
        updateStatus('Failed to handle offer: ' + error.message);
    }
}

async function handleAnswer(message) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data.answer));
}

async function handleICECandidate(message) {
    if (message.data.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(message.data.candidate));
    }
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

