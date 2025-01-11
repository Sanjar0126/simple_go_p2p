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

document.getElementById('fileInput').addEventListener('change', (event) => {
    file = event.target.files[0];
    if (file) {
        updateStatus(`Selected file: ${file.name}`);
    }
});

async function sendFile() {
    if (!file || !dataChannel) return;

    if (!isConnected()) {
        updateStatus('Connection lost. Please wait for reconnection...');
        return;
    }

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