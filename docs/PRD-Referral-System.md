# PRD: MultiHopper Referral System (Off-Chain)

## Overview

A referral and route-sharing system that incentivizes user acquisition and route creation by distributing a percentage of protocol fees to referrers and route creators.

---

## Goals

1. Drive user acquisition through KOL/influencer referrals
2. Incentivize creation of high-quality routes
3. Create viral sharing mechanics for organic growth
4. Track and attribute referral revenue accurately

---

## User Types

| User Type | Description | Reward |
|-----------|-------------|--------|
| **Traffic Referrer** | Sends users to the platform via referral link | % of fees from referred user's transactions |
| **Route Creator** | Creates and shares a custom route | % of fees when others use their route |
| **Hybrid** | Both refers AND creates the route being used | Combined % (higher reward) |

---

## Revenue Split Model

**Total Protocol Fee**: 0.5% (current `feeBps`)

**Confirmed Split**:
- Protocol Treasury: **80%**
- Referrer Share: **10%**
- Route Creator Share: **10%**

### Example Scenarios

| Scenario | Treasury | Referrer | Route Creator |
|----------|----------|----------|---------------|
| No referral, Easy Route | 100% | 0% | 0% |
| Referral only, Easy Route | 90% | 10% | 0% |
| No referral, Shared Custom Route | 90% | 0% | 10% |
| Referral + Shared Custom Route | 80% | 10% | 10% |
| Self-referred + Own Route | 80% | 20% | (same person) |

**Note**: Easy Routes do NOT earn creator fees (routes use random system wallets).

---

## Database Schema

### New Tables

```sql
-- Referral codes and relationships
CREATE TABLE referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address VARCHAR(44) NOT NULL UNIQUE,  -- Solana wallet
  code VARCHAR(12) NOT NULL UNIQUE,           -- e.g., "ABC123"
  created_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Track referral relationships
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_address VARCHAR(44) NOT NULL,      -- Who referred
  referred_address VARCHAR(44) NOT NULL,      -- Who was referred
  referral_code VARCHAR(12) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  first_transaction_at TIMESTAMP,             -- When they first transacted
  UNIQUE(referred_address)                    -- User can only be referred once
);

-- Track earnings from referrals
CREATE TABLE referral_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_address VARCHAR(44) NOT NULL,   -- Who earned
  route_id UUID REFERENCES routes(id),
  earning_type VARCHAR(20) NOT NULL,          -- 'referral' | 'route_creator'
  amount_lamports BIGINT NOT NULL,
  token_type VARCHAR(10) NOT NULL,            -- 'SOL' | 'SPL'
  token_mint VARCHAR(44),                     -- For SPL tokens
  status VARCHAR(20) DEFAULT 'pending',       -- 'pending' | 'paid' | 'cancelled'
  created_at TIMESTAMP DEFAULT NOW(),
  paid_at TIMESTAMP
);

-- Route sharing metadata
ALTER TABLE routes ADD COLUMN creator_address VARCHAR(44);
ALTER TABLE routes ADD COLUMN is_shareable BOOLEAN DEFAULT false;
ALTER TABLE routes ADD COLUMN share_code VARCHAR(12) UNIQUE;
ALTER TABLE routes ADD COLUMN times_used INTEGER DEFAULT 0;
```

---

## API Endpoints

### Referral Management

```typescript
// Generate/Get referral code for user
GET /api/referrals/code
Response: { code: "ABC123", link: "https://multihopper.io/?ref=ABC123" }

// Get referral stats
GET /api/referrals/stats
Response: {
  totalReferred: 15,
  activeReferred: 12,
  totalEarnings: { sol: "1.5", usd: "150.00" },
  pendingEarnings: { sol: "0.3", usd: "30.00" }
}

// Get earnings history
GET /api/referrals/earnings?page=1&limit=20
Response: {
  earnings: [...],
  pagination: { page: 1, total: 45 }
}

// Claim/withdraw earnings
POST /api/referrals/claim
Body: { token_type: "SOL" }
Response: { transaction_signature: "...", amount: "0.5" }
```

### Route Sharing

