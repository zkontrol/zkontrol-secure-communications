// WebSocket connection
let socket = null;
let currentUser = null;
let currentRoom = null;
let rooms = [];
let phantomWallet = null;
let walletAddress = null;

// Auto-delete timer settings
let selectedTimerSeconds = 0; // 0 = never delete
const timerLabels = {
    0: 'Off',
    30: '30s',
    60: '1m',
    300: '5m',
    3600: '1h',
    86400: '24h'
};

// Reactions storage: { messageId: [{ userId, emoji, username }, ...] }
let messageReactions = {};

function init() {
    setupEventListeners();
    initializeMatrixBackground();
    detectPhantomWallet();
}

// Detect Phantom Wallet
function detectPhantomWallet() {
    const getProvider = () => {
        if ('phantom' in window) {
            const anyWindow = window;
            const provider = anyWindow.phantom?.solana;
            if (provider?.isPhantom) {
                return provider;
            }
        }
        return null;
    };
    
    phantomWallet = getProvider();
    
    if (!phantomWallet) {
        // Phantom not detected, show install message
        showPhantomNotInstalled();
        hideLoadingScreen();
        return;
    }
    
    // Check if already connected
    phantomWallet.on('connect', (publicKey) => {
        walletAddress = publicKey.toString();
        console.log('Wallet connected:', walletAddress);
        onWalletConnected();
    });
    
    phantomWallet.on('disconnect', () => {
        console.log('Wallet disconnected');
        onWalletDisconnected();
    });
    
    // Try to connect eagerly if previously connected
    if (phantomWallet.isConnected) {
        walletAddress = phantomWallet.publicKey.toString();
        onWalletConnected();
    } else {
        // Show connect wallet UI
        showConnectWalletUI();
        hideLoadingScreen();
    }
}

// Connect to Phantom Wallet with signature verification
async function connectPhantomWallet() {
    if (!phantomWallet) {
        showPhantomNotInstalled();
        return;
    }
    
    try {
        // Step 1: Connect to wallet
        const response = await phantomWallet.connect();
        walletAddress = response.publicKey.toString();
        console.log('Connected to wallet:', walletAddress);
        
        // Step 2: Request nonce from server
        const nonceResponse = await fetch('/api/auth/nonce', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress })
        });
        
        const nonceData = await nonceResponse.json();
        
        if (!nonceData.success) {
            throw new Error(nonceData.error || 'Failed to get nonce');
        }
        
        // Step 3: Sign message with Phantom wallet
        const message = nonceData.message;
        const encodedMessage = new TextEncoder().encode(message);
        const signedMessage = await phantomWallet.signMessage(encodedMessage, 'utf8');
        
        // Convert signature to base64
        const signatureBase64 = btoa(String.fromCharCode(...signedMessage.signature));
        
        // Step 4: Verify signature on server
        const verifyResponse = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                walletAddress,
                signature: signatureBase64
            })
        });
        
        const verifyData = await verifyResponse.json();
        
        if (!verifyData.success) {
            throw new Error(verifyData.error || 'Signature verification failed');
        }
        
        // Authentication successful!
        currentUser = verifyData.user;
        console.log('Authenticated successfully:', currentUser);
        onWalletConnected();
        
    } catch (error) {
        console.error('Failed to connect to Phantom:', error);
        
        // Disconnect wallet on error
        if (phantomWallet && phantomWallet.isConnected) {
            await phantomWallet.disconnect();
        }
        
        walletAddress = null;
        
        // Show error message
        let errorMessage = 'Connection failed. Please make sure Phantom wallet is unlocked and try again.';
        if (error.code === 4001) {
            errorMessage = 'Connection rejected. Please approve the connection request in Phantom wallet.';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        alert(errorMessage);
        hideLoadingScreen();
    }
}

// Disconnect from Phantom Wallet
async function disconnectPhantomWallet() {
    if (phantomWallet && phantomWallet.isConnected) {
        try {
            await phantomWallet.disconnect();
            onWalletDisconnected();
        } catch (error) {
            console.error('Failed to disconnect from Phantom:', error);
        }
    }
}

// Handle wallet connection
function onWalletConnected() {
    // Hide "Connect Wallet" button
    document.getElementById('connectWalletBtn').style.display = 'none';
    
    // Show connected wallet display
    const walletConnectedDiv = document.getElementById('walletConnected');
    const walletAddressDisplay = document.getElementById('walletAddressDisplay');
    
    walletAddressDisplay.textContent = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
    walletAddressDisplay.setAttribute('title', walletAddress);
    
    walletConnectedDiv.style.display = 'flex';
    
    // Hide connect button in empty state
    hideConnectWalletUI();
    
    // Connect to WebSocket with wallet address
    connectWebSocket();
}

