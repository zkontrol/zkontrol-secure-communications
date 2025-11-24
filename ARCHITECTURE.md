# ZKONTROL Architecture Documentation

## Overview

ZKONTROL is built using a modern, layered architecture that prioritizes security, real-time performance, and scalability. This document provides a comprehensive overview of the system design.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Main Website │  │  Chat App    │  │Phantom Wallet│      │
│  │  (Static)    │  │  (SPA-like)  │  │  Extension   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ HTTPS / WSS
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   Application Server                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            Express.js HTTP Server                     │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐     │   │
│  │  │ Static     │  │  Auth API  │  │  Session   │     │   │
│  │  │ Files      │  │ Endpoints  │  │ Management │     │   │
│  │  └────────────┘  └────────────┘  └────────────┘     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            Socket.io WebSocket Server                 │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐     │   │
│  │  │ Real-time  │  │  Typing    │  │ Reactions  │     │   │
│  │  │ Messaging  │  │ Indicators │  │   Sync     │     │   │
│  │  └────────────┘  └────────────┘  └────────────┘     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │               Business Logic Layer                    │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐     │   │
│  │  │ Auth       │  │  AI        │  │  Storage   │     │   │
│  │  │ Service    │  │ Assistant  │  │  Service   │     │   │
│  │  └────────────┘  └────────────┘  └────────────┘     │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
┌───────────────▼──────┐  ┌─────────────▼───────────┐
│  PostgreSQL Database │  │   OpenAI API            │
│  (Neon)              │  │   (GPT-5)               │
│  ├─ users            │  └─────────────────────────┘
│  ├─ rooms            │
│  ├─ room_members     │
│  ├─ messages         │
│  └─ reactions        │
└──────────────────────┘
```

## Core Components

### 1. Frontend Layer

#### Main Website (`/`)
- **Technology**: Static HTML/CSS with GSAP animations
- **Purpose**: Marketing and landing page
- **Features**:
  - Hero section with video background
  - Feature showcases
  - Token information
  - Direct link to chat application

#### Chat Application (`/app`)
- **Technology**: Vanilla JavaScript with Socket.io client
- **Purpose**: Real-time messaging interface
- **Key Modules**:
  - `app.js` - Main application logic
  - `style.css` - UI styling and animations
  - Matrix rain canvas animation

#### Phantom Wallet Integration
- **Technology**: Solana Web3.js + Phantom SDK
- **Purpose**: Decentralized authentication
- **Flow**:
  1. Detect Phantom wallet extension
  2. Request connection
  3. Sign authentication challenge
  4. Establish authenticated session

### 2. Backend Layer

#### Express.js Server (`server.js`)
```javascript
Main responsibilities:
├── Static file serving
├── Session management (express-session)
├── RESTful API endpoints
├── Socket.io initialization
└── Background jobs (message auto-delete)
```

**Port Configuration**: 5000  
**Module Type**: ESM (ES Modules)

#### Socket.io WebSocket Server
Real-time event handlers:
```javascript
Events:
├── connection          - New client connects
├── disconnect          - Client disconnects
├── join_room           - User joins a chat room
├── send_message        - User sends a message
├── typing              - User is typing
├── stop_typing         - User stopped typing
├── add_reaction        - User reacts to a message
├── remove_reaction     - User removes a reaction
└── get_user_stats      - Fetch user statistics
```

### 3. Authentication System

#### Phantom Wallet Authentication (`server/auth.js`)

**Challenge-Response Flow**:
```
1. Client requests nonce
   GET /api/auth/nonce
   ← { nonce: "random-string" }

2. Client signs nonce with wallet
   Phantom.signMessage(nonce)

3. Client sends signed message
   POST /api/auth/verify
   { walletAddress, signature, message }

4. Server verifies signature
   nacl.sign.detached.verify(...)

5. Session created on success
   req.session.userId = user.id
