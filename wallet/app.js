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
    const pages = ["page-dashboard", "page-send", "page-receive", "page-tags", "page-history"];
    pages.forEach(p => $(p).classList.add("hidden"));
    $(pageId).classList.remove("hidden");

    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    const navMap = { "page-dashboard": 0, "page-send": 1, "page-receive": 2, "page-tags": 3, "page-history": 4 };
    const navItems = document.querySelectorAll(".nav-item");
    if (navMap[pageId] !== undefined) navItems[navMap[pageId]].classList.add("active");
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

// ===== EVENT LISTENERS =====

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
});