// Handle wallet disconnection
function onWalletDisconnected() {
    walletAddress = null;
    currentUser = null;
    currentRoom = null;
    rooms = [];
    
    // Disconnect socket
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    
    // Show "Connect Wallet" button
    document.getElementById('connectWalletBtn').style.display = 'block';
    
    // Hide connected wallet display
    document.getElementById('walletConnected').style.display = 'none';
    
    // Show connect wallet UI again
    showConnectWalletUI();
    
    // Clear conversations
    rooms = [];
    renderRooms();
    
    // Clear chat area
    const chatMessages = document.querySelector('.chat-messages');
    if (chatMessages) {
        chatMessages.innerHTML = '';
    }
    
    const emptyState = document.querySelector('.empty-state');
    if (emptyState) {
        emptyState.style.display = 'flex';
    }
}

function connectWebSocket() {
    if (!currentUser || !currentUser.id) {
        console.error('Cannot connect without authenticated user');
        return;
    }
    
    // Connect to Socket.io server
    socket = io(window.location.origin);

    socket.on('connect', () => {
        console.log('Connected to server');
        
        // Authenticate using server-side session (no client data needed)
        socket.emit('auth', {});
    });

    socket.on('auth_success', (data) => {
        currentUser = data.user;
        rooms = data.rooms;
        
        console.log('Authenticated as:', currentUser.username);
        
        renderRooms();
        
        // Auto-select public chat if no room is currently selected
        // Use setTimeout to avoid recursive render during DOM construction
        if (!currentRoom) {
            const publicRoom = rooms.find(room => room.isPublic);
            if (publicRoom) {
                setTimeout(() => selectRoom(publicRoom.id), 0);
            }
        }
        
        // Hide loading screen once authenticated
        hideLoadingScreen();
    });

    socket.on('room_created', (room) => {
        rooms.push(room);
        renderRooms();
        selectRoom(room.id);
    });

    socket.on('room_update', (room) => {
        const index = rooms.findIndex(r => r.id === room.id);
        if (index >= 0) {
            rooms[index] = room;
        } else {
            rooms.push(room);
        }
        renderRooms();
    });

    socket.on('room_joined', (data) => {
        // Update current room data
        currentRoom = data.room;
        
        // Update contact name in header
        document.getElementById('contactName').textContent = data.room.name;
        document.getElementById('contactAddress').textContent = data.room.isGroup ? 'Group Chat' : data.room.creator;
        
        // Load reactions
        messageReactions = {};
        if (data.reactions) {
            data.reactions.forEach(r => {
                if (!messageReactions[r.messageId]) {
                    messageReactions[r.messageId] = [];
                }
                messageReactions[r.messageId].push(r);
            });
        }
        
        // Display messages
        renderMessages(data.messages);
    });

    socket.on('new_message', (message) => {
        if (currentRoom && message.roomId === currentRoom.id) {
            displayMessage(message);
        }
        
        // Update room's last message in sidebar
        const room = rooms.find(r => r.id === message.roomId);
        if (room) {
            room.lastMessage = message.content;
            renderRooms();
        }
    });

    socket.on('user_typing', (data) => {
        if (currentRoom && data.roomId === currentRoom.id) {
            showTypingIndicator(data.username);
        }
    });

    socket.on('user_stop_typing', (data) => {
        hideTypingIndicator();
    });

    socket.on('reaction_added', (data) => {
        // Add reaction to local storage
        if (!messageReactions[data.messageId]) {
            messageReactions[data.messageId] = [];
        }
        
        // Check if reaction already exists (prevent duplicates)
        const existing = messageReactions[data.messageId].find(
            r => r.userId === data.userId && r.emoji === data.emoji
        );
        
        if (!existing) {
            messageReactions[data.messageId].push(data);
            renderMessageReactions(data.messageId);
        }
    });

    socket.on('reaction_removed', (data) => {
        // Remove reaction from local storage
        if (messageReactions[data.messageId]) {
            messageReactions[data.messageId] = messageReactions[data.messageId].filter(
                r => !(r.userId === data.userId && r.emoji === data.emoji)
            );
            renderMessageReactions(data.messageId);
        }
    });

    socket.on('user_stats', (stats) => {
        updateDashboardWithStats(stats);
    });

    socket.on('user_online', (user) => {
        console.log('User came online:', user.username);
    });

    socket.on('user_offline', (data) => {
        console.log('User went offline:', data.username);
    });

    socket.on('error', (data) => {
        showComingSoon('⚠️ Error', data.message);
    });
    
    socket.on('user_not_found', (data) => {
        showComingSoon('❌ User Not Connected', `The wallet address "${data.wallet}" has never connected to ZKONTROL. Ask them to connect their wallet first.`);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
}

function setupEventListeners() {
    // Mobile menu toggles
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const mobileNav = document.getElementById('mobileNav');
    const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
    const sidebar = document.querySelector('.sidebar');
    const mobileOverlay = document.getElementById('mobileOverlay');

    if (hamburgerMenu) {
        hamburgerMenu.addEventListener('click', () => {
            hamburgerMenu.classList.toggle('active');
            mobileNav.classList.toggle('active');
            mobileOverlay.classList.toggle('active');
        });
    }

    if (mobileSidebarToggle) {
        mobileSidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            mobileOverlay.classList.toggle('active');
        });
    }

    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', () => {
            // Close all mobile menus
            if (hamburgerMenu) hamburgerMenu.classList.remove('active');
            mobileNav.classList.remove('active');
            sidebar.classList.remove('active');
            mobileOverlay.classList.remove('active');
        });
    }

    // Show mobile sidebar toggle on small screens
    function checkMobileView() {
        if (window.innerWidth <= 768) {
            mobileSidebarToggle.style.display = 'block';
        } else {
            mobileSidebarToggle.style.display = 'none';
            // Reset mobile states on desktop
            if (hamburgerMenu) hamburgerMenu.classList.remove('active');
            mobileNav.classList.remove('active');
            sidebar.classList.remove('active');
            mobileOverlay.classList.remove('active');
        }
    }
    checkMobileView();
    window.addEventListener('resize', checkMobileView);

    document.getElementById('newConversationBtn').addEventListener('click', openNewConversationModal);
    document.getElementById('modalClose').addEventListener('click', closeNewConversationModal);
    document.getElementById('modalCancel').addEventListener('click', closeNewConversationModal);
    document.getElementById('modalStart').addEventListener('click', startNewConversation);
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    document.getElementById('conversationsList').addEventListener('click', (e) => {
        const btn = e.target.closest('#newConversationBtnSmall');
        if (btn) {
            openNewConversationModal();
        }
    });
    
    document.querySelector('.create-group-btn')?.addEventListener('click', openGroupChatModal);
    
    // Group chat modal listeners
    document.getElementById('groupModalClose').addEventListener('click', closeGroupChatModal);
    document.getElementById('groupModalCancel').addEventListener('click', closeGroupChatModal);
    document.getElementById('groupModalCreate').addEventListener('click', createGroupChat);
    
    // Coming soon modal listeners
    document.getElementById('comingSoonClose').addEventListener('click', closeComingSoonModal);
    document.getElementById('comingSoonOk').addEventListener('click', closeComingSoonModal);
    
    // Wallet dashboard modal listeners
    document.getElementById('walletDashboardClose').addEventListener('click', closeWalletDashboard);
    
    // Swap modal listeners
    document.getElementById('swapModalClose').addEventListener('click', closeSwapModal);
    document.getElementById('swapDirectionBtn').addEventListener('click', reverseSwapDirection);
    document.getElementById('swapExecuteBtn').addEventListener('click', executeSwap);
    document.getElementById('swapFromAmount').addEventListener('input', calculateSwapAmount);
    
    // Slippage buttons
    document.querySelectorAll('.slippage-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.slippage-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    document.getElementById('walletBtn').addEventListener('click', (e) => {
        e.preventDefault();
        showWalletDashboard();
    });
    
    document.getElementById('swapBtn').addEventListener('click', (e) => {
        e.preventDefault();
        showSwapModal();
    });
    
    // Typing indicators
    document.getElementById('messageInput').addEventListener('input', () => {
        if (currentRoom && socket) {
            socket.emit('typing', { roomId: currentRoom.id });
            
            clearTimeout(window.typingTimeout);
            window.typingTimeout = setTimeout(() => {
                socket.emit('stop_typing', { roomId: currentRoom.id });
            }, 1000);
        }
    });
    
    // AI Assistant event listeners
    document.getElementById('aiSendBtn').addEventListener('click', sendAiMessage);
    document.getElementById('aiInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendAiMessage();
        }
    });
    
    // Auto-delete timer event listeners
    const timerBtn = document.getElementById('timerBtn');
    const timerDropdown = document.getElementById('timerDropdown');
    
    timerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        timerDropdown.classList.toggle('show');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        timerDropdown.classList.remove('show');
    });
    
    // Timer option selection
    document.querySelectorAll('.timer-option').forEach(option => {
        option.addEventListener('click', function() {
            const seconds = parseInt(this.getAttribute('data-seconds'));
            setMessageTimer(seconds);
            
            // Update UI
            document.querySelectorAll('.timer-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            
            timerDropdown.classList.remove('show');
        });
    });
}

