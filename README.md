# ZKONTROL - Secure Communications Platform

[![Version](https://img.shields.io/badge/version-2.1.0-purple)](https://github.com/zkontrol/zkontrol-secure-communications)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Solana](https://img.shields.io/badge/Solana-Integrated-14F195)](https://solana.com)

ZKONTROL is a privacy-focused, secure communications platform built on Web3 principles. It combines Phantom wallet authentication, real-time messaging, self-destructing messages, and AI-powered assistance to deliver a next-generation chat experience.

## 🚀 Features

### Core Functionality
- **🔐 Phantom Wallet Authentication** - Secure, wallet-based sign-in using Solana's Phantom wallet with cryptographic signature verification
- **💬 Real-Time Messaging** - Instant messaging powered by WebSocket (Socket.io)
- **🛡️ Privacy Features** - Self-destructing messages and wallet-based access control
- **🤖 AI Crypto Assistant** - GPT-5 powered assistant specialized in crypto and Solana
- **⏱️ Self-Destructing Messages** - Signal-style disappearing messages (30s to 24h)
- **😊 Message Reactions** - Slack/Discord-style emoji reactions with real-time sync
- **💱 Private Swap Interface** - Integrated token swap with HoudiniSwap-inspired UI

### Security Features
- Challenge-response signature verification (ed25519)
- Wallet ownership validation
- Session-based authentication with HTTP-only cookies
- Database-persisted message history
- Auto-delete expired messages
- SQL injection prevention (parameterized queries via Drizzle ORM)

### User Experience
- Matrix-style ambient background animation
- Responsive design (mobile, tablet, desktop)
- Dark purple theme matching ZKONTROL branding
- Public and private chat rooms
- Group chat support
- Typing indicators
- Real-time user statistics dashboard

## 🛠️ Tech Stack

### Frontend
- **HTML5/CSS3** - Modern, responsive design
- **Vanilla JavaScript** - No framework dependencies
- **GSAP** - Smooth animations
- **Socket.io Client** - Real-time communication

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web server framework
- **Socket.io** - WebSocket server
- **PostgreSQL** - Primary database (Neon)
- **Drizzle ORM** - Type-safe database operations

### Blockchain & Crypto
- **Solana Web3.js** - Blockchain integration
- **Phantom Wallet** - Authentication provider
- **TweetNaCl** - Cryptographic operations

### AI & ML
- **OpenAI GPT-5** - AI assistant capabilities

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
- Phantom wallet (for users)

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/zkontrol/zkontrol-secure-communications.git
cd zkontrol-secure-communications
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
Create a `.env` file in the root directory:
```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Session
SESSION_SECRET=your-secure-session-secret

# AI Integration (OpenAI Compatible)
AI_INTEGRATIONS_OPENAI_BASE_URL=https://your-openai-api-url
AI_INTEGRATIONS_OPENAI_API_KEY=your-api-key
```

4. **Initialize database**
```bash
npm run db:push
```

5. **Start the server**
```bash
npm start
```

The application will be available at `http://localhost:5000`

## 🏗️ Project Structure

```
zkontrol-secure-communications/
├── app/                      # Chat application frontend
│   ├── index.html           # Chat UI
│   ├── style.css            # Chat styling
│   └── app.js               # Chat logic & WebSocket client
├── assets/                   # Static assets
│   ├── logos/               # ZKONTROL branding
│   └── tokens/              # Token icons (SOL, USDC)
├── server/                   # Backend modules
│   ├── auth.js              # Phantom wallet authentication
│   ├── openai.js            # AI assistant integration
│   └── storage.js           # Database operations
├── shared/                   # Shared code
│   └── schema.js            # Database schema (Drizzle)
├── index.html               # Main website landing page
├── style.css                # Main website styling
├── server.js                # Express server & Socket.io
└── package.json             # Project metadata

```

## 🔑 Key Components

### Authentication Flow
1. User connects Phantom wallet
2. Server generates unique nonce
3. User signs nonce with private key
4. Server verifies signature using Solana Web3.js
5. Session created upon successful verification

### Real-Time Messaging
- Socket.io manages WebSocket connections
- All messages persist in PostgreSQL database
- Typing indicators and reactions sync in real-time
- Auto-delete job runs every 60 seconds for expiring messages

### Database Schema
- **users** - Wallet addresses and usernames
- **rooms** - Chat rooms (private/public/group)
- **room_members** - User-room relationships
- **messages** - Chat messages with expiration
- **reactions** - Message reactions

## 📚 Documentation

- **[API Documentation](API_DOCS.md)** - Complete API reference
- **[Architecture](ARCHITECTURE.md)** - System design details
- **[Security](SECURITY.md)** - Security practices and vulnerability reporting
- **[Implementation Status](IMPLEMENTATION_STATUS.md)** - Current features vs. planned features
- **[Deployment Guide](DEPLOYMENT.md)** - Production deployment instructions
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🌐 Links

- **Website**: [https://zkontrol.io](https://zkontrol.io)
- **Documentation**: [https://docs.zkontrol.io](https://docs.zkontrol.io)
- **Twitter**: [@zkontrol_io](https://x.com/zkontrol_io?s=21)
- **Contract**: `9VVAWXPkQjStAz1UMqdjhpd15sVHr4NxVypuWUPcpump`

## 💬 Support

For support, email dev@zkontrol.io or join our community channels.

---

Built with 💜 by the ZKONTROL team
