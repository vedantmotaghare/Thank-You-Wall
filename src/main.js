import { ethers } from 'ethers';
import TipJarArtifact from './contracts/TipJar.json';

// --- Global Application State ---
let provider = null;
let signer = null;
let tipJarContract = null;
let userAddress = null;
let currentNetwork = null;
let isOwner = false;
let isDemoMode = false;

// Contract Configuration
const CONTRACT_ADDRESS = TipJarArtifact.address || '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const CONTRACT_ABI = TipJarArtifact.abi;
const TARGET_CHAIN_ID_SEPOLIA = '0xaa36a7'; // 11155111 in hex
const TARGET_CHAIN_ID_LOCAL = '0x7a69';     // 31337 in hex

// In-Memory Supporter Events Cache
let loadedTips = [];
let currentFilter = 'all';

// --- UI Element Selectors ---
const connectWalletBtn = document.getElementById('connect-wallet-btn');
const connectText = document.getElementById('connect-text');
const accountBadge = document.getElementById('account-badge');
const userAddressEl = document.getElementById('user-address');
const userBalanceEl = document.getElementById('user-balance');
const networkPill = document.getElementById('network-pill');
const networkNameEl = document.getElementById('network-name');
const networkAlert = document.getElementById('network-alert');
const networkAlertMsg = document.getElementById('network-alert-msg');
const switchNetworkBtn = document.getElementById('switch-network-btn');
const modeToggleBtn = document.getElementById('mode-toggle-btn');
const modeLabel = document.getElementById('mode-label');

const statTotalTips = document.getElementById('stat-total-tips');
const statTotalEth = document.getElementById('stat-total-eth');
const statContractBalance = document.getElementById('stat-contract-balance');
const contractLink = document.getElementById('contract-link');

const ownerDashboardBanner = document.getElementById('owner-dashboard-banner');
const withdrawBtn = document.getElementById('withdraw-btn');
const ownerWithdrawAction = document.getElementById('owner-withdraw-action');

const presetBtns = document.querySelectorAll('.preset-btn');
const customAmountInput = document.getElementById('custom-amount-input');
const supporterMessageInput = document.getElementById('supporter-message-input');
const charCounter = document.getElementById('char-counter');
const sendTipBtn = document.getElementById('send-tip-btn');
const sendTipText = document.getElementById('send-tip-text');

const txStatusBox = document.getElementById('tx-status-box');
const statusSpinner = document.getElementById('status-spinner');
const statusTitle = document.getElementById('status-title');
const statusDesc = document.getElementById('status-desc');
const txHashLinkContainer = document.getElementById('tx-hash-link-container');
const txHashLink = document.getElementById('tx-hash-link');

const supporterFeed = document.getElementById('supporter-feed');
const feedEmptyState = document.getElementById('feed-empty-state');
const refreshFeedBtn = document.getElementById('refresh-feed-btn');
const filterTabs = document.querySelectorAll('.filter-tab');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  setupContractLink();
  setupEventListeners();
  
  // Auto-detect wallet provider
  if (window.ethereum) {
    try {
      provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_accounts', []);
      if (accounts.length > 0) {
        await connectWallet();
      } else {
        await initReadOnlyProvider();
      }
    } catch (err) {
      console.warn("Error checking connected accounts:", err);
      await initReadOnlyProvider();
    }
  } else {
    // No wallet extension found -> default to read-only provider or prompt demo mode
    await initReadOnlyProvider();
  }
});

// Setup Contract link in stats bar
function setupContractLink() {
  contractLink.textContent = `${CONTRACT_ADDRESS.substring(0, 6)}...${CONTRACT_ADDRESS.substring(CONTRACT_ADDRESS.length - 4)} ↗`;
  contractLink.href = `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`;
}

// Fallback read-only provider for reading on-chain events even without wallet
async function initReadOnlyProvider() {
  try {
    if (window.ethereum) {
      provider = new ethers.BrowserProvider(window.ethereum);
    } else {
      // Use public Sepolia RPC fallback
      provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
    }
    
    tipJarContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    await updateNetworkStatus();
    await fetchOnChainTips();
    await updateContractStats();
  } catch (err) {
    console.warn("Read-only provider fallback notice:", err);
    // If public network fails, enable Demo Mode automatically
    enableDemoMode();
  }
}