function openGroupChatModal() {
    if (!currentUser || !walletAddress) {
        showComingSoon('🔒 Connect Wallet First', 'Please connect your Phantom wallet to create group chats.');
        return;
    }
    
    document.getElementById('groupChatModal').classList.add('active');
    document.getElementById('groupChatName').focus();
}

function closeGroupChatModal() {
    document.getElementById('groupChatModal').classList.remove('active');
    document.getElementById('groupChatName').value = '';
}

function createGroupChat() {
    if (!currentUser || !walletAddress) {
        showComingSoon('🔒 Connect Wallet First', 'Please connect your Phantom wallet to create group chats.');
        closeGroupChatModal();
        return;
    }
    
    const groupName = document.getElementById('groupChatName').value.trim();
    
    if (!groupName) {
        showComingSoon('⚠️ Group Name Required', 'Please enter a name for your group chat.');
        return;
    }
    
    if (socket) {
        socket.emit('create_room', {
            name: groupName,
            isGroup: true,
            members: []
        });
    }
    
    closeGroupChatModal();
}

function showComingSoon(title, message) {
    document.getElementById('comingSoonTitle').textContent = title;
    document.getElementById('comingSoonMessage').textContent = message;
    document.getElementById('comingSoonModal').classList.add('active');
}

function closeComingSoonModal() {
    document.getElementById('comingSoonModal').classList.remove('active');
}