```

**Security Features**:
- Unique nonce per authentication attempt
- Cryptographic signature verification using ed25519
- Server-side session management
- Prevents wallet impersonation attacks

### 4. Database Layer

#### Schema Design (`shared/schema.js`)

**Users Table**:
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(44) UNIQUE NOT NULL,
  username VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Rooms Table**:
```sql
CREATE TABLE rooms (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Room Members Table**:
```sql
CREATE TABLE room_members (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id),
  user_id INTEGER REFERENCES users(id),
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);
```

**Messages Table**:
```sql
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id),
  user_id INTEGER REFERENCES users(id),
  content TEXT NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Reactions Table**:
```sql
CREATE TABLE reactions (
  id SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  emoji VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);
```

#### Database Operations (`server/storage.js`)

Key functions:
- `createUser(walletAddress, username)`
- `getUserByWalletAddress(walletAddress)`
- `createRoom(name, isPublic)`
- `addUserToRoom(userId, roomId)`
- `getUserRooms(userId)`
- `saveMessage(roomId, userId, content, expiresAt)`
- `getMessagesForRoom(roomId)`
- `addReaction(messageId, userId, emoji)`
- `removeReaction(messageId, userId, emoji)`
- `getUserMessageCount(userId)`
- `getUserActivityStats(userId)`

### 5. AI Assistant

#### OpenAI Integration (`server/openai.js`)

**Configuration**:
- Model: GPT-5
- Max tokens: 1024
- Temperature: 1.0
- System prompt: Specialized Solana/crypto expert

**Capabilities**:
- Crypto transaction guidance
- Real-time market data analysis
- Smart contract explanations
- Security best practices
- DeFi protocol assistance
- NFT trading advice

## Data Flow

### Message Sending Flow

```
User types message → Client emits 'send_message' event
                              ↓
                     Socket.io receives event
                              ↓
                     Validates user session
                              ↓
                   Saves to PostgreSQL (storage.js)
                              ↓
              Broadcasts to all room members via Socket.io
                              ↓
              Clients receive and render message
```

### Auto-Delete Messages Flow

```
Background job runs every 60 seconds
           ↓
Query messages WHERE expires_at < NOW()
           ↓
Delete expired messages from database
           ↓
Emit 'message_deleted' event to active users
           ↓
Clients remove message from UI with fade animation
```

## Security Architecture

### Authentication Layers
1. **Wallet Ownership Verification** - Cryptographic proof via ed25519 signatures
2. **Session Management** - Secure HTTP sessions with express-session
3. **WebSocket Authentication** - Session-based Socket.io connections
4. **Database Access Control** - Parameterized queries preventing SQL injection

### Privacy Features
- Wallet-based authentication (no passwords)
- No storage of private keys
- Self-destructing messages (auto-delete)
- Session-based access control

## Scalability Considerations

### Current Architecture
- Single server instance
- PostgreSQL database
- Socket.io in-memory adapter

### Scaling Strategy
1. **Horizontal Scaling**:
   - Load balancer (Nginx/HAProxy)
   - Multiple application servers
   - Redis adapter for Socket.io

2. **Database Scaling**:
   - Read replicas for queries
   - Connection pooling
   - Indexed queries optimization

3. **Caching Layer**:
   - Redis for session storage
   - User data caching
   - Message history caching

## Performance Optimizations

### Frontend
- Lazy loading of assets
- Deferred video loading (hero section)
- Canvas-based animations (Matrix rain)
- Message virtualization for long histories

### Backend
- Connection pooling (PostgreSQL)
- Indexed database queries
- WebSocket connection reuse
- Background job scheduling

### Database
```sql
-- Key indexes for performance
CREATE INDEX idx_messages_room_id ON messages(room_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_messages_expires_at ON messages(expires_at);
CREATE INDEX idx_room_members_user_id ON room_members(user_id);
CREATE INDEX idx_reactions_message_id ON reactions(message_id);
```

## Technology Choices Rationale

### Why PostgreSQL?
- ACID compliance for message integrity
- Advanced querying capabilities
- JSON support for flexible data
- Proven scalability

### Why Socket.io?
- Automatic reconnection
- Fallback to HTTP long-polling
- Room-based messaging
- Binary data support

### Why Phantom Wallet?
- Leading Solana wallet
- Excellent developer experience
- Strong security model
- Wide user adoption

### Why Vanilla JavaScript?
- No framework overhead
- Faster initial load
- Easier maintenance
- Better performance for simple UI

## Deployment Architecture

### Production Environment
```
┌─────────────────────┐
│   CDN (Static)      │
│   Cloudflare        │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│   Load Balancer     │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     │           │
┌────▼───┐  ┌───▼────┐
│ App    │  │  App   │
│ Server │  │ Server │
│   #1   │  │   #2   │
└────┬───┘  └───┬────┘
     │          │
     └────┬─────┘
          │
    ┌─────▼──────┐
    │ PostgreSQL │
    │   (Neon)   │
    └────────────┘
```

### Environment Variables
```env
# Production configuration
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://...
SESSION_SECRET=...
AI_INTEGRATIONS_OPENAI_BASE_URL=...
AI_INTEGRATIONS_OPENAI_API_KEY=...
```

## Monitoring & Logging

### Application Logs
- Server startup/shutdown events
- Authentication attempts
- WebSocket connections/disconnections
- Database query errors
- AI assistant requests

### Performance Metrics
- Message delivery latency
- WebSocket connection count
- Database query execution time
- Memory usage
- CPU utilization

## Future Enhancements

### Planned Features
- [ ] Video/voice calling
- [ ] File sharing with encryption
- [ ] Desktop application (Electron)
- [ ] Mobile apps (React Native)
- [ ] Multi-wallet support (MetaMask, etc.)
- [ ] Enhanced group permissions
- [ ] Message search functionality
- [ ] Push notifications

### Technical Improvements
- [ ] Redis caching layer
- [ ] Microservices architecture
- [ ] GraphQL API
- [ ] TypeScript migration
- [ ] Comprehensive test suite
- [ ] CI/CD pipeline
- [ ] Container orchestration (Kubernetes)

---

Last updated: November 2025
