# ZKONTROL API Documentation

## Overview

ZKONTROL provides both RESTful HTTP endpoints and WebSocket (Socket.io) events for real-time communication. This document details all available APIs.

## Base URL

```
Production: https://zkontrol.io
Development: http://localhost:5000
```

---

## RESTful API Endpoints

### Authentication

#### Get Authentication Nonce

Retrieve a unique nonce for wallet signature verification.

**Endpoint**: `GET /api/auth/nonce`

**Headers**: None required

**Response**:
```json
{
  "nonce": "8f3b9c2a-4d1e-4f6b-9a2c-7e5d3f1b8a4c"
}
```

**Status Codes**:
- `200 OK` - Nonce generated successfully

**Example**:
```javascript
const response = await fetch('/api/auth/nonce');
const { nonce } = await response.json();
```

---

#### Verify Wallet Signature

Verify signed message and authenticate user.

**Endpoint**: `POST /api/auth/verify`

**Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "walletAddress": "5vHG2kCFQ...3Ld4p",
  "signature": "base64-encoded-signature",
  "message": "nonce-message-that-was-signed"
}
```

**Response** (Success):
```json
{
  "success": true,
  "user": {
    "id": 1,
    "walletAddress": "5vHG2kCFQ...3Ld4p",
    "username": null
  }
}
```

**Response** (Error):
```json
{
  "success": false,
  "error": "Invalid signature"
}
```

**Status Codes**:
- `200 OK` - Authentication successful
- `400 Bad Request` - Invalid signature or missing fields
- `500 Internal Server Error` - Server error

**Example**:
```javascript
const signedMessage = await window.solana.signMessage(
  new TextEncoder().encode(nonce)
);

const response = await fetch('/api/auth/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    walletAddress: window.solana.publicKey.toString(),
    signature: bs58.encode(signedMessage.signature),
    message: nonce
  })
});

const result = await response.json();
```

---

### AI Assistant

#### Get AI Response

Send message to ZKONTROL AI Assistant and receive crypto/Solana guidance.

**Endpoint**: `POST /api/ai/chat`

**Authentication**: Required (session-based)

**Headers**:
```
Content-Type: application/json
Cookie: connect.sid=...
```

**Request Body**:
```json
{
  "message": "How do I swap SOL for USDC on Solana?"
}
```

**Response**:
```json
{
  "response": "To swap SOL for USDC on Solana, you can use decentralized exchanges like Jupiter, Raydium, or Orca..."
}
```

**Status Codes**:
- `200 OK` - Response generated successfully
- `401 Unauthorized` - User not authenticated
- `500 Internal Server Error` - AI service error

**Example**:
```javascript
const response = await fetch('/api/ai/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    message: 'What is the current SOL price?'
  })
});

const { response: aiResponse } = await response.json();
```

---

## WebSocket API (Socket.io)

### Connection

**URL**: `ws://localhost:5000` or `wss://zkontrol.io`

**Authentication**: Session cookie required