function showWalletDashboard() {
    // Populate stats before showing
    populateWalletStats();
    document.getElementById('walletDashboardModal').classList.add('active');
}

function closeWalletDashboard() {
    document.getElementById('walletDashboardModal').classList.remove('active');
}

function populateWalletStats() {
    // Update wallet address
    const dashboardAddress = document.getElementById('dashboardWalletAddress');
    if (walletAddress) {
        // Truncate wallet address for display
        const truncated = walletAddress.slice(0, 8) + '...' + walletAddress.slice(-6);
        dashboardAddress.textContent = truncated;
        dashboardAddress.title = walletAddress;
    } else {
        dashboardAddress.textContent = 'Not Connected';
    }
    
    // Update network activity status
    const networkStatus = socket && socket.connected ? 'Active' : 'Disconnected';
    document.getElementById('statNetworkActivity').textContent = networkStatus;
    
    // Request real stats from server
    if (socket && currentUser) {
        socket.emit('get_user_stats');
    }
}

function updateDashboardWithStats(stats) {
    // Update message count
    document.getElementById('statMessagesSent').textContent = stats.messageCount || 0;
    
    // Update conversations count
    document.getElementById('statConversations').textContent = stats.conversationCount || 0;
    
    // Update 7-day activity chart with real data
    if (stats.activityStats && stats.activityStats.length === 7) {
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const activityBars = document.querySelectorAll('.activity-bar');
        
        // Find max count for scaling
        const maxCount = Math.max(...stats.activityStats.map(s => s.count), 1);
        
        stats.activityStats.forEach((stat, index) => {
            if (activityBars[index]) {
                const barFill = activityBars[index].querySelector('.bar-fill');
                const percentage = (stat.count / maxCount) * 100;
                
                if (barFill) {
                    barFill.style.setProperty('--bar-height', `${Math.max(percentage, 5)}%`);
                }
            }
        });
    }
}

// Private Swap Functions
function showSwapModal() {
    document.getElementById('swapModal').classList.add('active');
    calculateSwapAmount();
}

function closeSwapModal() {
    document.getElementById('swapModal').classList.remove('active');
}

