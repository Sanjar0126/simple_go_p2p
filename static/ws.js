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