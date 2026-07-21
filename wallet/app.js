/**
 * Incentives Wallet — BSC wallet for INC token
 * Uses ethers.js v6 for blockchain interaction
 */

// BSC Mainnet config
const BSC_RPC = "https://bsc-dataseed.binance.org";
const BSC_CHAIN_ID = 56;
const PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";

// INC Token contract — update after deployment
let INC_CONTRACT = localStorage.getItem("inc_contract") || "";

// Stablecoin contracts on BSC mainnet
const STABLECOINS = {
    USDT: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, name: "Tether USD", icon: "T", color: "#26a17b" },
    USDC: { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18, name: "USD Coin", icon: "U", color: "#2775ca" },
    BUSD: { address: "0xe9e7cea3dedca5984780bafc599bd69add087d56", decimals: 18, name: "Binance USD", icon: "B", color: "#f0b90b" },
    DAI:  { address: "0x1af3f329e963e609a3a4f2173050835a825754b0", decimals: 18, name: "Dai Stablecoin", icon: "D", color: "#f5ac37" },
};

// All supported tokens
const ALL_TOKENS = {
    BNB: { symbol: "BNB", name: "Binance Coin", decimals: 18, native: true, icon: "B", color: "#f0b90b" },
    INC: { symbol: "INC", name: "Incentives", decimals: 18, address: "", icon: "I", color: "linear-gradient(135deg, #ff6b9d, #c44dff)" },
    USDT: { ...STABLECOINS.USDT, symbol: "USDT" },
    USDC: { ...STABLECOINS.USDC, symbol: "USDC" },
    BUSD: { ...STABLECOINS.BUSD, symbol: "BUSD" },
    DAI:  { ...STABLECOINS.DAI, symbol: "DAI" },
};

// Token contracts cache
let tokenContracts = {};

// ERC-20 ABI (minimal)
const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// State
let provider = null;
let wallet = null;
let incContract = null;
let bnbPrice = 0;
let incPrice = 0;
let tokenBalances = {};

// API config for tag registry
const API_BASE = window.location.protocol === "https:" ? window.location.origin.replace(/:\d+$/, "") + ":8546" : "http://localhost:8546";
const TAG_API = localStorage.getItem("wallet_api_url") || API_BASE;
const API_TOKEN = localStorage.getItem("wallet_api_token") || "";

// Fee config
const FEE_PERCENT = 0.005; // 0.5%
const FEE_WALLET = "0x7Fb10c467319Dd4C9CEB3fcF018C2101a0842D8d";

// Cash App config
const CASHAPP_TAG = "JustinHawpetoss6";
const CASHAPP_PAY_URL = `https://cash.app/$${CASHAPP_TAG}`;
const SQUARE_APP_ID = localStorage.getItem("square_app_id") || ""; // Set via Square Developer dashboard
const SQUARE_LOCATION_ID = localStorage.getItem("square_location_id") || "";

function updateFeeDisplay() {
    const amountStr = $("send-amount").value.trim();
    const feeBox = $("fee-info");
    if (!amountStr || isNaN(parseFloat(amountStr))) {
        feeBox.style.display = "none";
        return;
    }
    const amount = parseFloat(amountStr);
    const fee = amount * FEE_PERCENT;
    const recipientGets = amount - fee;
    const token = $("send-token").value.toUpperCase();
    feeBox.style.display = "block";
    $("fee-amount-display").textContent = amount.toFixed(6) + " " + token;
    $("fee-charge-display").textContent = fee.toFixed(6) + " " + token;
    $("fee-recipient-display").textContent = recipientGets.toFixed(6) + " " + token;
}

// ===== UTILITIES =====

function $(id) { return document.getElementById(id); }

