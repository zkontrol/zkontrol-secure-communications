import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import session from 'express-session';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { storage } from './server/storage.js';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { getCryptoAssistantResponse } from './server/openai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 5000;

// Nonce storage for signature verification (temporary in-memory store)
const nonceStore = new Map(); // walletAddress -> { nonce, timestamp }

// Middleware
app.use(express.json());
app.use(express.static('.', {
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'zkontrol-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
});

app.use(sessionMiddleware);

// Wire session middleware into Socket.io
io.engine.use(sessionMiddleware);

// Map to track socket ID to user ID
const socketToUser = new Map();

// Routes
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// Request a nonce for wallet authentication
app.post('/api/auth/nonce', async (req, res) => {
  const { walletAddress } = req.body;
  
  if (!walletAddress) {
    return res.status(400).json({ success: false, error: 'Wallet address required' });
  }
  
  try {
    // Validate wallet address format
    new PublicKey(walletAddress);
    
    // Generate a random nonce
    const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const message = `ZKONTROL Authentication\n\nSign this message to prove you own this wallet.\n\nNonce: ${nonce}\nWallet: ${walletAddress}`;
    
    // Store nonce with timestamp (expires in 5 minutes)
    nonceStore.set(walletAddress, {
      nonce,
      message,
      timestamp: Date.now()
    });
    
    res.json({ success: true, message, nonce });
  } catch (error) {
    console.error('Nonce generation error:', error);
    res.status(400).json({ success: false, error: 'Invalid wallet address' });
  }
});

// Verify signature and authenticate user
app.post('/api/auth/verify', async (req, res) => {
  const { walletAddress, signature, username } = req.body;
  
  if (!walletAddress || !signature) {
    return res.status(400).json({ success: false, error: 'Wallet address and signature required' });
  }
  
  try {
    // Get stored nonce
    const stored = nonceStore.get(walletAddress);
    
    if (!stored) {
      return res.status(400).json({ success: false, error: 'No nonce found. Request a nonce first.' });
    }
    
    // Check if nonce is expired (5 minutes)
    if (Date.now() - stored.timestamp > 5 * 60 * 1000) {
      nonceStore.delete(walletAddress);
      return res.status(400).json({ success: false, error: 'Nonce expired. Request a new nonce.' });
    }
    
    // Verify signature
    const publicKey = new PublicKey(walletAddress);
    const messageBytes = new TextEncoder().encode(stored.message);
    const signatureBytes = Uint8Array.from(Buffer.from(signature, 'base64'));
    
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes()
    );
    
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }
    
    // Signature is valid! Clear nonce and authenticate user
    nonceStore.delete(walletAddress);
    
    // Try to find existing user by wallet
    let user = await storage.getUserByWallet(walletAddress);
    
    // Create new user if doesn't exist
    if (!user) {
      // Generate username from wallet if not provided
      const displayName = username || `User_${walletAddress.slice(0, 6)}`;
      
      user = await storage.createUser({
        walletAddress,
        username: displayName
      });
    }
    
    req.session.userId = user.id;
    res.json({ success: true, user });
  } catch (error) {
    console.error('Auth verification error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// AI Assistant endpoint
app.post('/api/ai/chat', async (req, res) => {
  try {
    // Check if user is authenticated
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    const { message } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }
    
    // Get AI response
    const aiResponse = await getCryptoAssistantResponse(message);
    
    res.json({ success: true, response: aiResponse });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ success: false, error: 'Failed to get AI response' });
  }
});

