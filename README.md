# Private Video Call

Free 1-to-1 video calls. Runs on your laptop, no deployment.

## Setup (once)
    npm install

## Run
    npm run dev        # http://localhost:3000

## Share with a phone (second terminal)
    npm run tunnel     # prints https://xxxx.trycloudflare.com

Open that link on your laptop, click **Start a call**, tap **Copy link**,
and send the room link to the other person.

## Privacy
- Media is peer-to-peer and encrypted (DTLS-SRTP); the server only relays handshakes.
- Nothing is stored. Rooms hold 2 people max; room IDs are random and unguessable.
- Share the link only with the person you are calling.
- Room signaling and WebSocket metadata pass through this server, and a public tunnel provider can see connection metadata. STUN services used for connectivity can see network addresses. The app does not record or upload camera/microphone media.
- Needs Node.js 18+.