function showAlert(type, msg, autoDismiss = true) {
    const container = $("alert-container");
    const el = document.createElement("div");
    el.className = `alert ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    if (autoDismiss) {
        setTimeout(() => el.remove(), 5000);
    }
    return el;
}

function clearAlerts() {
    $("alert-container").innerHTML = "";
}

function showView(viewId) {
    const views = ["view-create", "view-import", "view-mnemonic", "view-wallet", "view-loading"];
    views.forEach(v => $(v).classList.add("hidden"));
    $(viewId).classList.remove("hidden");
}

function showPage(pageId) {
    const pages = ["page-dashboard", "page-buy", "page-send", "page-receive", "page-tags", "page-history"];
    pages.forEach(p => { const el = $(p); if (el) el.classList.add("hidden"); });
    const page = $(pageId);
    if (page) page.classList.remove("hidden");

    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    const navMap = { "page-dashboard": 0, "page-buy": 1, "page-send": 2, "page-receive": 3, "page-tags": 4, "page-history": 5 };
    const navItems = document.querySelectorAll(".nav-item");
    if (navMap[pageId] !== undefined && navItems[navMap[pageId]]) navItems[navMap[pageId]].classList.add("active");
    if (pageId === "page-buy") updateBuyDisplay();
    if (pageId === "page-receive") updateReceiveQR();
}

function shortenAddr(addr) {
    if (!addr) return "0x0000...0000";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showAlert("success", "Copied to clipboard!");
    }).catch(() => {
        showAlert("error", "Failed to copy");
    });
}

function saveWallet(pk) {
    localStorage.setItem("inc_wallet_pk", pk);
}

function loadWallet() {
    return localStorage.getItem("inc_wallet_pk");
}

function clearWallet() {
    localStorage.removeItem("inc_wallet_pk");
}

// ===== WALLET CREATION =====

async function createWallet() {
    try {
        showView("view-loading");
        $("loading-text").textContent = "Generating wallet...";

        const { ethers } = window.ethers;
        const newWallet = ethers.Wallet.createRandom();

        // Store the mnemonic for display and private key for session
        window._pendingMnemonic = newWallet.mnemonic.phrase;
        window._pendingPrivateKey = newWallet.privateKey;

        // Show mnemonic
        $("mnemonic-text").textContent = newWallet.mnemonic.phrase;
        showView("view-mnemonic");
    } catch (e) {
        showAlert("error", "Failed to create wallet: " + e.message);
        showView("view-create");
    }
}

// ===== WALLET IMPORT =====

async function importWallet() {
    const input = $("import-input").value.trim();
    if (!input) {
        showAlert("error", "Please enter a private key or mnemonic phrase");
        return;
    }

    try {
        showView("view-loading");
        $("loading-text").textContent = "Importing wallet...";

        const { ethers } = window.ethers;
        let importedWallet;

        if (input.startsWith("0x") && input.length === 66) {
            // Private key
            importedWallet = new ethers.Wallet(input);
        } else if (input.split(" ").length === 12 || input.split(" ").length === 24) {
            // Mnemonic
            importedWallet = ethers.Wallet.fromPhrase(input);
        } else {
            showAlert("error", "Invalid input. Enter a private key (0x...) or 12/24 word mnemonic.");
            showView("view-import");
            return;
        }

        saveWallet(importedWallet.privateKey);
        await initWallet(importedWallet.privateKey);
    } catch (e) {
        showAlert("error", "Failed to import: " + e.message);
        showView("view-import");
    }
}

// ===== INIT WALLET =====

async function initWallet(privateKey) {
    try {
        showView("view-loading");
        $("loading-text").textContent = "Connecting to BSC...";

        const { ethers } = window.ethers;
        provider = new ethers.JsonRpcProvider(BSC_RPC);
        wallet = new ethers.Wallet(privateKey, provider);

        // Display address
        $("wallet-address").textContent = shortenAddr(wallet.address);
        $("receive-address").textContent = wallet.address;

        // Init INC contract if address is set
        if (INC_CONTRACT) {
            incContract = new ethers.Contract(INC_CONTRACT, ERC20_ABI, wallet);
            ALL_TOKENS.INC.address = INC_CONTRACT;
        }

        // Init stablecoin contracts
        for (const [sym, info] of Object.entries(STABLECOINS)) {
            tokenContracts[sym] = new ethers.Contract(info.address, ERC20_ABI, wallet);
        }
        if (INC_CONTRACT) {
            tokenContracts["INC"] = incContract;
        }

        // Load balances
        $("loading-text").textContent = "Loading balances...";
        await updateBalances();

        // Load transaction history
        await loadTransactionHistory();

        showView("view-wallet");
        showPage("page-dashboard");
        showAlert("success", "Wallet connected!");
    } catch (e) {
        showAlert("error", "Failed to connect: " + e.message);
        showView("view-create");
    }
}

// ===== BALANCES =====

async function updateBalances() {
    if (!wallet || !provider) return;

    try {
        const { ethers } = window.ethers;
        let totalUsd = 0;

        // BNB balance
        const bnbBal = await provider.getBalance(wallet.address);
        const bnbFormatted = ethers.formatEther(bnbBal);
        $("bnb-balance").textContent = parseFloat(bnbFormatted).toFixed(4);
        tokenBalances["BNB"] = parseFloat(bnbFormatted);

        // Fetch BNB price
        try {
            const resp = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd");
            const data = await resp.json();
            bnbPrice = data.binancecoin?.usd || 0;
        } catch { bnbPrice = 0; }

        const bnbUsd = parseFloat(bnbFormatted) * bnbPrice;
        $("bnb-usd").textContent = "$" + bnbUsd.toFixed(2);
        totalUsd += bnbUsd;

        // INC balance
        if (incContract) {
            const incBal = await incContract.balanceOf(wallet.address);
            const incDecimals = await incContract.decimals();
            const incFormatted = ethers.formatUnits(incBal, incDecimals);
            $("inc-balance").textContent = parseFloat(incFormatted).toFixed(2);
            tokenBalances["INC"] = parseFloat(incFormatted);
            const incUsd = parseFloat(incFormatted) * incPrice;
            $("inc-usd").textContent = "$" + incUsd.toFixed(2);
            totalUsd += incUsd;
        } else {
            $("inc-balance").textContent = "0.00";
            $("inc-usd").textContent = "$0.00";
            tokenBalances["INC"] = 0;
        }

        // Stablecoin balances
        for (const [sym, info] of Object.entries(STABLECOINS)) {
            try {
                const contract = tokenContracts[sym];
                if (!contract) continue;
                const bal = await contract.balanceOf(wallet.address);
                const formatted = ethers.formatUnits(bal, info.decimals);
                tokenBalances[sym] = parseFloat(formatted);
                const el = $(sym.toLowerCase() + "-balance");
                if (el) {
                    el.textContent = parseFloat(formatted).toFixed(2);
                    const usdEl = $(sym.toLowerCase() + "-usd");
                    if (usdEl) usdEl.textContent = "$" + parseFloat(formatted).toFixed(2);
                }
                totalUsd += parseFloat(formatted); // Stablecoins are ~$1 each
            } catch { tokenBalances[sym] = 0; }
        }

        // Total
        $("total-balance").textContent = "$" + totalUsd.toFixed(2);

        // Update send page balance info
        updateSendBalanceInfo();
    } catch (e) {
        showAlert("error", "Failed to load balances: " + e.message);
    }
}

function updateSendBalanceInfo() {
    const token = $("send-token").value;
    const bal = tokenBalances[token.toUpperCase()] || 0;
    $("send-balance-info").textContent = "Available: " + bal.toFixed(4) + " " + token.toUpperCase();
}

// ===== SEND =====

async function sendTransaction() {
    const token = $("send-token").value;
    const to = $("send-to").value.trim();
    const amount = $("send-amount").value.trim();

    if (!to || !amount) {
        showAlert("error", "Enter recipient address or @tag and amount");
        return;
    }

    let recipientAddress = to;

    // Resolve @tag to address
    if (to.startsWith("@")) {
        try {
            const resp = await fetch(`${TAG_API}/v1/tags/${to.substring(1)}`);
            if (!resp.ok) {
                showAlert("error", `Tag ${to} not found`);
                return;
            }
            const data = await resp.json();
            recipientAddress = data.address;
            showAlert("info", `Resolved ${to} → ${recipientAddress.slice(0, 10)}...`);
        } catch (e) {
            showAlert("error", `Failed to resolve tag: ${e.message}`);
            return;
        }
    }

    if (!recipientAddress.startsWith("0x") || recipientAddress.length !== 42) {
        showAlert("error", "Invalid recipient address");
        return;
    }

    // Calculate fee
    const sendAmount = parseFloat(amount);
    const feeAmount = sendAmount * FEE_PERCENT;
    const recipientGets = sendAmount - feeAmount;

    try {
        showView("view-loading");
        $("loading-text").textContent = "Sending transaction...";

        const { ethers } = window.ethers;
        let tx;
        let feeTx = null;

        if (token === "bnb") {
            const value = ethers.parseEther(recipientGets.toString());
            tx = await wallet.sendTransaction({
                to: recipientAddress,
                value: value
            });
            // Send fee
            if (feeAmount > 0) {
                const feeValue = ethers.parseEther(feeAmount.toString());
                feeTx = await wallet.sendTransaction({
                    to: FEE_WALLET,
                    value: feeValue
                });
            }
        } else if (token === "inc") {
            if (!incContract) {
                showAlert("error", "INC contract not configured. Set contract address first.");
                showView("view-wallet");
                showPage("page-send");
                return;
            }
            const decimals = await incContract.decimals();
            const value = ethers.parseUnits(recipientGets.toString(), decimals);
            tx = await incContract.transfer(recipientAddress, value);
            if (feeAmount > 0) {
                const feeValue = ethers.parseUnits(feeAmount.toString(), decimals);
                feeTx = await incContract.transfer(FEE_WALLET, feeValue);
            }
        } else {
            // Stablecoin transfer
            const contract = tokenContracts[token.toUpperCase()];
            if (!contract) {
                showAlert("error", token.toUpperCase() + " contract not loaded.");
                showView("view-wallet");
                showPage("page-send");
                return;
            }
            const info = STABLECOINS[token.toUpperCase()];
            const value = ethers.parseUnits(recipientGets.toString(), info.decimals);
            tx = await contract.transfer(recipientAddress, value);
            if (feeAmount > 0) {
                const feeValue = ethers.parseUnits(feeAmount.toString(), info.decimals);
                feeTx = await contract.transfer(FEE_WALLET, feeValue);
            }
        }

        $("loading-text").textContent = "Waiting for confirmation...";
        await tx.wait();

        // Save to local transaction history
        saveTransaction({
            type: token.toUpperCase(),
            to: recipientAddress,
            amount: amount,
            hash: tx.hash,
            direction: "out",
            timestamp: Date.now()
        });

        showAlert("success", "Sent " + recipientGets.toFixed(6) + " " + token.toUpperCase() + " (fee: " + feeAmount.toFixed(6) + ") Hash: " + tx.hash.slice(0, 20) + "...");

        // Clear inputs
        $("send-to").value = "";
        $("send-amount").value = "";

        // Refresh
        await updateBalances();
        await loadTransactionHistory();
        showView("view-wallet");
        showPage("page-dashboard");
    } catch (e) {
        showAlert("error", "Transaction failed: " + e.message);
        showView("view-wallet");
        showPage("page-send");
    }
}

// ===== TRANSACTION HISTORY =====

function saveTransaction(tx) {
    let history = JSON.parse(localStorage.getItem("inc_tx_history") || "[]");
    history.unshift(tx);
    if (history.length > 50) history = history.slice(0, 50);
    localStorage.setItem("inc_tx_history", JSON.stringify(history));
}

async function loadTransactionHistory() {
    const history = JSON.parse(localStorage.getItem("inc_tx_history") || "[]");
    const list = $("tx-list");

    if (history.length === 0) {
        list.innerHTML = '<div class="empty-state">No transactions yet</div>';
        return;
    }

    list.innerHTML = history.map(tx => `
        <div class="tx-item">
            <div class="tx-info">
                <div class="tx-type">${tx.direction === "out" ? "Sent" : "Received"} ${tx.type}</div>
                <div class="tx-hash">${tx.hash.slice(0, 18)}...</div>
            </div>
            <div class="tx-amount ${tx.direction}">
                ${tx.direction === "out" ? "-" : "+"}${tx.amount} ${tx.type}
            </div>
        </div>
    `).join("");
}

// ===== TAG REGISTRY =====

async function createTag() {
    const tag = $("tag-input").value.trim();
    if (!tag) {
        showAlert("error", "Enter a tag name");
        return;
    }
    if (!wallet) {
        showAlert("error", "Wallet not loaded");
        return;
    }

    try {
        const resp = await fetch(`${TAG_API}/v1/tags/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-API-Token": API_TOKEN },
            body: JSON.stringify({ tag: tag, address: wallet.address, owner_name: "" })
        });
        const data = await resp.json();
        if (!resp.ok) {
            showAlert("error", data.detail || "Failed to create tag");
            return;
        }
        showAlert("success", `Tag @${tag} created! Share it to receive crypto.`);
        $("tag-input").value = "";
        await loadUserTags();
    } catch (e) {
        showAlert("error", "Failed to create tag: " + e.message);
    }
}

