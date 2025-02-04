const SIMPLE_PEER_PING_INTERVAL = 120000; // 2 minutes
const PEER_ID_LENGTH = 12;

function randomToken(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < length; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

function promiseWait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getFromMapOrCreate(map, key, createFn) {
    if (!map.has(key)) {
        map.set(key, createFn());
    }
    return map.get(key);
}

export async function startSignalingServerSimplePeer(serverOptions = {}) {
    const { WebSocketServer } = await import('ws');
    const PORT = process.env.PORT || serverOptions.port || 3000;
    const wss = new WebSocketServer({ port: PORT });

    console.log(`WebSocket server is running on port ${PORT}`);

    const peerById = new Map();
    const peersByRoom = new Map();
    let serverClosed = false;

    wss.on('close', () => {
        serverClosed = true;
        peerById.clear();
        peersByRoom.clear();
    });

    // Periodically disconnect peers with no recent ping
    (async () => {
        while (!serverClosed) {
            await promiseWait(5000);
            const minTime = Date.now() - SIMPLE_PEER_PING_INTERVAL;
            Array.from(peerById.values()).forEach(peer => {
                if (peer.lastPing < minTime) {
                    disconnectSocket(peer.id, 'no ping for 2 minutes');
                }
            });
        }
    })();

    function disconnectSocket(peerId, reason) {
        console.log(`# disconnect peer ${peerId} reason: ${reason}`);
        const peer = peerById.get(peerId);
        if (peer) {
            if (peer.socket.close) peer.socket.close(undefined, reason);
            peer.rooms.forEach(roomId => {
                const room = peersByRoom.get(roomId);
                if (room) {
                    room.delete(peerId);
                    if (room.size === 0) peersByRoom.delete(roomId);
                }
            });
        }
        peerById.delete(peerId);
    }

    wss.on('connection', function (ws) {
        const peerId = randomToken(PEER_ID_LENGTH);
        const peer = {
            id: peerId,
            socket: ws,
            rooms: new Set(),
            lastPing: Date.now(),
        };
        peerById.set(peerId, peer);
        sendMessage(ws, { type: 'init', yourPeerId: peerId });

        ws.on('error', err => {
            console.error('SERVER ERROR:');
            console.error(err);
            disconnectSocket(peerId, 'socket errored');
        });
        ws.on('close', () => {
            disconnectSocket(peerId, 'socket disconnected');
        });

        ws.on('message', msgEvent => {
            peer.lastPing = Date.now();
            const message = JSON.parse(msgEvent.toString());
            const type = message.type;
            switch (type) {
                case 'join': {
                    const roomId = message.room;
                    if (!validateIdString(roomId) || !validateIdString(peerId)) {
                        disconnectSocket(peerId, 'invalid ids');
                        return;
                    }
                    if (peer.rooms.has(roomId)) return;
                    peer.rooms.add(roomId);
                    const room = getFromMapOrCreate(peersByRoom, roomId, () => new Set());
                    room.add(peerId);
                    room.forEach(otherPeerId => {
                        const otherPeer = peerById.get(otherPeerId);
                        if (otherPeer) {
                            sendMessage(otherPeer.socket, {
                                type: 'joined',
                                otherPeerIds: Array.from(room)
                            });
                        }
                    });
                    break;
                }
                case 'signal': {
                    if (message.senderPeerId !== peerId) {
                        disconnectSocket(peerId, 'spoofed sender');
                        return;
                    }
                    const receiver = peerById.get(message.receiverPeerId);
                    if (receiver) sendMessage(receiver.socket, message);
                    break;
                }
                case 'ping':
                    sendMessage(ws, { type: 'pong' });
                    break;
                default:
                    disconnectSocket(peerId, 'unknown message type ' + type);
            }
        });
    });

    return {
        port: PORT,
        server: wss,
        localUrl: `ws://localhost:${PORT}`,
    };
}

function sendMessage(ws, message) {
    ws.send(JSON.stringify(message));
}

function validateIdString(id) {
    return typeof id === 'string' && id.length > 5 && id.length < 100;
}
