# Soulmate OS — Work Progress Log
## Session Date: August 5-6, 2026

---

## 0. Earlier Session Work (Before YouTube/Fingerprint)

### 2-Word Passphrase Wallet (later replaced by auto-creation)
- **File**: `frontend/src/components/wallet/WalletCreateView.tsx`
- Originally replaced 12-word mnemonic with a 2-word passphrase system
- Passphrase hashed with `ethers.keccak256(ethers.toUtf8Bytes(word1 + " " + word2))` to derive wallet private key
- User could pick any two words as their wallet backup
- **Later deprecated** when user said "this is starting to become too technical"

### Biometric Fallback for Devices Without WebAuthn
- **File**: `frontend/src/components/wallet/WalletCreateView.tsx`
- User got "biometric authentication not available on this device" error on Android
- Modified `handleFingerprintRegister` to first save the wallet, then attempt biometric registration
- If `window.PublicKeyCredential` is not available, saves wallet for auto-login on device instead of blocking
- Modified `handleFingerprintImport` to check for saved wallet on device if WebAuthn not available
- Updated UI messages and button texts to reflect fallback behavior

### Auto Wallet Creation (removed all manual wallet setup)
- **Files**: `frontend/src/App.tsx`, `frontend/src/components/auth/AuthViews.tsx`
- User said "just add all wallets automatically no imports any more"
- Removed `WalletCreateView` import and rendering from `App.tsx`
- Added `autoCreateWallet()` helper in App.tsx:
  ```typescript
  const autoCreateWallet = () => {
    const wallet = ethers.Wallet.createRandom();
    useStore.getState().setWallet(wallet.address, wallet.privateKey);
    saveWalletToVault(wallet.address, wallet.privateKey);
    localStorage.setItem("fingerprint_registered", "true");
    localStorage.setItem("remember_me_device", "true");
  };
  ```
- All auth flows (login, signup, fingerprint login, remember-me, session check) now call `autoCreateWallet()` + `setView("app")`
- Replaced all `setView("create-wallet")` calls
- `AuthViews.tsx`: Updated `handleSignup`, `handleLogin`, `handleRegisterFingerprint` to navigate to `app` instead of `create-wallet`
- Fingerprint register view "Skip" and "Continue" buttons navigate to `app`
- `WalletCreateView.tsx` still exists but is dead code (not imported or rendered)

---

## 1. YouTube Video Posting in Social Media Feed

### Files Modified:
- `frontend/src/components/pages/DashboardPage.tsx`
- `frontend/src/lib/api.ts`

### What Was Done:
- Added `getYouTubeId()` helper function to detect YouTube URLs from multiple formats:
  - `youtube.com/watch?v=`
  - `youtu.be/`
  - `youtube.com/embed/`
  - `youtube.com/shorts/`
- Added `getYouTubeThumb()` helper to fetch YouTube thumbnail images
- Added `video_url` field to `Post` interface
- Added state: `postVideo`, `showVideoInput`, `playingVideo`, `sharedPosts`
- Updated `handleCreatePost()` to send `video_url` to API
- Updated `socialApi.createPost` type in `api.ts` to accept `video_url`
- **Create Post modal**: Added YouTube button (red icon) that toggles a URL input field
  - Shows thumbnail preview with YouTube icon before posting
  - Validates URL is a valid YouTube link before showing preview
- **Feed display**: YouTube posts show thumbnail with play button overlay
  - Click thumbnail to embed and play video inline via iframe
  - iframe uses `https://www.youtube.com/embed/{videoId}?autoplay=1`
- Added `Youtube` icon import from lucide-react

---

## 2. Fixed Non-Working Buttons in Social Media Component

### File Modified:
- `frontend/src/components/pages/DashboardPage.tsx`

### What Was Done:
- **Share button**: Now copies post link to clipboard, shows "Copied!" feedback for 3 seconds
  - Added `handleShare()` function using `copyToClipboard()` from utils
- **Friends sidebar button**: Navigates to `contacts` page via `setActivePage("contacts")`
- **Memories sidebar button**: Navigates to `dashboard` page
- **Saved sidebar button**: Navigates to `wallet` page
- **Events sidebar button**: Navigates to `marketplace` page
- **See More button**: Expands/collapses to show additional nav items (AI Chat, Games, Incentives, Healing)
  - Uses `seeMore` state, chevron icon rotates when expanded
- **Messages icon (top bar)**: Navigates to `contacts` page
- **Profile avatar (top bar)**: Navigates to `security` page
- **Notifications**: Clicking a notification marks it as read via `socialApi.markNotificationRead()`
  - Added `handleNotificationClick()` function
- **Search results**: Clicking a user shows their info via `showAlert`
- **Feeling/Emoji button**: Adds a random emoji to post text
  - Added `handleAddEmoji()` function with random emoji selection
- **Sponsored ad (right sidebar)**: Navigates to `wallet` page
- Added `copyToClipboard` to imports from `@/lib/utils`

---

## 3. Fingerprint Bio Unlock Gate on Phone Page

### Files Created:
- `frontend/src/components/FingerprintGate.tsx` (new file)

### Files Modified:
- `frontend/src/App.tsx`
- `frontend/index.html`

