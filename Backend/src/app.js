import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import userRoutes from "./routes/userroutes.js";
import { connectToSocket } from "./controllers/socketManager.js";
import dotenv from "dotenv";
dotenv.config();


// Initialize Express app
const app = express();
const server = createServer(app);

// Initialize Socket.IO
const io = connectToSocket(server);

// Set up middleware
app.use(cors());
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));

// Set up routes
app.use("/api/v1/users", userRoutes);

// Set the port from environment variable or default to 8000
const PORT = process.env.PORT || 8000;
app.set("port", PORT);

// Start server and connect to DB
const start = async () => {
  try {
    // MongoDB connection string from environment variable
    const dbConnection = await mongoose.connect(process.env.MONGO_URI || "your-default-mongo-uri-here");

    console.log(`MongoDB connected successfully: ${dbConnection.connection.host}`);

    server.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Error connecting to MongoDB", error);
    process.exit(1);  // Exit the process if MongoDB connection fails
  }
};

start();