**Example**:
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5000', {
  withCredentials: true,
  transports: ['websocket', 'polling']
});
```

---

### Events (Client → Server)

#### join_room

Join a chat room to receive messages.

**Payload**:
```javascript
{
  roomId: 1
}
```

**Example**:
```javascript
socket.emit('join_room', { roomId: 1 });
```

---

#### send_message

Send a message to a room.

**Payload**:
```javascript
{
  roomId: 1,
  content: "Hello, world!",
  expiresIn: 60000  // Optional: milliseconds until deletion
}
```

**Example**:
```javascript
socket.emit('send_message', {
  roomId: currentRoom.id,
  content: messageText,
  expiresIn: 3600000  // 1 hour
});
```

---

#### typing

Notify others in room that user is typing.

**Payload**:
```javascript
{
  roomId: 1
}
```

**Example**:
```javascript
socket.emit('typing', { roomId: currentRoom.id });
```

---

#### stop_typing

Notify others that user stopped typing.

**Payload**:
```javascript
{
  roomId: 1
}
```

**Example**:
```javascript
socket.emit('stop_typing', { roomId: currentRoom.id });
```

---

#### add_reaction

Add emoji reaction to a message.

**Payload**:
```javascript
{
  messageId: 42,
  emoji: "❤️"
}
```

**Example**:
```javascript
socket.emit('add_reaction', {
  messageId: message.id,
  emoji: '👍'
});
```

---

#### remove_reaction

Remove your reaction from a message.

**Payload**:
```javascript
{
  messageId: 42,
  emoji: "❤️"
}
```

**Example**:
```javascript
socket.emit('remove_reaction', {
  messageId: message.id,
  emoji: '👍'
});
```

---

#### get_user_stats

Request user statistics (message count, activity).

**Payload**: None

**Example**:
```javascript
socket.emit('get_user_stats');
```

---

### Events (Server → Client)

#### rooms_list

Receive list of user's rooms.

**Payload**:
```javascript
[
  {
    id: 1,
    name: "Public Chat",
    isPublic: true,
    lastMessage: "Hey everyone!",
    unreadCount: 3
  },
  {
    id: 2,
    name: "Alice & Bob",
    isPublic: false,
    lastMessage: "See you soon",
    unreadCount: 0
  }
]
```

**Example**:
```javascript
socket.on('rooms_list', (rooms) => {
  renderRoomsList(rooms);
});
```

---

#### room_joined

Confirmation that user successfully joined a room.

**Payload**:
```javascript
{
  roomId: 1,
  roomName: "Public Chat"
}
```

**Example**:
```javascript
socket.on('room_joined', ({ roomId, roomName }) => {
  console.log(`Joined room: ${roomName}`);
});
```

---

#### message_history

Receive historical messages for a room.

**Payload**:
```javascript
[
  {
    id: 42,
    content: "Hello everyone!",
    userId: 1,
    username: "alice.sol",
    createdAt: "2025-11-22T10:30:00Z",
    expiresAt: null,
    reactions: [
      { emoji: "👍", count: 3, userReacted: false },
      { emoji: "❤️", count: 1, userReacted: true }
    ]
  },
  // ... more messages
]
```

**Example**:
```javascript
socket.on('message_history', (messages) => {
  renderMessages(messages);
});
```

---

#### new_message

Receive a new message in real-time.

**Payload**:
```javascript
{
  id: 43,
  content: "Just arrived!",
  userId: 2,
  username: "bob.sol",
  roomId: 1,
  createdAt: "2025-11-22T10:31:00Z",
  expiresAt: "2025-11-22T11:31:00Z",
  reactions: []
}
```

**Example**:
```javascript
socket.on('new_message', (message) => {
  appendMessage(message);
  scrollToBottom();
});
```

---

#### message_deleted

Notification that a message was deleted (auto-expire).

**Payload**:
```javascript
{
  messageId: 42,
  roomId: 1
}
```

**Example**:
```javascript
socket.on('message_deleted', ({ messageId }) => {
  removeMessageFromUI(messageId);
});
```

---

#### user_typing

Another user started typing in the room.

**Payload**:
```javascript
{
  userId: 2,
  username: "bob.sol",
  roomId: 1
}
```

**Example**:
```javascript
socket.on('user_typing', ({ username }) => {
  showTypingIndicator(username);
});
```

---

#### user_stopped_typing

User stopped typing.

**Payload**:
```javascript
{
  userId: 2,
  roomId: 1
}
```

**Example**:
```javascript
socket.on('user_stopped_typing', ({ userId }) => {
  hideTypingIndicator(userId);
});
```

---

#### reaction_added

A reaction was added to a message.

**Payload**:
```javascript
{
  messageId: 42,
  emoji: "❤️",
  userId: 3,
  count: 2
}
```

**Example**:
```javascript
socket.on('reaction_added', ({ messageId, emoji, count }) => {
  updateReactionCount(messageId, emoji, count);
});
```

---

#### reaction_removed

A reaction was removed from a message.

**Payload**:
```javascript
{
  messageId: 42,
  emoji: "❤️",
  userId: 3,
  count: 1
}
```

**Example**:
```javascript
socket.on('reaction_removed', ({ messageId, emoji, count }) => {
  updateReactionCount(messageId, emoji, count);
});
```

---

#### user_stats

Receive user statistics (in response to `get_user_stats`).

**Payload**:
```javascript
{
  messageCount: 142,
  conversationCount: 5,
  activityStats: [
    { date: "2025-11-15", count: 12 },
    { date: "2025-11-16", count: 8 },
    { date: "2025-11-17", count: 15 },
    { date: "2025-11-18", count: 22 },
    { date: "2025-11-19", count: 18 },
    { date: "2025-11-20", count: 25 },
    { date: "2025-11-21", count: 30 }
  ]
}
```

**Example**:
```javascript
socket.on('user_stats', (stats) => {
  updateDashboard(stats);
});
```

---

#### error

Server error notification.

**Payload**:
```javascript
{
  message: "Failed to send message",
  code: "SEND_ERROR"
}
```

**Example**:
```javascript
socket.on('error', ({ message }) => {
  showErrorNotification(message);
});
```

---

## Data Models

### User

```typescript
interface User {
  id: number;
  walletAddress: string;
  username: string | null;
  createdAt: Date;
}
```

### Room

```typescript
interface Room {
  id: number;
  name: string;
  isPublic: boolean;
  createdAt: Date;
}
```

### Message

```typescript
interface Message {
  id: number;
  roomId: number;
  userId: number;
  content: string;
  expiresAt: Date | null;
  createdAt: Date;
  reactions: Reaction[];
}
```

### Reaction

```typescript
interface Reaction {
  emoji: string;
  count: number;
  userReacted: boolean;
}
```

---

## Rate Limiting

Currently no rate limiting is implemented. Future versions will include:
- 100 messages per minute per user
- 10 AI requests per minute per user
- 1000 WebSocket events per minute per connection

---

## Error Codes

| Code | Description |
|------|-------------|
| `AUTH_REQUIRED` | User must be authenticated |
| `INVALID_SIGNATURE` | Wallet signature verification failed |
| `ROOM_NOT_FOUND` | Requested room does not exist |
| `PERMISSION_DENIED` | User lacks permission for action |
| `MESSAGE_TOO_LONG` | Message exceeds maximum length |
| `SEND_ERROR` | Failed to send message |
| `AI_ERROR` | AI assistant unavailable |

---

## Pagination

For future versions, message history will support pagination:

```javascript
socket.emit('get_messages', {
  roomId: 1,
  limit: 50,
  offset: 0
});
```

---

## Best Practices

1. **Always handle errors**: Wrap Socket.io calls in try-catch blocks
2. **Reconnection logic**: Socket.io handles this automatically
3. **Message debouncing**: Debounce typing indicators (1 second)
4. **Batch reactions**: Don't spam reaction events
5. **Session management**: Check authentication before emitting events

---

## Example: Complete Chat Flow

```javascript
// 1. Authenticate
const nonceResp = await fetch('/api/auth/nonce');
const { nonce } = await nonceResp.json();

const signature = await window.solana.signMessage(
  new TextEncoder().encode(nonce)
);

await fetch('/api/auth/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    walletAddress: window.solana.publicKey.toString(),
    signature: bs58.encode(signature.signature),
    message: nonce
  })
});

// 2. Connect to WebSocket
const socket = io('http://localhost:5000', {
  withCredentials: true
});

// 3. Listen for rooms
socket.on('rooms_list', (rooms) => {
  console.log('Available rooms:', rooms);
});

// 4. Join a room
socket.emit('join_room', { roomId: 1 });

// 5. Listen for messages
socket.on('message_history', (messages) => {
  renderMessages(messages);
});

socket.on('new_message', (message) => {
  appendMessage(message);
});

// 6. Send a message
socket.emit('send_message', {
  roomId: 1,
  content: 'Hello from ZKONTROL!',
  expiresIn: 3600000  // 1 hour
});
```

---

Last updated: November 2025