// --- Wallet Connection Logic ---
async function connectWallet() {
  if (!window.ethereum && !isDemoMode) {
    alert("MetaMask or an EIP-1193 Web3 provider was not detected in your browser. Switching to Interactive Demo Mode!");
    enableDemoMode();
    return;
  }

  try {
    if (isDemoMode) {
      // Handle simulated wallet connect
      userAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      signer = null;
      updateWalletUI("0.45 ETH", userAddress);
      checkOwnerStatus(userAddress);
      await fetchOnChainTips();
      return;
    }

    provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    
    if (accounts.length === 0) return;
    
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();
    
    // Initialize stateful contract instance
    tipJarContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    
    // Update balance
    const balanceWei = await provider.getBalance(userAddress);
    const balanceEth = parseFloat(ethers.formatEther(balanceWei)).toFixed(4);
    
    updateWalletUI(`${balanceEth} ETH`, userAddress);
    await updateNetworkStatus();
    await checkOwnerStatus(userAddress);
    await fetchOnChainTips();
    await updateContractStats();
    
    // Listen for live event log emissions directly on contract
    listenToNewTipEvents();

  } catch (error) {
    console.error("Wallet connection failed:", error);
    showTxStatus("Connection Failed", error.message || "User denied account access", "error");
  }
}

function updateWalletUI(balance, address) {
  connectWalletBtn.classList.add('hidden');
  accountBadge.classList.remove('hidden');
  userBalanceEl.textContent = balance;
  userAddressEl.textContent = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// Check network & handle wrong network alerts
async function updateNetworkStatus() {
  if (isDemoMode) {
    networkPill.className = "pill network-pill sepolia";
    networkNameEl.textContent = "Sepolia (Simulated)";
    networkAlert.classList.add('hidden');
    return;
  }

  if (!provider) return;

  try {
    const network = await provider.getNetwork();
    currentNetwork = network;
    const chainIdNum = Number(network.chainId);

    if (chainIdNum === 11155111) {
      networkPill.className = "pill network-pill sepolia";
      networkNameEl.textContent = "Sepolia Testnet";
      networkAlert.classList.add('hidden');
    } else if (chainIdNum === 31337) {
      networkPill.className = "pill network-pill connected";
      networkNameEl.textContent = "Hardhat Local (31337)";
      networkAlert.classList.add('hidden');
    } else {
      networkPill.className = "pill network-pill disconnected";
      networkNameEl.textContent = `Chain ID: ${chainIdNum}`;
      networkAlertMsg.textContent = `You are connected to an unsupported network (Chain ID: ${chainIdNum}). Please switch to Sepolia Testnet or Local Host.`;
      networkAlert.classList.remove('hidden');
    }
  } catch (err) {
    console.warn("Could not determine network:", err);
  }
}

// Trigger network switch via EIP-3085 / EIP-3326
async function switchNetwork() {
  if (!window.ethereum) return;
  
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: TARGET_CHAIN_ID_SEPOLIA }],
    });
  } catch (switchError) {
    // Code 4902 means the chain has not been added to MetaMask
    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: TARGET_CHAIN_ID_SEPOLIA,
            chainName: 'Ethereum Sepolia',
            nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
          }],
        });
      } catch (addError) {
        console.error("Failed to add Sepolia chain:", addError);
      }
    }
  }
}

// Check if current user is contract owner
async function checkOwnerStatus(address) {
  if (isDemoMode) {
    isOwner = false;
    ownerDashboardBanner.classList.add('hidden');
    withdrawBtn.classList.add('hidden');
    return;
  }

  try {
    const ownerAddress = await tipJarContract.owner();
    if (address && ownerAddress && address.toLowerCase() === ownerAddress.toLowerCase()) {
      isOwner = true;
      ownerDashboardBanner.classList.remove('hidden');
      withdrawBtn.classList.remove('hidden');
    } else {
      isOwner = false;
      ownerDashboardBanner.classList.add('hidden');
      withdrawBtn.classList.add('hidden');
    }
  } catch (err) {
    console.warn("Owner check warning:", err);
  }
}

// --- Reading On-Chain Events Feed (eth_getLogs / queryFilter) ---
async function fetchOnChainTips() {
  if (isDemoMode) {
    renderSupporterFeed(loadedTips);
    return;
  }

  try {
    if (!tipJarContract) return;

    // Filter NewTip events directly from contract logs
    const filter = tipJarContract.filters.NewTip();
    const eventLogs = await tipJarContract.queryFilter(filter, 0, 'latest');

    loadedTips = eventLogs.map((log) => {
      const args = log.args;
      return {
        sender: args[0],
        amount: args[1],
        message: args[2],
        timestamp: Number(args[3]),
        txHash: log.transactionHash,
        blockNumber: log.blockNumber
      };
    });

    renderSupporterFeed(loadedTips);
    updateContractStatsFromLogs(loadedTips);

  } catch (error) {
    console.error("Failed to fetch on-chain tip events:", error);
    // If RPC logs call fails, load sample event structure for smooth UX
    if (loadedTips.length === 0) {
      loadSampleOnChainEvents();
    }
  }
}