async function loadUserTags() {
    if (!wallet) return;
    const list = $("user-tags-list");
    try {
        const resp = await fetch(`${TAG_API}/v1/tags/search?q=`, {
            headers: { "X-API-Token": API_TOKEN }
        });
        const data = await resp.json();
        const userTags = data.tags.filter(t => t.address.toLowerCase() === wallet.address.toLowerCase());
        if (userTags.length === 0) {
            list.innerHTML = '<div class="empty-state">No tags created yet</div>';
            return;
        }
        list.innerHTML = userTags.map(t => `
            <div class="balance-row" style="cursor:pointer;" onclick="copyToClipboard('${t.address}')">
                <div class="token">
                    <div class="token-icon" style="background:linear-gradient(135deg,#ff6b9d,#c44dff);color:#fff;">@</div>
                    <div>
                        <div style="font-weight:600;">${t.tag}</div>
                        <div style="color:var(--muted);font-size:12px;">${t.address.slice(0,10)}...${t.address.slice(-4)}</div>
                    </div>
                </div>
                <div class="val">
                    <div class="num" style="font-size:12px;color:var(--muted);">Tap to copy</div>
                </div>
            </div>
        `).join("");
    } catch (e) {
        list.innerHTML = '<div class="empty-state">Failed to load tags</div>';
    }
}