// Socket.io connection handling
io.on('connection', async (socket) => {
  console.log('User connected:', socket.id);

  // User authentication via verified session ONLY - NO client-supplied IDs accepted
  socket.on('auth', async (data) => {
    try {
      // Get userId from verified session (set by REST API after signature verification)
      const userId = socket.request.session?.userId;
      
      if (!userId) {
        socket.emit('error', { message: 'Not authenticated. Please connect your Phantom wallet first.' });
        return;
      }
      
      // Get user from database to verify they exist
      const user = await storage.getUser(userId);
      
      if (!user) {
        socket.emit('error', { message: 'User not found. Please authenticate again.' });
        return;
      }
      
      // Map socket to user (using session-verified user ID)
      socketToUser.set(socket.id, user.id);
      
      // Ensure public room exists and auto-join user
      const publicRoom = await storage.ensurePublicRoom();
      const isPublicMember = await storage.isRoomMember(publicRoom.id, user.id);
      
      if (!isPublicMember) {
        await storage.addRoomMember(publicRoom.id, user.id);
      }
      
      // Get user's rooms (now includes public room)
      const userRooms = await storage.getUserRooms(user.id);
      
      // Join all user's rooms
      for (const room of userRooms) {
        socket.join(room.id.toString());
      }
      
      socket.emit('auth_success', {
        user: {
          id: user.id,
          username: user.username,
          walletAddress: user.walletAddress,
          online: true
        },
        rooms: userRooms
      });

      // Notify others that user is online
      socket.broadcast.emit('user_online', {
        id: user.id,
        username: user.username,
        walletAddress: user.walletAddress
      });
      
      console.log('Wallet authenticated (session):', user.walletAddress, 'Username:', user.username, 'ID:', user.id);
    } catch (error) {
      console.error('Auth error:', error);
      socket.emit('error', { message: 'Authentication failed' });
    }
  });

  // Create a new private chat with wallet address validation
  socket.on('create_private_chat', async (data) => {
    const userId = socketToUser.get(socket.id);
    
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      const { recipientWallet } = data;
      
      // Check if recipient wallet exists in database
      const recipient = await storage.getUserByWallet(recipientWallet);
      
      if (!recipient) {
        // User never connected to ZKONTROL
        socket.emit('user_not_found', { wallet: recipientWallet });
        return;
      }
      
      // Check if a private room already exists between these two users
      const existingRoom = await storage.findPrivateRoom(userId, recipient.id);
      
      if (existingRoom) {
        // Room already exists, just select it
        socket.emit('room_created', existingRoom);
        socket.join(existingRoom.id.toString());
        return;
      }
      
      // Create new private room
      const currentUser = await storage.getUser(userId);
      const room = await storage.createRoom({
        name: `${currentUser.username} & ${recipient.username}`,
        isGroup: false,
        createdBy: userId
      });
      
      // Add both users as members
      await storage.addRoomMember(room.id, userId);
      await storage.addRoomMember(room.id, recipient.id);
      
      // Join socket to room
      socket.join(room.id.toString());
      
      socket.emit('room_created', room);
      
      console.log(`Private room created: ${room.id} between user ${userId} and ${recipient.id}`);
    } catch (error) {
      console.error('Create private chat error:', error);
      socket.emit('error', { message: 'Failed to create private chat' });
    }
  });

  // Create a new room (group only)
  socket.on('create_room', async (data) => {
    const userId = socketToUser.get(socket.id);
    
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      const { name, isGroup } = data;
      
      // Create room in database
      const room = await storage.createRoom({
        name: name || 'New Chat',
        isGroup: isGroup || false,
        createdBy: userId
      });
      
      // Add creator as member
      await storage.addRoomMember(room.id, userId);
      
      // Join socket to room
      socket.join(room.id.toString());
      
      socket.emit('room_created', room);
      
      console.log(`Room created: ${room.id} by user ${userId}`);
    } catch (error) {
      console.error('Create room error:', error);
      socket.emit('error', { message: 'Failed to create room' });
    }
  });

  // Join an existing room
  socket.on('join_room', async (data) => {
    const userId = socketToUser.get(socket.id);
    
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      const { roomId } = data;
      const roomIdNum = parseInt(roomId);
      
      const room = await storage.getRoom(roomIdNum);
      
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      // Check if user is already a member
      const isMember = await storage.isRoomMember(roomIdNum, userId);
      
      if (!isMember) {
        // Add user as member
        await storage.addRoomMember(roomIdNum, userId);
      }
      
      // Join socket to room
      socket.join(roomIdNum.toString());
      
      // Get room messages
      const messages = await storage.getRoomMessages(roomIdNum);
      
      // Get room members
      const members = await storage.getRoomMembers(roomIdNum);
      
      // Get reactions for all messages
      const messageIds = messages.map(m => m.id);
      const allReactions = await storage.getMessagesReactions(messageIds);
      
      socket.emit('room_joined', {
        room: {
          ...room,
          members: members.map(m => ({ id: m.id, username: m.username }))
        },
        messages: messages.map(m => ({
          id: m.id,
          roomId: m.roomId,
          userId: m.userId,
          content: m.content,
          timestamp: m.createdAt,
          expiresAt: m.expiresAt
        })),
        reactions: allReactions
      });
      
      // Notify other members
      const user = await storage.getUser(userId);
      socket.to(roomIdNum.toString()).emit('user_joined_room', {
        roomId: roomIdNum,
        user: user.username
      });
      
      console.log(`User ${userId} joined room: ${roomIdNum}`);
    } catch (error) {
      console.error('Join room error:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // Send a message to a room
  socket.on('send_message', async (data) => {
    const userId = socketToUser.get(socket.id);
    
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      const { roomId, content, expiresAt } = data;
      const roomIdNum = parseInt(roomId);
      
      // Verify user is member of room
      const isMember = await storage.isRoomMember(roomIdNum, userId);
      
      if (!isMember) {
        socket.emit('error', { message: 'Not a member of this room' });
        return;
      }
      
      // Save message to database
      const message = await storage.createMessage({
        roomId: roomIdNum,
        userId: userId,
        content: content,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      });
      
      // Get user info
      const user = await storage.getUser(userId);
      
      const messageData = {
        id: message.id,
        roomId: message.roomId,
        userId: message.userId,
        username: user.username,
        content: message.content,
        timestamp: message.createdAt,
        expiresAt: message.expiresAt
      };
      
      // Send to all room members
      io.to(roomIdNum.toString()).emit('new_message', messageData);
      
      console.log(`Message in room ${roomIdNum} from user ${userId}: ${content}${expiresAt ? ' (expires at: ' + expiresAt + ')' : ''}`);
    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Typing indicator
  socket.on('typing', async (data) => {
    const userId = socketToUser.get(socket.id);
    
    if (userId) {
      try {
        const { roomId } = data;
        const user = await storage.getUser(userId);
        
        socket.to(roomId.toString()).emit('user_typing', {
          roomId,
          username: user.username
        });
      } catch (error) {
        console.error('Typing error:', error);
      }
    }
  });

  socket.on('stop_typing', async (data) => {
    const userId = socketToUser.get(socket.id);
    
    if (userId) {
      try {
        const { roomId } = data;
        const user = await storage.getUser(userId);
        
        socket.to(roomId.toString()).emit('user_stop_typing', {
          roomId,
          username: user.username
        });
      } catch (error) {
        console.error('Stop typing error:', error);
      }
    }
  });

  // Add reaction to a message
  socket.on('add_reaction', async (data) => {
    const userId = socketToUser.get(socket.id);
    
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      const { messageId, emoji, roomId } = data;
      const messageIdNum = parseInt(messageId);
      const roomIdNum = parseInt(roomId);
      
      // Add reaction to database
      const reaction = await storage.addReaction(messageIdNum, userId, emoji);
      
      // Get user info
      const user = await storage.getUser(userId);
      
      const reactionData = {
        id: reaction.id,
        messageId: reaction.messageId,
        userId: reaction.userId,
        emoji: reaction.emoji,
        username: user.username,
        walletAddress: user.walletAddress
      };
      
      // Send to all room members
      io.to(roomIdNum.toString()).emit('reaction_added', reactionData);
      
      console.log(`Reaction added: ${emoji} by user ${userId} on message ${messageIdNum}`);
    } catch (error) {
      console.error('Add reaction error:', error);
      socket.emit('error', { message: 'Failed to add reaction' });
    }
  });

  // Remove reaction from a message
  socket.on('remove_reaction', async (data) => {
    const userId = socketToUser.get(socket.id);
    
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      const { messageId, emoji, roomId } = data;
      const messageIdNum = parseInt(messageId);
      const roomIdNum = parseInt(roomId);
      
      // Remove reaction from database
      const removed = await storage.removeReaction(messageIdNum, userId, emoji);
      
      if (removed) {
        const reactionData = {
          messageId: messageIdNum,
          userId: userId,
          emoji: emoji
        };
        
        // Send to all room members
        io.to(roomIdNum.toString()).emit('reaction_removed', reactionData);
        
        console.log(`Reaction removed: ${emoji} by user ${userId} on message ${messageIdNum}`);
      }
    } catch (error) {
      console.error('Remove reaction error:', error);
      socket.emit('error', { message: 'Failed to remove reaction' });
    }
  });

  // Get online users
  socket.on('get_online_users', async () => {
    try {
      const onlineUserIds = Array.from(socketToUser.values());
      const users = await Promise.all(
        onlineUserIds.map(id => storage.getUser(id))
      );
      
      socket.emit('online_users', users.filter(u => u));
    } catch (error) {
      console.error('Get online users error:', error);
    }
  });

  // Get user statistics for wallet dashboard
  socket.on('get_user_stats', async () => {
    const userId = socketToUser.get(socket.id);
    
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      const messageCount = await storage.getUserMessageCount(userId);
      const activityStats = await storage.getUserActivityStats(userId, 7);
      const userRooms = await storage.getUserRooms(userId);
      
      // Filter out public rooms for conversation count
      const conversationCount = userRooms.filter(room => !room.isPublic).length;
      
      socket.emit('user_stats', {
        messageCount,
        conversationCount,
        activityStats
      });
      
      console.log(`User stats sent for user ${userId}: ${messageCount} messages, ${conversationCount} conversations`);
    } catch (error) {
      console.error('Get user stats error:', error);
      socket.emit('error', { message: 'Failed to get user statistics' });
    }
  });

  // Disconnect
  socket.on('disconnect', async () => {
    const userId = socketToUser.get(socket.id);
    
    if (userId) {
      try {
        const user = await storage.getUser(userId);
        
        if (user) {
          console.log('User disconnected:', user.username);
          
          // Notify others
          socket.broadcast.emit('user_offline', {
            id: userId,
            username: user.username
          });
        }
        
        socketToUser.delete(socket.id);
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }
  });
});

// Auto-delete expired messages background job
setInterval(async () => {
  try {
    const deletedCount = await storage.deleteExpiredMessages();
    if (deletedCount > 0) {
      console.log(`Auto-deleted ${deletedCount} expired messages`);
    }
  } catch (error) {
    console.error('Error deleting expired messages:', error);
  }
}, 60000); // Run every 60 seconds

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ZKONTROL website running at http://0.0.0.0:${PORT}`);
  console.log('WebSocket server ready for real-time chat');
  console.log('Database connected and ready');
  console.log('Auto-delete background job started (runs every 60 seconds)');
});