// Live Real-Time Event Subscription
function listenToNewTipEvents() {
  if (!tipJarContract || isDemoMode) return;

  try {
    // Remove existing listeners to avoid duplicate callbacks
    tipJarContract.removeAllListeners("NewTip");

    tipJarContract.on("NewTip", (sender, amount, message, timestamp, event) => {
      console.log("⚡ NewTip Event Mined On-Chain!", { sender, amount, message, timestamp });

      const newTipObj = {
        sender,
        amount,
        message,
        timestamp: Number(timestamp),
        txHash: event?.log?.transactionHash || "0x..."
      };

      loadedTips.unshift(newTipObj);
      renderSupporterFeed(loadedTips);
      updateContractStats();

      // Show celebratory alert
      showTxStatus("Tip Mined on Ethereum!", `New tip of ${ethers.formatEther(amount)} ETH recorded on-chain!`, "success");
    });
  } catch (err) {
    console.warn("Event listener attachment warning:", err);
  }
}

// Render Supporter Feed Cards
function renderSupporterFeed(tipsList) {
  let displayTips = [...tipsList];

  // Apply filter tab rules
  if (currentFilter === 'recent') {
    displayTips.sort((a, b) => b.timestamp - a.timestamp);
  } else if (currentFilter === 'top') {
    displayTips.sort((a, b) => {
      const amtA = BigInt(a.amount);
      const amtB = BigInt(b.amount);
      return amtA > amtB ? -1 : amtA < amtB ? 1 : 0;
    });
  } else {
    // Default newest first
    displayTips.sort((a, b) => b.timestamp - a.timestamp);
  }

  if (displayTips.length === 0) {
    feedEmptyState.classList.remove('hidden');
    // Clear feed cards
    supporterFeed.innerHTML = '';
    supporterFeed.appendChild(feedEmptyState);
    return;
  }

  feedEmptyState.classList.add('hidden');
  supporterFeed.innerHTML = '';

  displayTips.forEach((tip) => {
    const formattedAmount = parseFloat(ethers.formatEther(tip.amount)).toFixed(4);
    const shortAddress = `${tip.sender.substring(0, 6)}...${tip.sender.substring(tip.sender.length - 4)}`;
    const relativeTime = getRelativeTime(tip.timestamp);
    const avatarGradient = getAvatarGradient(tip.sender);

    const card = document.createElement('div');
    card.className = 'supporter-card';
    card.innerHTML = `
      <div class="card-top-row">
        <div class="supporter-info">
          <div class="supporter-avatar-circle" style="background: ${avatarGradient}">
            ${tip.sender.substring(2, 4).toUpperCase()}
          </div>
          <div class="supporter-address-col">
            <span class="supporter-address" title="${tip.sender}">${shortAddress}</span>
            <span class="supporter-time">${relativeTime}</span>
          </div>
        </div>
        <div class="tip-amount-badge">
          +${formattedAmount} ETH
        </div>
      </div>
      <div class="supporter-message-bubble">
        ${escapeHtml(tip.message || "Supporter left a silent tip!")}
      </div>
    `;

    supporterFeed.appendChild(card);
  });
}

