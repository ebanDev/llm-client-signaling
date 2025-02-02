export async function startSignalingServerSimplePeer(serverOptions = {}) { // Removed TS type annotations
  const { WebSocketServer } = await import('ws');
  
  const PORT = process.env.PORT || serverOptions.port || 3000; // Use Render's port
  const wss = new WebSocketServer({ port: PORT });

  console.log(`WebSocket server is running on port ${PORT}`);

  const peerById = new Map(); // Removed generics for JavaScript
  const peersByRoom = new Map(); // Removed generics for JavaScript
  let serverClosed = false;

  wss.on('close', () => {
      serverClosed = true;
      peerById.clear();
      peersByRoom.clear();
  });

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

      ws.on('message', msgEvent => {
          peer.lastPing = Date.now();
          const message = JSON.parse(msgEvent.toString());

          if (message.type === 'ping') return; // Keep-alive messages

          if (message.type === 'join') {
              const roomId = message.room;
              if (!validateIdString(roomId)) return;
              peer.rooms.add(roomId);
              const room = peersByRoom.get(roomId) || new Set();
              room.add(peerId);
              peersByRoom.set(roomId, room);

              room.forEach(otherPeerId => {
                  const otherPeer = peerById.get(otherPeerId);
                  if (otherPeer) {
                      sendMessage(otherPeer.socket, {
                          type: 'joined',
                          otherPeerIds: Array.from(room),
                      });
                  }
              });
          } else if (message.type === 'signal') {
              const receiver = peerById.get(message.receiverPeerId);
              if (receiver) sendMessage(receiver.socket, message);
          } else {
              ws.close();
          }
      });

      ws.on('close', () => {
          peerById.delete(peerId);
          peer.rooms.forEach(roomId => {
              const room = peersByRoom.get(roomId);
              if (room) {
                  room.delete(peerId);
                  if (room.size === 0) peersByRoom.delete(roomId);
              }
          });
      });
  });

  return {
      port: PORT,
      server: wss,
      localUrl: `ws://localhost:${PORT}`,
  };
}