function reverseSwapDirection() {
    const fromToken = document.getElementById('swapFromToken');
    const toToken = document.getElementById('swapToToken');
    const fromAmount = document.getElementById('swapFromAmount');
    const toAmount = document.getElementById('swapToAmount');
    
    // Swap token icons
    const fromIcon = fromToken.querySelector('.token-icon');
    const toIcon = toToken.querySelector('.token-icon');
    [fromIcon.src, toIcon.src] = [toIcon.src, fromIcon.src];
    [fromIcon.alt, toIcon.alt] = [toIcon.alt, fromIcon.alt];
    
    // Swap token symbols
    const fromSymbol = fromToken.querySelector('.token-symbol');
    const toSymbol = toToken.querySelector('.token-symbol');
    [fromSymbol.textContent, toSymbol.textContent] = [toSymbol.textContent, fromSymbol.textContent];
    
    // Swap amounts
    const temp = fromAmount.value;
    fromAmount.value = toAmount.value || '';
    toAmount.value = temp;
    
    // Swap balances
    const solBalance = document.getElementById('solBalance');
    const usdcBalance = document.getElementById('usdcBalance');
    [solBalance.textContent, usdcBalance.textContent] = [usdcBalance.textContent, solBalance.textContent];
    
    calculateSwapAmount();
}

function calculateSwapAmount() {
    const fromAmount = parseFloat(document.getElementById('swapFromAmount').value) || 0;
    const exchangeRate = 142.5; // SOL to USDC
    const toAmount = (fromAmount * exchangeRate).toFixed(2);
    
    document.getElementById('swapToAmount').value = toAmount;
    
    // Update details
    if (fromAmount > 0) {
        const minReceived = (toAmount * 0.9912).toFixed(2); // Account for 0.88% slippage
        document.getElementById('minReceived').textContent = minReceived + ' USDC';
        document.getElementById('exchangeRate').textContent = `1 SOL = ${exchangeRate} USDC`;
    }
}

function executeSwap() {
    const fromAmount = document.getElementById('swapFromAmount').value;
    const toAmount = document.getElementById('swapToAmount').value;
    
    if (!fromAmount || parseFloat(fromAmount) === 0) {
        alert('Please enter an amount to swap');
        return;
    }
    
    // Show success animation and message
    const btn = document.getElementById('swapExecuteBtn');
    const originalText = btn.textContent;
    
    btn.textContent = '✓ Swap Confirmed!';
    btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    
    setTimeout(() => {
        closeSwapModal();
        btn.textContent = originalText;
        btn.style.background = '';
        document.getElementById('swapFromAmount').value = '';
        document.getElementById('swapToAmount').value = '';
    }, 1500);
}

function openNewConversationModal() {
    if (!currentUser || !walletAddress) {
        showComingSoon('🔒 Connect Wallet First', 'Please connect your Phantom wallet to start conversations.');
        return;
    }
    
    document.getElementById('newConversationModal').classList.add('active');
    document.getElementById('recipientAddress').focus();
}

function closeNewConversationModal() {
    document.getElementById('newConversationModal').classList.remove('active');
    document.getElementById('recipientAddress').value = '';
}

function startNewConversation() {
    const recipientWallet = document.getElementById('recipientAddress').value.trim();
    
    if (!recipientWallet) {
        showComingSoon('⚠️ Wallet Address Required', 'Please enter the recipient\'s wallet address.');
        return;
    }
    
    // Check if user is trying to chat with themselves
    if (recipientWallet === walletAddress) {
        showComingSoon('⚠️ Invalid Recipient', 'You cannot create a conversation with yourself.');
        return;
    }
    
    if (socket) {
        // Send wallet address to server to check if user exists
        socket.emit('create_private_chat', {
            recipientWallet: recipientWallet
        });
    }
    
    closeNewConversationModal();
}