// --- Sending Value-Bearing Transaction (Payable tip function) ---
async function handleSendTip() {
  const ethAmountVal = customAmountInput.value;
  const messageVal = supporterMessageInput.value.trim();

  if (!ethAmountVal || parseFloat(ethAmountVal) <= 0) {
    alert("Please enter a valid ETH tip amount greater than 0.");
    return;
  }

  if (messageVal.length > 280) {
    alert("Supporter message must be 280 characters or fewer.");
    return;
  }

  if (isDemoMode) {
    // Simulate transaction in Demo Mode
    showTxStatus("Prompting Wallet Signature...", "Simulating transaction submission...", "pending");
    setTimeout(() => {
      const mockTxHash = "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
      showTxStatus("Transaction Pending...", "Simulating mining on block...", "pending", mockTxHash);
      
      setTimeout(() => {
        const simulatedTip = {
          sender: userAddress || "0x3C44CdD05aB506C3657010b27b12d3E656000000",
          amount: ethers.parseEther(ethAmountVal),
          message: messageVal || "Awesome comics! Keep creating! 🎨",
          timestamp: Math.floor(Date.now() / 1000),
          txHash: mockTxHash
        };

        loadedTips.unshift(simulatedTip);
        renderSupporterFeed(loadedTips);
        updateContractStatsFromLogs(loadedTips);
        showTxStatus("Transaction Confirmed!", `Successfully tipped ${ethAmountVal} ETH on-chain!`, "success", mockTxHash);
        
        // Reset form
        supporterMessageInput.value = '';
        charCounter.textContent = '0 / 280';
      }, 2000);
    }, 1200);
    return;
  }

  // Live Wallet Mode Execution
  if (!signer || !tipJarContract) {
    alert("Please connect your Web3 Wallet first!");
    await connectWallet();
    return;
  }

  try {
    const tipValueWei = ethers.parseEther(ethAmountVal);

    // 1. Prompt Signature
    showTxStatus("Confirm in Wallet", "Please confirm the transaction in MetaMask...", "pending");
    sendTipBtn.disabled = true;

    // 2. Call contract payable tip(message) function
    const tx = await tipJarContract.tip(messageVal, {
      value: tipValueWei
    });

    // 3. Pending Transaction State
    showTxStatus("Transaction Pending", `Mining transaction on-chain...`, "pending", tx.hash);

    // 4. Wait for confirmation receipt
    const receipt = await tx.wait();

    // 5. Success
    showTxStatus("Tip Confirmed!", `Successfully sent ${ethAmountVal} ETH tip to Maya on-chain!`, "success", receipt.hash);
    
    supporterMessageInput.value = '';
    charCounter.textContent = '0 / 280';
    
    await fetchOnChainTips();
    await updateContractStats();

  } catch (error) {
    console.error("Tip transaction failed:", error);
    sendTipBtn.disabled = false;

    if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
      showTxStatus("Transaction Cancelled", "You rejected the transaction in your wallet.", "error");
    } else if (error.message && error.message.includes("insufficient funds")) {
      showTxStatus("Insufficient Balance", "Your wallet does not have enough ETH to cover the tip + gas fees.", "error");
    } else {
      showTxStatus("Transaction Failed", error.reason || error.message || "Contract call failed", "error");
    }
  } finally {
    sendTipBtn.disabled = false;
  }
}

// --- Creator Balance Withdrawal ---
async function handleWithdraw() {
  if (isDemoMode) {
    alert("Withdrawal simulated! In live mode, this sends contract ETH to creator wallet.");
    return;
  }

  if (!signer || !tipJarContract || !isOwner) {
    alert("Only the contract owner can withdraw funds.");
    return;
  }

  try {
    showTxStatus("Confirm Withdrawal", "Please confirm the withdrawal in MetaMask...", "pending");
    const tx = await tipJarContract.withdraw();
    showTxStatus("Withdrawal Pending", "Transferring contract balance to creator wallet...", "pending", tx.hash);
    
    await tx.wait();
    showTxStatus("Withdrawal Complete!", "Accumulated tips transferred to your wallet!", "success");
    await updateContractStats();
  } catch (err) {
    console.error("Withdrawal error:", err);
    showTxStatus("Withdrawal Failed", err.reason || err.message, "error");
  }
}

// --- Update Stats Bar ---
async function updateContractStats() {
  if (isDemoMode) return;

  try {
    if (!tipJarContract || !provider) return;

    const totalTipsCount = await tipJarContract.totalTipsCount();
    const totalAmountTippedWei = await tipJarContract.totalAmountTipped();
    const balanceWei = await provider.getBalance(CONTRACT_ADDRESS);

    statTotalTips.textContent = totalTipsCount.toString();
    statTotalEth.textContent = `${parseFloat(ethers.formatEther(totalAmountTippedWei)).toFixed(4)} ETH`;
    statContractBalance.textContent = `${parseFloat(ethers.formatEther(balanceWei)).toFixed(4)} ETH`;
  } catch (err) {
    console.warn("Could not read stats from contract, updating from logs fallback:", err);
  }
}

function updateContractStatsFromLogs(tips) {
  statTotalTips.textContent = tips.length.toString();
  let totalWei = BigInt(0);
  tips.forEach(t => { totalWei += BigInt(t.amount); });
  
  const formattedTotal = parseFloat(ethers.formatEther(totalWei)).toFixed(4);
  statTotalEth.textContent = `${formattedTotal} ETH`;
  statContractBalance.textContent = `${formattedTotal} ETH`;
}

