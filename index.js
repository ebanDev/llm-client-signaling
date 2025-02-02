import { startSignalingServerSimplePeer } from "./server.js";

const PORT = process.env.PORT || 3000;

startSignalingServerSimplePeer({ port: PORT }).then(({ localUrl }) => {
    console.log(`Signaling server running at ${localUrl}`);
}).catch((error) => {
    console.error("Failed to start server:", error);
});