let searchTimer = null;
async function searchTags(query) {
    const results = $("tag-search-results");
    if (!query || query.length < 1) {
        results.innerHTML = '<div class="empty-state" style="font-size:13px;">Type to search</div>';
        return;
    }
    try {
        const resp = await fetch(`${TAG_API}/v1/tags/search?q=${encodeURIComponent(query)}`, {
            headers: { "X-API-Token": API_TOKEN }
        });
        const data = await resp.json();
        if (data.tags.length === 0) {
            results.innerHTML = '<div class="empty-state" style="font-size:13px;">No tags found</div>';
            return;
        }
        results.innerHTML = data.tags.map(t => `
            <div class="balance-row" style="cursor:pointer;" onclick="copyToClipboard('${t.address}')">
                <div class="token">
                    <div class="token-icon" style="background:linear-gradient(135deg,#ff6b9d,#c44dff);color:#fff;">@</div>
                    <div>
                        <div style="font-weight:600;">${t.tag}</div>
                        <div style="color:var(--muted);font-size:12px;">${t.address.slice(0,10)}...${t.address.slice(-4)}</div>
                    </div>
                </div>
                <div class="val">
                    <div class="num" style="font-size:12px;color:var(--muted);">Tap to copy</div>
                </div>
            </div>
        `).join("");
    } catch (e) {
        results.innerHTML = '<div class="empty-state" style="font-size:13px;">Search failed</div>';
    }
}