```typescript
// Make route shareable and get share link
POST /api/routes/:id/share
Response: {
  shareCode: "ROUTE123",
  shareLink: "https://multihopper.io/route/ROUTE123"
}

// Get shared route details (public)
GET /api/routes/shared/:shareCode
Response: {
  route: { hops: 5, totalDelay: "2h", creator: "7kQX...2P" },
  creator: { address: "...", routesCreated: 10, timesUsed: 150 }
}

// Use a shared route
POST /api/routes/shared/:shareCode/use
Body: { amount: "100", referralCode?: "ABC123" }
```

---

## User Flows

### Flow 1: Traffic Referral

```
1. User A generates referral link: multihopper.io/?ref=ABC123
2. User A shares link on Twitter/Telegram
3. User B clicks link, arrives at landing page
4. System stores referral code in localStorage + cookie
5. User B connects wallet
6. System creates referral relationship (A referred B)
7. User B creates any route and executes
8. System calculates A's referral earnings (15% of fee)
9. Earnings added to A's pending balance
```

### Flow 2: Route Sharing

```
1. User A creates custom route with 5 hops
2. User A clicks "Share Route" button
3. System generates share link: multihopper.io/route/ROUTE123
4. User A shares link
5. User B opens link, sees route preview
6. User B clicks "Use This Route"
7. User B configures amount, executes route
8. System calculates A's creator earnings (15% of fee)
9. Earnings added to A's pending balance
```

### Flow 3: Combined (Referral + Route Share)

```
1. User A shares route link WITH referral: multihopper.io/route/ROUTE123?ref=ABC123
2. User B (new user) clicks link
3. Both referral AND route creator tracked
4. User B executes route
5. User A gets BOTH referral + creator earnings (30% of fee)
```

---

## UI Components

### 1. Referral Dashboard Page (`/referrals`)

```
┌─────────────────────────────────────────────────────────────┐
│  Your Referrals                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ Total Earned    │  │ Pending         │                  │
│  │ 2.5 SOL         │  │ 0.3 SOL         │                  │
│  │ ~$250           │  │ ~$30            │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
│  Your Referral Link                                         │
│  ┌───────────────────────────────────────────────┬───────┐ │
│  │ multihopper.io/?ref=ABC123                    │ Copy  │ │
│  └───────────────────────────────────────────────┴───────┘ │
│                                                             │
│  [Share on Twitter]  [Share on Telegram]                   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Referral Activity                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ User      │ Joined      │ Transactions │ Earned     │   │
│  ├───────────┼─────────────┼──────────────┼────────────┤   │
│  │ 7kQX...2P │ 2 days ago  │ 5            │ 0.15 SOL   │   │
│  │ 9xYZ...4K │ 1 week ago  │ 12           │ 0.45 SOL   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Claim Earnings: 0.3 SOL]                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2. Route Share Modal

```
┌─────────────────────────────────────────────────────────────┐
│  Share This Route                                      [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Route: "My Privacy Route"                                  │
│  5 hops · 2hr total delay · Used 47 times                  │
│                                                             │
│  Share Link                                                 │
│  ┌───────────────────────────────────────────────┬───────┐ │
│  │ multihopper.io/route/ROUTE123?ref=ABC123      │ Copy  │ │
│  └───────────────────────────────────────────────┴───────┘ │
│                                                             │
│  ☑ Include my referral code (earn extra 15%)               │
│                                                             │
│  [Twitter]  [Telegram]  [Copy Link]                        │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│  You earn 15% of fees when others use this route           │
│  Current earnings from this route: 0.8 SOL                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3. Shared Route Preview Page (`/route/:shareCode`)

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo] MultiHopper                          [Connect]      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Shared Route                                               │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │   ○ ─── ○ ─── ○ ─── ○ ─── ○                        │   │
│  │   Hop 1  Hop 2  Hop 3  Hop 4  Hop 5               │   │
│  │                                                     │   │
│  │   Total Delay: 2 hours                             │   │
│  │   Created by: 7kQX...2P                            │   │
│  │   Used: 47 times                                   │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Use This Route]                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Earnings Calculation

### On Route Execution (Backend)

