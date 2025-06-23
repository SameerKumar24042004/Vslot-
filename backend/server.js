// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB (no deprecated options)
mongoose.connect('mongodb://localhost:27017/vslot');

// User Schema
const userSchema = new mongoose.Schema({
    username: String,
    email: String,
    password: String
});
const User = mongoose.model('User', userSchema);

// Register endpoint
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ message: 'User already exists' });
    const user = new User({ username, email, password });
    await user.save();
    res.json({ message: 'Registration successful' });
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: 'User not found' });
    if (user.password !== password) return res.status(400).json({ message: 'Incorrect password' });
    res.json({ message: 'Login successful' });
});