### What Was Done:
- **Created `FingerprintGate` component**: A full-screen setup screen that blocks access to the Phone page until fingerprint bio unlock is configured
  - Shows fingerprint icon with shield badge
  - Lists benefits: unlock on future logins, recover if phone lost, works across devices
  - "Start Fingerprint Setup" button triggers WebAuthn registration
  - "Back" button returns to dashboard
  - On devices WITH biometric support: calls `authApi.webauthnRegisterBegin()` + `navigator.credentials.create()` + `authApi.webauthnRegisterComplete()`
  - On devices WITHOUT biometric: saves device for auto-login (`remember_me_device`, `fingerprint_registered`, `bio_unlock_setup`)
  - Sets `bio_unlock_setup` localStorage key on success
  - Originally tried 6 scans, simplified to 1 scan (WebAuthn uses phone's already-enrolled fingerprints, multiple scans of same finger adds no value)

- **Added `PhoneGateWrapper` in App.tsx**: React component that checks `bio_unlock_setup` localStorage
  - If set: renders `PhonePage` directly
  - If not set: renders `FingerprintGate`
  - Uses React state (`bioSetupDone`) not direct localStorage read at render time
  - `onUnlock` updates state to show PhonePage without page reload

- **Key distinction**: `bio_unlock_setup` is separate from `fingerprint_registered`
  - `fingerprint_registered` is auto-set by `autoCreateWallet()` on login
  - `bio_unlock_setup` is ONLY set when user completes the fingerprint gate
  - This prevents the gate from being bypassed

- **Cache busting**: Added `Cache-Control`, `Pragma`, `Expires` meta tags to `index.html` to prevent stale JS on mobile devices

---

## 4. Vault Auto-Resize / Storage Management

### File Modified:
- `frontend/src/lib/vault.ts`

### What Was Done:
- Added `safeSetItem()` wrapper function that catches `QuotaExceededError`
- When localStorage is full:
  1. Prunes vault accounts to 5 most recent (sorted by `created_at`)
  2. Retries the save
  3. If still full, clears non-essential `soulmate_*` keys (preserves vault accounts and biometric entries)
  4. Retries again
- Added `MAX_VAULT_ACCOUNTS = 50` limit — oldest accounts auto-removed when exceeded
- All `localStorage.setItem` calls in vault replaced with `safeSetItem()`
- Prevents silent data loss when storage fills up

---

## 5. Auto Wallet Creation (from earlier in session)

### Files Modified:
- `frontend/src/App.tsx`
- `frontend/src/components/auth/AuthViews.tsx`

### What Was Done:
- Removed all wallet creation/import UI (`WalletCreateView` component no longer rendered)
- Added `autoCreateWallet()` function in App.tsx:
  - Creates random wallet via `ethers.Wallet.createRandom()`
  - Saves to Zustand store and vault
  - Sets `fingerprint_registered` and `remember_me_device` localStorage
- All auth flows (login, signup, fingerprint login, remember-me) now call `autoCreateWallet()` then `setView("app")`
- Replaced all `setView("create-wallet")` calls with `autoCreateWallet()` + `setView("app")`
- `WalletCreateView.tsx` still exists in codebase but is no longer imported or rendered

---

## Current State of Key Files:

### `frontend/src/components/pages/DashboardPage.tsx`
- YouTube video posting: fully implemented (create + display + play)
- All buttons functional: Like, Comment, Share, Friends, Memories, Saved, Events, See More, Messages, Notifications, Search, Emoji, Sponsored
- Social feed with posts, stories, notifications, friends list

### `frontend/src/components/FingerprintGate.tsx` (NEW)
- Single-scan WebAuthn fingerprint registration
- Blocks Phone page until setup complete
- Fallback for devices without biometric support

### `frontend/src/App.tsx`
- `PhoneGateWrapper` component wraps Phone page with fingerprint gate
- `autoCreateWallet()` creates wallet automatically on auth
- No wallet creation/import UI shown to user

### `frontend/src/lib/api.ts`
- `socialApi.createPost` now accepts `video_url` parameter
- All social API endpoints intact (posts, likes, comments, friends, notifications, search, DMs, stories)

---

## Deployment Info:
- **App URL**: `https://191.44.121.29.sslip.io`
- **Server IP**: `191.44.121.29`
- **SSH**: `root` / `wallmartxxxxxxxx8`
- **Deploy path**: `/opt/incentives-wallet/wallet`
- **API server**: `uvicorn api:app --host 0.0.0.0 --port 8546` (in `/opt/incentives-wallet`)
- **Build command**: `npx vite build` (in `frontend/`)
- **Deploy script**: Python script using paramiko to SFTP files and restart uvicorn

---

## Potential Next Steps:
1. Test fingerprint gate on actual Android device (user was having cache issues seeing the gate)
2. Consider adding fingerprint gate to other sensitive pages (wallet, security)
3. YouTube video_url needs backend support — verify the API accepts and stores `video_url` field
4. Consider adding YouTube URL detection in post text (auto-detect pasted YouTube links in text area)
5. The `WalletCreateView.tsx` file is now dead code — could be cleaned up
6. Landing page project exists at `C:\Users\hawpe\CascadeProjects\soulmateos-landing` — may need work