let tagResolveTimer = null;
async function resolveTagInput(value) {
    const box = $("tag-resolve-box");
    const info = $("tag-resolved-info");
    const v = value.trim();

    if (!v.startsWith("@")) {
        box.style.display = "none";
        return;
    }

    try {
        const resp = await fetch(`${TAG_API}/v1/tags/${v.substring(1)}`);
        if (resp.ok) {
            const data = await resp.json();
            box.style.display = "block";
            info.innerHTML = `<strong>${data.tag}</strong> → ${data.address.slice(0,10)}...${data.address.slice(-4)}` + (data.owner_name ? ` <span style="color:var(--muted);">(${data.owner_name})</span>` : "");
        } else {
            box.style.display = "block";
            info.innerHTML = `<span style="color:var(--danger);">Tag ${v} not found</span>`;
        }
    } catch (e) {
        box.style.display = "none";
    }
}

// ===== CASH APP BUY FUNCTIONS =====

function updateBuyDisplay() {
    const amount = parseFloat($("buy-amount").value) || 0;
    const fee = amount * FEE_PERCENT;
    const receive = amount - fee;
    $("buy-pay-display").textContent = "$" + amount.toFixed(2);
    $("buy-fee-display").textContent = "$" + fee.toFixed(2);
    $("buy-receive-display").textContent = receive.toFixed(2) + " USDT";
}

function openCashAppSimple() {
    const amount = parseFloat($("buy-amount").value) || 0;
    const fee = amount * FEE_PERCENT;
    const receive = amount - fee;
    const walletAddr = wallet ? wallet.address : "YOUR_WALLET_ADDRESS";
    const note = `Buy ${receive.toFixed(2)} USDT — Wallet: ${walletAddr}`;

    const cashAppUrl = `https://cash.app/$${CASHAPP_TAG}/${amount.toFixed(2)}?note=${encodeURIComponent(note)}`;

    window.open(cashAppUrl, "_blank");
    showAlert("info", `Cash App opened — send $${amount.toFixed(2)} to $${CASHAPP_TAG}. Your wallet address is in the note. USDT will be sent to ${walletAddr} after payment is confirmed.`);
}

async function initCashAppPayButton() {
    const container = $("cashapp-pay-button-container");
    const statusEl = $("cashapp-pay-status");
    if (!container) return;

    if (!SQUARE_APP_ID || !SQUARE_LOCATION_ID) {
        container.innerHTML = '<p style="font-size:12px;color:var(--muted);">Cash App Pay (automated) requires Square Developer credentials. Using simple $cashtag link above for now.</p>';
        return;
    }

    try {
        if (typeof Square === "undefined") {
            const script = document.createElement("script");
            script.src = "https://sandbox.web.squarecdn.com/v1/square.js";
            script.onload = () => setupSquarePayment();
            document.head.appendChild(script);
        } else {
            setupSquarePayment();
        }
    } catch (e) {
        statusEl.textContent = "Cash App Pay unavailable: " + e.message;
    }
}

async function setupSquarePayment() {
    const statusEl = $("cashapp-pay-status");
    try {
        const payments = Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID);
        const cashAppPay = await payments.cashAppPay();
        const container = $("cashapp-pay-button-container");
        container.innerHTML = "";

        await cashAppPay.attach("#cashapp-pay-button-container", {
            shape: "semiround",
            width: "full",
            redirectURL: window.location.origin + "?cashapp=complete",
            referenceId: "soulmate-buy",
        });

        cashAppPay.addEventListener("ontokenization", async (event) => {
            const { tokenResult } = event.detail;
            if (tokenResult.status === "OK") {
                const amount = parseFloat($("buy-amount").value) || 0;
                const walletAddr = wallet ? wallet.address : "";

                statusEl.textContent = "Processing payment...";

                const resp = await fetch(`${TAG_API}/v1/cashapp/pay`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-API-Token": API_TOKEN,
                    },
                    body: JSON.stringify({
                        sourceId: tokenResult.token,
                        amount: amount,
                        wallet_address: walletAddr,
                    }),
                });

                const data = await resp.json();
                if (data.status === "completed") {
                    statusEl.style.color = "var(--success)";
                    statusEl.textContent = `Success! ${data.crypto_sent} USDT sent to ${walletAddr}`;
                    showAlert("success", `Bought ${data.crypto_sent} USDT via Cash App Pay!`);
                    await updateBalances();
                } else {
                    statusEl.style.color = "var(--danger)";
                    statusEl.textContent = "Payment failed: " + (data.reason || "Unknown error");
                }
            }
        });

        statusEl.textContent = "Cash App Pay ready — click the button above.";
    } catch (e) {
        statusEl.textContent = "Cash App Pay setup failed: " + e.message;
    }
}

// ===== QR CODE FUNCTIONS =====

function generateQRCode(text, containerId, size) {
    size = size || 200;
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = "";
    try {
        const qr = qrcode(0, "M");
        qr.addData(text);
        qr.make();
        const imgSrc = qr.createDataURL(8, 0);
        const img = document.createElement("img");
        img.src = imgSrc;
        img.style.width = size + "px";
        img.style.height = size + "px";
        container.appendChild(img);
    } catch (e) {
        container.innerHTML = '<p style="color:var(--muted);font-size:12px;">QR code unavailable</p>';
    }
}