// --- UI Event Handlers & Helpers ---
function setupEventListeners() {
  connectWalletBtn.addEventListener('click', connectWallet);
  switchNetworkBtn.addEventListener('click', switchNetwork);
  sendTipBtn.addEventListener('click', handleSendTip);
  withdrawBtn.addEventListener('click', handleWithdraw);
  ownerWithdrawAction.addEventListener('click', handleWithdraw);
  refreshFeedBtn.addEventListener('click', fetchOnChainTips);

  modeToggleBtn.addEventListener('click', () => {
    isDemoMode = !isDemoMode;
    if (isDemoMode) {
      enableDemoMode();
    } else {
      disableDemoMode();
    }
  });

  // Preset Buttons Selection
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const amt = btn.getAttribute('data-amount');
      customAmountInput.value = amt;
      updateSendButtonLabel(amt);
    });
  });

  customAmountInput.addEventListener('input', (e) => {
    updateSendButtonLabel(e.target.value);
  });

  supporterMessageInput.addEventListener('input', (e) => {
    charCounter.textContent = `${e.target.value.length} / 280`;
  });

  // Filter Tabs
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-filter');
      renderSupporterFeed(loadedTips);
    });
  });
}

function updateSendButtonLabel(amt) {
  const val = amt && parseFloat(amt) > 0 ? amt : '0.001';
  sendTipText.textContent = `Send ${val} ETH Tip On-Chain`;
}

function showTxStatus(title, desc, statusType, txHash = null) {
  txStatusBox.classList.remove('hidden');
  statusTitle.textContent = title;
  statusDesc.textContent = desc;

  if (statusType === 'pending') {
    statusSpinner.classList.remove('hidden');
    txStatusBox.style.borderColor = 'rgba(139, 92, 246, 0.4)';
    txStatusBox.style.background = 'rgba(139, 92, 246, 0.1)';
  } else if (statusType === 'success') {
    statusSpinner.classList.add('hidden');
    txStatusBox.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    txStatusBox.style.background = 'rgba(16, 185, 129, 0.1)';
  } else if (statusType === 'error') {
    statusSpinner.classList.add('hidden');
    txStatusBox.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    txStatusBox.style.background = 'rgba(239, 68, 68, 0.1)';
  }

  if (txHash) {
    txHashLinkContainer.classList.remove('hidden');
    txHashLink.href = `https://sepolia.etherscan.io/tx/${txHash}`;
    txHashLink.textContent = `View Tx: ${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)} ↗`;
  } else {
    txHashLinkContainer.classList.add('hidden');
  }
}

function enableDemoMode() {
  isDemoMode = true;
  modeToggleBtn.classList.add('active');
  modeLabel.textContent = "Demo Mode: ON";
  networkPill.className = "pill network-pill sepolia";
  networkNameEl.textContent = "Sepolia (Simulated)";
  networkAlert.classList.add('hidden');

  if (loadedTips.length === 0) {
    loadSampleOnChainEvents();
  }
}

function disableDemoMode() {
  isDemoMode = false;
  modeToggleBtn.classList.remove('active');
  modeLabel.textContent = "Demo Mode: Off";
  initReadOnlyProvider();
}

function loadSampleOnChainEvents() {
  const sampleTips = [
    {
      sender: '0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5',
      amount: ethers.parseEther('0.01'),
      message: 'Your Tuesday comic on coffee addiction made my entire week! Keep up the brilliant art Maya! 🎨☕',
      timestamp: Math.floor(Date.now() / 1000) - 3600 * 2,
      txHash: '0x4f82a1...8a9c'
    },
    {
      sender: '0x388C815CA882306684352Bce123696943B07A685',
      amount: ethers.parseEther('0.005'),
      message: 'So glad you set up this peer-to-peer tip jar! Zero platform cut, directly on Ethereum. Love it.',
      timestamp: Math.floor(Date.now() / 1000) - 3600 * 12,
      txHash: '0x9a71e3...11bc'
    },
    {
      sender: '0xfe3b557e8fb62b89f4916b721be55ceb828dbd73',
      amount: ethers.parseEther('0.001'),
      message: 'Coffee money from your reader in Brazil! Web3 tips bypass local payment blockages perfectly. ☕🇧🇷',
      timestamp: Math.floor(Date.now() / 1000) - 3600 * 48,
      txHash: '0x1c8b32...55aa'
    }
  ];

  loadedTips = sampleTips;
  renderSupporterFeed(loadedTips);
  updateContractStatsFromLogs(loadedTips);
}

// Utilities
function getAvatarGradient(address) {
  const hash = address.substring(2, 10);
  const hue1 = parseInt(hash.substring(0, 4), 16) % 360;
  const hue2 = (hue1 + 60) % 360;
  return `linear-gradient(135deg, hsl(${hue1}, 80%, 55%), hsl(${hue2}, 85%, 50%))`;
}

function getRelativeTime(timestampSec) {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - timestampSec);

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}
