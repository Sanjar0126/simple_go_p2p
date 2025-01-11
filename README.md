# Demo: 
https://simple-go-p2p-chat.onrender.com <br>
Join same rooms. Select file and send, or start call from both sides.

# Roadmap:
## Core Functionality:
1. File Sharing:
   - ✅ Implement file sharing using WebRTC DataChannels.
   - ✅ Add UI for selecting and transferring files.
   - ✅ Support audio file playback directly in the browser.
2. Audio Calling
   - ✅ Enable peer-to-peer audio calling.
   - ⚠️ Extend WebRTC to support multiple peers in a room.
   - ⚠️ Dynamic joining/leaving of peers during calls.
   - ❌ Add volume control, mute/unmute, and call status indicators.
## Stability and Usability:
1. Connection Handling:
   - ⚠️ Handle dropped connections gracefully:
      - ⚠️ Reconnect logic if WebSocket or peer connection fails.
      - ⚠️ (partially) Notify users of connection status changes.
2. Turn Server Integration:
   - ⚠️ Implement a TURN server for better connectivity in restricted networks
## Security and Scalability:
1. Encryption:
   - ❌ Secure WebSocket communication with user authentication.
   - ❌ Make WebRTC and WebSocket traffic is encrypted (DTLS, SRTP).
2. Server Optimization:
   - ❌ Optimize server-side code for high concurrency.
