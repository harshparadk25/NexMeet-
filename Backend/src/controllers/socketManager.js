import { Server } from "socket.io";

let connections = {};
let messages = {};
let timeOnline = {};

export const connectToSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      allowedHeaders: ["*"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("join-call", (roomId) => {
      if (!connections[roomId]) {
        connections[roomId] = [];
      }

      connections[roomId].push(socket.id);
      timeOnline[socket.id] = new Date();

      // Notify existing users in the room about the new user
      connections[roomId].forEach((id) => {
        if (id !== socket.id) {
          io.to(id).emit("user-join", socket.id); // Inform others about new peer
          io.to(socket.id).emit("user-join", id); // Inform new peer about others
        }
      });

      // Send chat history
      (messages[roomId] || []).forEach((msg) => {
        io.to(socket.id).emit("chat-message", msg.data, msg.sender, msg["socket-id-sender"]);
      });
    });

    // Relay WebRTC signaling messages (offer/answer/candidates)
    socket.on("signal", ({ to, data }) => {
      io.to(to).emit("signal", {
        from: socket.id,
        data,
      });
    });

    // Chat support
    socket.on("chat-message", (data, sender) => {
      const roomId = Object.keys(connections).find((room) =>
        connections[room].includes(socket.id)
      );

      if (roomId) {
        if (!messages[roomId]) messages[roomId] = [];

        const messageObj = {
          sender,
          data,
          "socket-id-sender": socket.id,
        };

        messages[roomId].push(messageObj);

        connections[roomId].forEach((id) => {
          io.to(id).emit("chat-message", data, sender, socket.id);
        });
      }
    });

    // Handle disconnects
    socket.on("disconnect", () => {
      const duration = Math.abs(new Date() - timeOnline[socket.id] || 0);
      delete timeOnline[socket.id];

      for (const [roomId, socketList] of Object.entries(connections)) {
        const index = socketList.indexOf(socket.id);
        if (index !== -1) {
          socketList.splice(index, 1);

          // Inform others
          socketList.forEach((id) => {
            io.to(id).emit("user-left", socket.id);
          });

          if (socketList.length === 0) {
            delete connections[roomId];
            delete messages[roomId];
          }

          break;
        }
      }

      console.log(`Client disconnected: ${socket.id} (online for ${duration} ms)`);
    });
  });

  return io;
};
