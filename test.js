const ws = new WebSocket("wss://llm-client-signaling.eban.eu.org");

ws.onopen = () => {
    console.log("Connected to WebRTC Signaling Server");
    ws.send(JSON.stringify({ type: "ping" }));
    console.log("Message sent")
};

ws.onmessage = (event) => {
    console.log("Received:", event.data);
};

ws.onerror = (error) => {
    console.error("WebSocket error:", error);
};

ws.onclose = () => {
    console.log("WebSocket connection closed");
};