function updateReceiveQR() {
    if (wallet && wallet.address) {
        generateQRCode(wallet.address, "receive-qr", 200);
    }
}

let qrScanner = null;

function openQRScanner() {
    const modal = $("qr-scanner-modal");
    modal.style.display = "flex";
    $("qr-scan-status").textContent = "Starting camera...";
    $("qr-scan-status").style.color = "var(--muted)";
    $("qr-reader").innerHTML = "";

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        $("qr-scan-status").textContent = "No camera detected. You can still paste an address or @tag manually.";
        $("qr-scan-status").style.color = "var(--accent)";
        return;
    }

    try {
        qrScanner = new Html5Qrcode("qr-reader");
        qrScanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
                onQRScanned(decodedText);
            },
            (errorMessage) => {
                // Ignore per-frame errors
            }
        ).then(() => {
            $("qr-scan-status").textContent = "Point camera at a wallet QR code";
        }).catch((err) => {
            $("qr-scan-status").textContent = "No camera available. You can still paste an address or @tag manually.";
            $("qr-scan-status").style.color = "var(--accent)";
            qrScanner = null;
        });
    } catch (e) {
        $("qr-scan-status").textContent = "No camera available. You can still paste an address or @tag manually.";
        $("qr-scan-status").style.color = "var(--accent)";
        qrScanner = null;
    }
}

function closeQRScanner() {
    if (qrScanner) {
        qrScanner.stop().then(() => {
            qrScanner.clear();
            qrScanner = null;
        }).catch(() => {
            try { qrScanner.clear(); } catch (e) {}
            qrScanner = null;
        });
    }
    $("qr-reader").innerHTML = "";
    $("qr-scanner-modal").style.display = "none";
    $("qr-scan-status").textContent = "Point camera at a wallet QR code";
    $("qr-scan-status").style.color = "var(--muted)";
}

function onQRScanned(text) {
    closeQRScanner();
    let scanned = text.trim();

    // Handle different QR code formats
    if (scanned.startsWith("ethereum:")) {
        scanned = scanned.replace("ethereum:", "");
    }
    if (scanned.startsWith("https://") && scanned.includes("/")) {
        const parts = scanned.split("/");
        const last = parts[parts.length - 1];
        if (last.startsWith("0x") || last.startsWith("@")) {
            scanned = last;
        }
    }

    $("send-to").value = scanned;
    showAlert("info", "QR scanned: " + scanned.slice(0, 20) + (scanned.length > 20 ? "..." : ""));

    // Trigger tag resolution if it's a tag
    if (scanned.startsWith("@")) {
        resolveTagInput(scanned);
    }
}

// ===== EVENT LISTENERS =====

