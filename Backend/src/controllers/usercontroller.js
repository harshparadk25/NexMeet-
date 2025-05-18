import User from "../models/usermodel.js";
import bcrypt from "bcrypt";
import httpStatus from "http-status";
import crypto from "crypto";
import Meeting from "../models/meetingmodel.js";

// LOGIN
const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Please provide username and password." });
  }

  try {
    const user = await User.findOne({ username }).select("+password"); // needed if password is hidden via select:false
    if (!user) {
      return res.status(httpStatus.NOT_FOUND).json({ message: "User not found" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid username or password" });
    }

    const token = crypto.randomBytes(20).toString("hex");
    user.token = token;
    await user.save();

    return res.status(httpStatus.OK).json({ token });

  } catch (err) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong: ${err.message}` });
  }
};

// REGISTER
const register = async (req, res) => {
  const { name, username, password } = req.body;

  if (!name || !username || !password) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "All fields are required." });
  }

  // Password strength check
  const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordPattern.test(password)) {
    return res.status(httpStatus.BAD_REQUEST).json({
      message:
        "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character."
    });
  }

  try {
    const existingUser = await User.findOne({ username });

    if (existingUser) {
      return res.status(httpStatus.CONFLICT).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      username,
      password: hashedPassword,
    });

    await newUser.save();

    return res.status(httpStatus.CREATED).json({ message: "User registered successfully" });

  } catch (err) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong: ${err.message}` });
  }
};


// GET USER HISTORY
const getUserHistory = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Token is required." });
  }

  try {
    const user = await User.findOne({ token });
    if (!user) {
      return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid token" });
    }

    const meetings = await Meeting.find({ user_id: user.username });
    return res.status(httpStatus.OK).json(meetings);

  } catch (err) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong: ${err.message}` });
  }
};

// ADD TO HISTORY
const addToHistory = async (req, res) => {
  const { token, meeting_code } = req.body;

  if (!token || !meeting_code) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Token and meeting code are required." });
  }

  try {
    const user = await User.findOne({ token });
    if (!user) {
      return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid token" });
    }

    const newMeeting = new Meeting({
      user_id: user.username,
      meetingCode: meeting_code,
    });

    await newMeeting.save();

    return res.status(httpStatus.CREATED).json({ message: "Meeting added to history" });

  } catch (err) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong: ${err.message}` });
  }
};

export { login, register, getUserHistory, addToHistory };
