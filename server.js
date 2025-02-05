const express = require("express")
const http = require("http")
const socketIo = require("socket.io")
const mongoose = require("mongoose")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
require("dotenv").config() // Make sure this is at the top

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is not defined in environment variables")
  process.exit(1)
}

console.log("MongoDB URI:", process.env.MONGODB_URI.replace(/<password>/, "****")) // Log the URI but hide the password

const app = express()
const server = http.createServer(app)
const io = socketIo(server)

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: "labtest1",
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error("MongoDB connection error:", err)
    process.exit(1)
  })

const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
  },
  {
    collection: "users",
  },
)

const User = mongoose.model("User", userSchema)

// Message Schema
const messageSchema = new mongoose.Schema(
  {
    room: String,
    sender: String,
    content: String,
    timestamp: { type: Date, default: Date.now },
  },
  {
    collection: "messages",
  },
)

const Message = mongoose.model("Message", messageSchema)

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static("public"))

// Login route
app.get("/", (req, res) => {
  res.redirect("/login.html")
})

// Signup route
app.post("/signup", async (req, res) => {
  try {
    console.log("Signup attempt:", req.body)
    const { username, password } = req.body
    const hashedPassword = await bcrypt.hash(password, 10)
    const user = new User({ username, password: hashedPassword })
    await user.save()
    console.log("User created successfully:", username)
    res.status(201).json({ message: "User created successfully" })
  } catch (error) {
    console.error("Signup error:", error)
    res.status(400).json({ error: "Username already exists" })
  }
})

// Update login route with better error handling
app.post("/login", async (req, res) => {
  try {
    console.log("Login attempt:", req.body)
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" })
    }

    const user = await User.findOne({ username })
    if (!user) {
      return res.status(400).json({ error: "Invalid username or password" })
    }

    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return res.status(400).json({ error: "Invalid username or password" })
    }

    const token = jwt.sign({ username }, process.env.JWT_SECRET)
    res.json({ token, username })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Socket.io connection
io.on("connection", (socket) => {
  console.log("New client connected")

  socket.on("join room", (room) => {
    socket.join(room)
    console.log(`User joined room: ${room}`)
  })

  socket.on("leave room", (room) => {
    socket.leave(room)
    console.log(`User left room: ${room}`)
  })

  socket.on("chat message", async (data) => {
    const { room, sender, content } = data
    const message = new Message({ room, sender, content })
    await message.save()
    io.to(room).emit("chat message", { sender, content })
  })

  socket.on("typing", (data) => {
    socket.to(data.room).emit("typing", data.username)
  })

  socket.on("disconnect", () => {
    console.log("Client disconnected")
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