function selectRoom(roomId) {
    const room = rooms.find(r => r.id === roomId);
    
    if (!room) return;
    
    currentRoom = room;
    
    // Join the room if not already joined
    if (socket) {
        socket.emit('join_room', { roomId });
    }
    
    // Update UI
    document.getElementById('chatEmptyState').style.display = 'none';
    document.getElementById('chatActive').style.display = 'flex';
    
    document.getElementById('contactName').textContent = room.name;
    document.getElementById('contactAddress').textContent = room.isGroup ? 'Group Chat' : room.creator;
    
    // Clear messages
    document.getElementById('messagesContainer').innerHTML = '';
    
    // Update sidebar selection
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-id="${roomId}"]`)?.classList.add('active');
}

// Expose selectRoom globally so onclick can access it
window.selectRoom = selectRoom;

// Set auto-delete timer
function setMessageTimer(seconds) {
    selectedTimerSeconds = seconds;
    const label = timerLabels[seconds] || 'Off';
    document.getElementById('timerLabel').textContent = label;
    
    const timerBtn = document.getElementById('timerBtn');
    if (seconds > 0) {
        timerBtn.classList.add('active');
    } else {
        timerBtn.classList.remove('active');
    }
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text || !currentRoom || !socket) return;
    
    // Calculate expiration time if timer is set
    let expiresAt = null;
    if (selectedTimerSeconds > 0) {
        const expirationDate = new Date();
        expirationDate.setSeconds(expirationDate.getSeconds() + selectedTimerSeconds);
        expiresAt = expirationDate.toISOString();
    }
    
    socket.emit('send_message', {
        roomId: currentRoom.id,
        content: text,
        expiresAt: expiresAt
    });
    
    input.value = '';
    
    // Stop typing indicator
    socket.emit('stop_typing', { roomId: currentRoom.id });
}

function displayMessage(message) {
    const container = document.getElementById('messagesContainer');
    
    const isSent = message.userId === currentUser.id;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    messageDiv.setAttribute('data-message-id', message.id);
    
    const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Check if message has expiration
    let timerHtml = '';
    if (message.expiresAt) {
        const expiresDate = new Date(message.expiresAt);
        const timeLeft = Math.max(0, Math.floor((expiresDate - new Date()) / 1000));
        
        if (timeLeft > 0) {
            timerHtml = `<div class="message-timer" data-expires="${message.expiresAt}">
                <span class="message-timer-icon">⏱️</span>
                <span class="timer-countdown">${formatTimerCountdown(timeLeft)}</span>
            </div>`;
            
            // Start countdown
            startMessageCountdown(message.id, expiresDate);
        }
    }
    
    messageDiv.innerHTML = `
        ${!isSent ? `<div class="message-username">${message.username}</div>` : ''}
        <div class="message-content">${escapeHtml(message.content)}</div>
        <div class="message-time">${time}</div>
        ${timerHtml}
        <div class="message-reactions" id="reactions-${message.id}"></div>
        <button class="add-reaction-btn" onclick="showReactionPicker(${message.id})" title="Add reaction">
            <span class="reaction-icon">😊</span>
        </button>
    `;
    
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
    
    // Render existing reactions if any
    renderMessageReactions(message.id);
}

// Reaction picker and management
const popularEmojis = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '✨'];

function showReactionPicker(messageId) {
    // Remove existing picker if any
    const existing = document.querySelector('.reaction-picker');
    if (existing) existing.remove();
    
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.innerHTML = popularEmojis.map(emoji => 
        `<button class="reaction-option" onclick="addReaction(${messageId}, '${emoji}')">${emoji}</button>`
    ).join('');
    
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    messageEl.style.position = 'relative';
    messageEl.appendChild(picker);
    
    // Close picker when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closePickerHandler(e) {
            if (!picker.contains(e.target) && !e.target.classList.contains('add-reaction-btn')) {
                picker.remove();
                document.removeEventListener('click', closePickerHandler);
            }
        });
    }, 10);
}

window.showReactionPicker = showReactionPicker;

function addReaction(messageId, emoji) {
    if (!currentUser || !currentRoom || !socket) {
        console.error('Cannot add reaction: not authenticated or no room selected');
        return;
    }
    
    // Remove picker
    const picker = document.querySelector('.reaction-picker');
    if (picker) picker.remove();
    
    // Check if user already reacted with this emoji
    const reactions = messageReactions[messageId] || [];
    const existing = reactions.find(r => r.userId === currentUser.id && r.emoji === emoji);
    
    if (existing) {
        // Remove reaction if already exists
        removeReaction(messageId, emoji);
        return;
    }
    
    // Send add reaction event
    socket.emit('add_reaction', {
        messageId,
        emoji,
        roomId: currentRoom.id
    });
}

window.addReaction = addReaction;

function removeReaction(messageId, emoji) {
    if (!currentUser || !currentRoom || !socket) return;
    
    socket.emit('remove_reaction', {
        messageId,
        emoji,
        roomId: currentRoom.id
    });
}

window.removeReaction = removeReaction;

function renderMessageReactions(messageId) {
    const container = document.getElementById(`reactions-${messageId}`);
    if (!container) return;
    
    const reactions = messageReactions[messageId] || [];
    
    if (reactions.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    // Group reactions by emoji
    const grouped = {};
    reactions.forEach(r => {
        if (!grouped[r.emoji]) {
            grouped[r.emoji] = [];
        }
        grouped[r.emoji].push(r);
    });
    
    // Render grouped reactions
    const html = Object.entries(grouped).map(([emoji, reactionList]) => {
        const count = reactionList.length;
        const userReacted = reactionList.some(r => r.userId === currentUser?.id);
        const usernames = reactionList.map(r => r.username || r.walletAddress?.slice(0, 8)).join(', ');
        
        return `<button class="reaction-bubble ${userReacted ? 'user-reacted' : ''}" 
                        onclick="removeReaction(${messageId}, '${emoji}')"
                        title="${usernames}">
                    ${emoji} ${count > 1 ? count : ''}
                </button>`;
    }).join('');
    
    container.innerHTML = html;
}

function formatTimerCountdown(seconds) {
    if (seconds >= 3600) {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    } else if (seconds >= 60) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    } else {
        return `${seconds}s`;
    }
}

function startMessageCountdown(messageId, expiresDate) {
    const interval = setInterval(() => {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageEl) {
            clearInterval(interval);
            return;
        }
        
        const timeLeft = Math.max(0, Math.floor((expiresDate - new Date()) / 1000));
        const timerEl = messageEl.querySelector('.timer-countdown');
        const messageTimerEl = messageEl.querySelector('.message-timer');
        
        if (timeLeft <= 0) {
            // Message expired - remove it with fade animation
            messageEl.style.opacity = '0';
            messageEl.style.transition = 'opacity 0.3s';
            setTimeout(() => {
                messageEl.remove();
            }, 300);
            clearInterval(interval);
        } else {
            if (timerEl) {
                timerEl.textContent = formatTimerCountdown(timeLeft);
                
                // Change color based on time left
                if (timeLeft <= 30 && messageTimerEl) {
                    messageTimerEl.classList.add('danger');
                } else if (timeLeft <= 60 && messageTimerEl) {
                    messageTimerEl.classList.add('warning');
                }
            }
        }
    }, 1000);
}

function renderMessages(messages) {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';
    
    messages.forEach(message => {
        displayMessage(message);
    });
}

function renderRooms() {
    const container = document.getElementById('conversationsList');
    
    if (rooms.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <p class="empty-title">No conversations yet</p>
                <p class="empty-subtitle">Start a new conversation to begin messaging.</p>
                <button class="new-conversation-btn-small" id="newConversationBtnSmall">
                    ➕ New Conversation
                </button>
            </div>
        `;
        
        // Re-attach event listener for the new button
        document.getElementById('newConversationBtnSmall')?.addEventListener('click', openNewConversationModal);
        return;
    }
    
    // Separate public rooms from regular rooms
    const publicRooms = rooms.filter(room => room.isPublic);
    const regularRooms = rooms.filter(room => !room.isPublic);
    
    // Render public rooms first, then regular rooms
    const allRooms = [...publicRooms, ...regularRooms];
    
    const html = allRooms.map(room => {
        const lastMessage = room.messages?.length > 0 
            ? room.messages[room.messages.length - 1].content 
            : room.lastMessage || 'No messages yet';
        
        const avatar = room.isPublic ? '🌐' : (room.isGroup ? '👥' : '👤');
        const badge = room.isPublic ? '<span class="public-badge">Public</span>' : '';
        
        return `
            <div class="conversation-item ${room.isPublic ? 'public-room' : ''} ${currentRoom?.id === room.id ? 'active' : ''}" data-id="${room.id}" onclick="window.selectRoom(${room.id})">
                <div class="conversation-avatar">${avatar}</div>
                <div class="conversation-info">
                    <div class="conversation-header">
                        <span class="conversation-name">${escapeHtml(room.name)} ${badge}</span>
                        <span class="conversation-time">${formatTime(room.createdAt)}</span>
                    </div>
                    <div class="conversation-preview">${escapeHtml(lastMessage)}</div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

function showTypingIndicator(username) {
    const container = document.getElementById('messagesContainer');
    
    // Remove existing typing indicator
    const existing = container.querySelector('.typing-indicator');
    if (existing) existing.remove();
    
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = `<div class="message-username">${username}</div><div class="typing-dots"><span>•</span><span>•</span><span>•</span></div>`;
    
    container.appendChild(indicator);
    container.scrollTop = container.scrollHeight;
}

function hideTypingIndicator() {
    const indicator = document.querySelector('.typing-indicator');
    if (indicator) indicator.remove();
}

// AI Assistant Functions
async function sendAiMessage() {
    const input = document.getElementById('aiInput');
    const sendBtn = document.getElementById('aiSendBtn');
    const messagesContainer = document.getElementById('aiMessages');
    
    const message = input.value.trim();
    
    if (!message) return;
    
    if (!currentUser || !walletAddress) {
        showComingSoon('🔒 Connect Wallet First', 'Please connect your Phantom wallet to use the AI Assistant.');
        return;
    }
    
    // Clear input and disable button
    input.value = '';
    sendBtn.disabled = true;
    
    // Add user message to chat
    addAiMessage(message, 'user');
    
    // Show loading indicator
    const loadingId = addAiMessage('Thinking...', 'loading');
    
    try {
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });
        
        const data = await response.json();
        
        // Remove loading indicator
        removeAiMessage(loadingId);
        
        if (data.success) {
            addAiMessage(data.response, 'bot');
        } else {
            addAiMessage('Sorry, I encountered an error. Please try again.', 'bot');
        }
    } catch (error) {
        console.error('AI chat error:', error);
        removeAiMessage(loadingId);
        addAiMessage('Sorry, I\'m having trouble connecting. Please try again later.', 'bot');
    } finally {
        sendBtn.disabled = false;
        input.focus();
    }
}

function addAiMessage(content, type) {
    const messagesContainer = document.getElementById('aiMessages');
    const messageId = `ai-msg-${Date.now()}`;
    
    const messageDiv = document.createElement('div');
    messageDiv.id = messageId;
    messageDiv.className = `ai-message ai-${type}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'ai-message-content';
    contentDiv.textContent = content;
    
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return messageId;
}

function removeAiMessage(messageId) {
    const message = document.getElementById(messageId);
    if (message) {
        message.remove();
    }
}

// UI helper functions for Phantom wallet
function showConnectWalletUI() {
    // Show connect wallet button in the empty state
    const emptyState = document.querySelector('.empty-state');
    if (emptyState) {
        emptyState.innerHTML = `
            <div class="message-icon">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
            </div>
            <h2>Connect Your Phantom Wallet</h2>
            <p>Connect your Solana wallet to start private, secure conversations.</p>
            <button onclick="connectPhantomWallet()" class="btn-primary" style="margin-top: 20px; padding: 12px 32px; font-size: 16px; background: var(--purple-primary);">
                <span style="margin-right: 8px;">🔗</span> Connect Wallet
            </button>
        `;
        emptyState.style.display = 'flex';
    }
}

function hideConnectWalletUI() {
    const emptyState = document.querySelector('.empty-state');
    if (emptyState && rooms.length === 0) {
        emptyState.innerHTML = `
            <div class="message-icon">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
            </div>
            <h2>Start a Conversation</h2>
            <p>Select an existing conversation from the sidebar or start a new one.</p>
        `;
    }
}

function showPhantomNotInstalled() {
    const emptyState = document.querySelector('.empty-state');
    if (emptyState) {
        emptyState.innerHTML = `
            <div class="message-icon">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
            </div>
            <h2>Phantom Wallet Not Detected</h2>
            <p>ZKONTROL requires Phantom wallet for secure authentication.</p>
            <a href="https://phantom.app/" target="_blank" class="btn-primary" style="margin-top: 20px; padding: 12px 32px; font-size: 16px; background: var(--purple-primary); text-decoration: none; display: inline-block;">
                Install Phantom Wallet
            </a>
            <p style="margin-top: 16px; font-size: 14px; color: var(--text-muted);">After installing, refresh this page</p>
        `;
        emptyState.style.display = 'flex';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
}

// Matrix background animation
function initializeMatrixBackground() {
    const canvas = document.getElementById('matrixCanvas');
    const ctx = canvas.getContext('2d');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const charArray = chars.split('');

    const fontSize = 14;
    const columns = canvas.width / fontSize;

    const drops = [];
    for (let i = 0; i < columns; i++) {
        drops[i] = Math.random() * canvas.height / fontSize;
    }

    function draw() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#a78bfa';
        ctx.font = fontSize + 'px monospace';

        for (let i = 0; i < drops.length; i++) {
            const text = charArray[Math.floor(Math.random() * charArray.length)];
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);

            if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }

            drops[i]++;
        }
    }

    setInterval(draw, 60);

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

// Hide loading screen
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.classList.add('hidden');
            // Remove from DOM after animation
            setTimeout(() => {
                loadingScreen.remove();
            }, 500);
        }, 300); // Small delay for smooth transition
    }
}

// Initialize on load
window.addEventListener('DOMContentLoaded', init);