```typescript
async function calculateReferralEarnings(
  routeId: string,
  executorAddress: string,
  feeCollected: bigint,
  tokenType: 'SOL' | 'SPL',
  tokenMint?: string
) {
  const earnings: ReferralEarning[] = [];

  // 1. Check if executor was referred
  const referral = await getReferralByAddress(executorAddress);
  if (referral) {
    const referrerShare = (feeCollected * BigInt(15)) / BigInt(100); // 15%
    earnings.push({
      beneficiary: referral.referrer_address,
      amount: referrerShare,
      type: 'referral',
      routeId,
      tokenType,
      tokenMint
    });
  }

  // 2. Check if route has a creator (shared route)
  const route = await getRouteById(routeId);
  if (route.creator_address && route.creator_address !== executorAddress) {
    const creatorShare = (feeCollected * BigInt(15)) / BigInt(100); // 15%
    earnings.push({
      beneficiary: route.creator_address,
      amount: creatorShare,
      type: 'route_creator',
      routeId,
      tokenType,
      tokenMint
    });
  }

  // 3. Store pending earnings
  await storePendingEarnings(earnings);
}
```

---

## Payout Mechanism

### Confirmed: Automatic Weekly Payouts

- Backend runs **weekly cron job** (e.g., every Sunday at 00:00 UTC)
- Aggregates pending earnings by user and token type
- Executes batch transfers from protocol payout wallet
- Minimum payout threshold: 0.01 SOL (skip if below, roll over to next week)
- Users receive notification when payout is sent

**Requirements**:
- Protocol payout wallet with sufficient funds
- Monitoring for failed transactions
- Retry mechanism for failed payouts
- Admin dashboard to view payout history

**Payout Flow**:
```
1. Cron job triggers weekly
2. Query all pending earnings grouped by (user, token_type)
3. Filter out amounts below threshold
4. For each payout:
   a. Create transfer instruction
   b. Sign with protocol wallet
   c. Submit transaction
   d. Mark earnings as 'paid' with tx signature
   e. Send notification to user
5. Log any failures for manual review
```

---

## Security Considerations

1. **Referral Fraud Prevention**
   - One referral per wallet (can't re-refer yourself)
   - Minimum transaction threshold before referral counts
   - Rate limiting on referral code generation

2. **Sybil Resistance**
   - Consider requiring minimum stake/transaction history
   - Monitor for suspicious patterns (many referrals, no transactions)

3. **Claim Verification**
   - Verify wallet ownership before claim
   - Implement cooldown between claims

---

## Configuration (Admin)

```typescript
interface ReferralConfig {
  enabled: boolean;
  referrerShareBps: number;      // Default: 1500 (15%)
  routeCreatorShareBps: number;  // Default: 1500 (15%)
  minClaimLamports: bigint;      // Default: 10_000_000 (0.01 SOL)
  referralCodeLength: number;    // Default: 8
  maxReferralsPerUser: number;   // Default: unlimited (-1)
}
```

---

## Success Metrics

1. **Acquisition**: Number of users acquired via referral
2. **Activation**: % of referred users who complete first transaction
3. **Revenue**: Total fees generated from referred users
4. **Virality**: Average referrals per referring user
5. **Route Sharing**: Number of shared routes used by others

---

## Implementation Phases

### Phase 1: Basic Referral (Week 1-2)
- Database schema
- Referral code generation
- Referral tracking (localStorage + API)
- Basic dashboard UI

### Phase 2: Route Sharing (Week 2-3)
- Route share functionality
- Share link generation
- Shared route preview page
- Creator earnings tracking

### Phase 3: Payouts (Week 3-4)
- Earnings calculation on route execution
- Claim functionality
- Earnings history
- Admin configuration

---

## Confirmed Decisions

| Question | Decision |
|----------|----------|
| Fee Split | 10% referrer, 10% creator (80% treasury) |
| Payout Method | Automatic weekly payouts |
| Easy Routes | No creator fees (referral only) |
| V1 Scope | Full system |

---

## Remaining Open Questions

1. **Referral Code Format**: Should codes be random (ABC123) or customizable (username)?
2. **Minimum Payout Threshold**: 0.01 SOL or different amount?
3. **Referral Expiry**: Do referral relationships expire? (e.g., only earn for 1 year)
4. **SPL Token Payouts**: Pay in same token as transaction, or convert to SOL?
5. **Protocol Payout Wallet**: Who manages the keys? Multi-sig?
6. **Notification System**: Email, in-app, or both for payout notifications?
7. **Anti-Fraud Measures**: What's the minimum transaction before referral counts?
8. **Route Sharing Privacy**: Can creators choose to share anonymously?

