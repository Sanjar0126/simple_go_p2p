const TURN_USERNAME="f605e5689139700b1d3214f9"
const TURN_CREDENTIAL="y1jaBRSYnCkC+71B"

function getTurnUsername() {
    return TURN_USERNAME;
}
  
function getTurnPassword() {
    return TURN_CREDENTIAL;
}

const rtc_config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
            urls: "stun:stun.relay.metered.ca:80",
        },
        {
            urls: "turn:global.relay.metered.ca:80",
            username: getTurnUsername(),
            credential: getTurnPassword()
        },
        {
            urls: "turn:global.relay.metered.ca:80?transport=tcp",
            username: getTurnUsername(),
            credential: getTurnPassword()
        },
        {
            urls: "turn:global.relay.metered.ca:443",
            username: getTurnUsername(),
            credential: getTurnPassword()
        },
        {
            urls: "turns:global.relay.metered.ca:443?transport=tcp",
            username: getTurnUsername(),
            credential: getTurnPassword()
        },
    ]
}

function getRTCConfig() {
    return rtc_config;
}