// Social media share platforms
const SHARE_PLATFORMS = [
    { name: "X", color: "#000", icon: "𝕏", url: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
    { name: "Facebook", color: "#1877F2", icon: "f", url: (text, url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}` },
    { name: "Reddit", color: "#FF4500", icon: "R", url: (text, url) => `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}` },
    { name: "LinkedIn", color: "#0A66C2", icon: "in", url: (text, url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { name: "WhatsApp", color: "#25D366", icon: "W", url: (text, url) => `https://wa.me/?text=${encodeURIComponent(text + " " + url)}` },
    { name: "Telegram", color: "#0088CC", icon: "T", url: (text, url) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
    { name: "Discord", color: "#5865F2", icon: "D", url: (text, url) => `https://discord.com/channels/@me` },
    { name: "YouTube", color: "#FF0000", icon: "Y", url: (text, url) => `https://www.youtube.com` },
    { name: "Instagram", color: "#E4405F", icon: "I", url: (text, url) => `https://www.instagram.com` },
    { name: "TikTok", color: "#000", icon: "TT", url: (text, url) => `https://www.tiktok.com` },
    { name: "Snapchat", color: "#FFFC00", icon: "S", url: (text, url) => `https://www.snapchat.com` },
    { name: "Pinterest", color: "#BD081C", icon: "P", url: (text, url) => `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(text)}` },
    { name: "Tumblr", color: "#36465D", icon: "t", url: (text, url) => `https://www.tumblr.com/share/link?url=${encodeURIComponent(url)}&name=${encodeURIComponent(text)}` },
    { name: "Mastodon", color: "#6364FF", icon: "M", url: (text, url) => `https://mastodon.social/share?text=${encodeURIComponent(text + " " + url)}` },
    { name: "VK", color: "#4C75C3", icon: "VK", url: (text, url) => `https://vk.com/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}` },
    { name: "Myspace", color: "#0A0A0A", icon: "MS", url: (text, url) => `https://myspace.com` },
    { name: "Email", color: "#EA4335", icon: "@", url: (text, url) => `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}` },
    { name: "SMS", color: "#34A853", icon: "SMS", url: (text, url) => `sms:?&body=${encodeURIComponent(text + " " + url)}` },
    { name: "Signal", color: "#3A76F0", icon: "SG", url: (text, url) => `https://signal.me` },
    { name: "Threads", color: "#000", icon: "TH", url: (text, url) => `https://threads.net` },
    { name: "Bluesky", color: "#0085FF", icon: "BS", url: (text, url) => `https://bsky.app` },
    { name: "Hacker News", color: "#FF6600", icon: "HN", url: (text, url) => `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(url)}&t=${encodeURIComponent(text)}` },
    { name: "StumbleUpon", color: "#EB4924", icon: "SU", url: (text, url) => `https://stumbleupon.com` },
    { name: "Digg", color: "#0080FF", icon: "DG", url: (text, url) => `https://digg.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}` },
    { name: "Blogger", color: "#FF8000", icon: "B", url: (text, url) => `https://www.blogger.com` },
    { name: "WordPress", color: "#21759B", icon: "WP", url: (text, url) => `https://wordpress.com` },
    { name: "Medium", color: "#000", icon: "MD", url: (text, url) => `https://medium.com` },
    { name: "Quora", color: "#B92B27", icon: "Q", url: (text, url) => `https://www.quora.com` },
    { name: "Flipboard", color: "#E12828", icon: "FL", url: (text, url) => `https://share.flipboard.com/bookmarklet/popout?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}` },
    { name: "Mix", color: "#FF6600", icon: "MX", url: (text, url) => `https://mix.com/mixit?url=${encodeURIComponent(url)}` },
    { name: "WeChat", color: "#07C160", icon: "WC", url: (text, url) => `https://web.wechat.com` },
    { name: "Line", color: "#00B900", icon: "LN", url: (text, url) => `https://line.me/R/msg/text/?${encodeURIComponent(text + " " + url)}` },
    { name: "Viber", color: "#7360F2", icon: "VB", url: (text, url) => `viber://forward?text=${encodeURIComponent(text + " " + url)}` },
    { name: "Skype", color: "#00AFF0", icon: "SK", url: (text, url) => `https://web.skype.com/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
    { name: "Slack", color: "#4A154B", icon: "SL", url: (text, url) => `https://slack.com` },
    { name: "Teams", color: "#6264A7", icon: "TM", url: (text, url) => `https://teams.microsoft.com` },
    { name: "Gab", color: "#21CF7A", icon: "GB", url: (text, url) => `https://gab.com` },
    { name: "Parler", color: "#BE1E2D", icon: "PR", url: (text, url) => `https://parler.com` },
    { name: "Truth Social", color: "#1A78E2", icon: "TS", url: (text, url) => `https://truthsocial.com` },
    { name: "Gettr", color: "#E3000F", icon: "GT", url: (text, url) => `https://gettr.com` },
    { name: "Clubhouse", color: "#6515DD", icon: "CH", url: (text, url) => `https://www.clubhouse.com` },
    { name: "Twitch", color: "#9146FF", icon: "TW", url: (text, url) => `https://www.twitch.tv` },
    { name: "Steam", color: "#171A21", icon: "ST", url: (text, url) => `https://store.steampowered.com` },
    { name: "Reddit Chat", color: "#FF4500", icon: "RC", url: (text, url) => `https://www.reddit.com/chat` },
    { name: "Koo", color: "#AC1E2D", icon: "KO", url: (text, url) => `https://www.kooapp.com` },
    { name: "Weibo", color: "#E6162D", icon: "WB", url: (text, url) => `https://service.weibo.com/share/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}` },
    { name: "Qzone", color: "#FEBE0F", icon: "QZ", url: (text, url) => `https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url=${encodeURIComponent(url)}` },
    { name: "Douban", color: "#007722", icon: "DB", url: (text, url) => `https://www.douban.com/share/?url=${encodeURIComponent(url)}&name=${encodeURIComponent(text)}` },
    { name: "Renren", color: "#217DC6", icon: "RR", url: (text, url) => `http://widget.renren.com/dialog/share?resourceUrl=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}` },
    { name: "Pocket", color: "#EF4056", icon: "PK", url: (text, url) => `https://getpocket.com/save?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}` },
    { name: "Instapaper", color: "#000", icon: "IP", url: (text, url) => `https://www.instapaper.com/edit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}` },
    { name: "Buffer", color: "#168EEA", icon: "BF", url: (text, url) => `https://buffer.com/add?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
    { name: "Evernote", color: "#00A82D", icon: "EN", url: (text, url) => `https://www.evernote.com/clip.action?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}` },
    { name: "Trello", color: "#0079BF", icon: "TR", url: (text, url) => `https://trello.com` },
    { name: "RSS", color: "#FFA500", icon: "RSS", url: (text, url) => `https://rss.com` },
    { name: "Print", color: "#666", icon: "PR", url: (text, url) => `javascript:window.print()` },
];

function initShareButtons() {
    const container = $("share-buttons");
    if (!container) return;
    const walletUrl = window.location.origin;
    const shareText = "Check out the Incentives Wallet — BSC crypto wallet with @tags, 0.5% fees, and PayPal integration!";

    container.innerHTML = SHARE_PLATFORMS.map(p => {
        const isLight = ["WhatsApp", "Snapchat", "Signal", "Truth Social", "Clubhouse", "Pocket", "Flipboard", "Koo", "Qzone", "RSS"].includes(p.name);
        const textColor = isLight ? "#000" : "#fff";
        const fontSize = p.icon.length > 2 ? "10px" : "13px";
        return `<a href="${p.url(shareText, walletUrl)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;background:${p.color};color:${textColor};text-decoration:none;font-weight:bold;font-size:${fontSize};cursor:pointer;transition:transform 0.1s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" title="Share to ${p.name}">${p.icon}</a>`;
    }).join("");
}

document.addEventListener("DOMContentLoaded", () => {
    // Create wallet
    $("btn-create-wallet").addEventListener("click", createWallet);

    // Show import
    $("btn-show-import").addEventListener("click", () => {
        showView("view-import");
    });

    // Import wallet
    $("btn-import-wallet").addEventListener("click", importWallet);

    // Back from import
    $("btn-back-create").addEventListener("click", () => {
        showView("view-create");
    });

    // Confirm mnemonic
    $("btn-confirm-mnemonic").addEventListener("click", async () => {
        if (window._pendingPrivateKey) {
            saveWallet(window._pendingPrivateKey);
            await initWallet(window._pendingPrivateKey);
            window._pendingMnemonic = null;
            window._pendingPrivateKey = null;
        }
    });

    // Nav items
    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", () => {
            const view = item.dataset.view;
            showPage("page-" + view);
            if (view === "tags") loadUserTags();
        });
    });

    // Copy address
    $("btn-copy-address").addEventListener("click", () => {
        copyToClipboard(wallet ? wallet.address : "");
    });

    // Copy receive address
    $("btn-copy-receive").addEventListener("click", () => {
        copyToClipboard(wallet ? wallet.address : "");
    });

    // Share receive address
    $("btn-share-receive").addEventListener("click", () => {
        if (wallet && navigator.share) {
            navigator.share({
                title: "My BSC Wallet Address",
                text: "Send me crypto on BSC:",
                url: wallet.address,
            }).catch(() => {});
        } else if (wallet) {
            copyToClipboard(wallet.address);
            showAlert("info", "Address copied — paste it anywhere to share");
        }
    });

    // QR scanner
    $("btn-scan-qr").addEventListener("click", openQRScanner);
    $("btn-close-scanner").addEventListener("click", closeQRScanner);

    // Quick actions
    $("btn-quick-send").addEventListener("click", () => showPage("page-send"));
    $("btn-quick-receive").addEventListener("click", () => showPage("page-receive"));

    // Send
    $("btn-send").addEventListener("click", sendTransaction);

    // Send token change
    $("send-token").addEventListener("change", updateSendBalanceInfo);
    $("send-token").addEventListener("change", updateFeeDisplay);

    // Amount input - update fee display
    $("send-amount").addEventListener("input", updateFeeDisplay);

    // Max button
    $("btn-max").addEventListener("click", () => {
        const token = $("send-token").value;
        const bal = tokenBalances[token.toUpperCase()] || 0;
        $("send-amount").value = bal.toFixed(6);
        updateFeeDisplay();
    });

    // Back buttons
    $("btn-back-dashboard").addEventListener("click", () => showPage("page-dashboard"));
    $("btn-back-dashboard2").addEventListener("click", () => showPage("page-dashboard"));
    $("btn-back-dashboard3").addEventListener("click", () => showPage("page-dashboard"));
    $("btn-back-dashboard4").addEventListener("click", () => showPage("page-dashboard"));
    $("btn-back-dashboard5").addEventListener("click", () => showPage("page-dashboard"));

    // Buy page
    $("buy-amount").addEventListener("change", updateBuyDisplay);
    $("btn-cashapp-pay").addEventListener("click", openCashAppSimple);

    // Tag features
    $("btn-create-tag").addEventListener("click", createTag);
    $("tag-input").addEventListener("keypress", (e) => { if (e.key === "Enter") createTag(); });
    $("tag-search").addEventListener("input", (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => searchTags(e.target.value.trim()), 300);
    });
    $("send-to").addEventListener("input", (e) => {
        clearTimeout(tagResolveTimer);
        tagResolveTimer = setTimeout(() => resolveTagInput(e.target.value), 300);
    });

    // Copy share link
    $("btn-copy-share-link").addEventListener("click", () => {
        const link = window.location.origin;
        copyToClipboard(link);
        showAlert("info", "Share link copied: " + link);
    });

    // Logout
    $("btn-logout").addEventListener("click", () => {
        clearWallet();
        wallet = null;
        provider = null;
        showView("view-create");
        showAlert("info", "Wallet locked");
    });

    // Auto-load wallet if exists
    const savedPk = loadWallet();
    if (savedPk) {
        initWallet(savedPk);
    }

    // Initialize share buttons
    initShareButtons();

    // Initialize Cash App Pay (automated mode if Square credentials set)
    initCashAppPayButton();
});
