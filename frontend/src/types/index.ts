// Account types
export type AuthType = string;
export type ApprovalMode = string;
export type ReplyMethod = string;
export type ReplyStatus = string;

export interface APICredentials {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessSecret: string;
    bearerToken: string;
}

export interface Cookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    secure: boolean;
    httpOnly: boolean;
}

export interface BrowserAuth {
    cookies: Cookie[];
    userAgent: string;
    proxyUrl?: string;
}

export interface LLMConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    persona: string;
}

export interface SearchConfig {
    keywords: string[];
    excludeKeywords: string[];
    blocklist: string[];
    englishOnly: boolean;
    minFaves: number;
    minReplies: number;
    minRetweets: number;
    maxAgeMins: number;
    intervalSecs: number;
}

export interface ReplyConfig {
    approvalMode: ApprovalMode;
    replyMethod: ReplyMethod;
    maxReplyLength: number;
    tone: string;
    includeHashtags: boolean;
    signatureText?: string;
}

export interface RateLimits {
    searchesPerHour: number;
    repliesPerHour: number;
    repliesPerDay: number;
    minDelayBetween: number;
}

export interface AccountConfig {
    id: string;
    username: string;
    enabled: boolean;
    authType: AuthType;
    debugMode: boolean;
    apiCredentials?: APICredentials;
    browserAuth?: BrowserAuth;
    llmConfig: LLMConfig;
    searchConfig: SearchConfig;
    replyConfig: ReplyConfig;
    rateLimits: RateLimits;
}

export interface AccountStatus {
    isActive: boolean;
    isRunning: boolean;
    lastActivity: string;
    errorMessage: string;
    repliesSent: number;
    repliesQueued: number;
    rateLimitReset: string;
}

// Tweet types
export interface Tweet {
    id: string;
    authorId: string;
    authorUsername: string;
    authorName: string;
    authorBio: string;
    text: string;
    createdAt: string;
    language: string;
    likeCount: number;
    retweetCount: number;
    replyCount: number;
    viewCount: number;
    conversationId: string;
    inReplyToId?: string;
    threadTweets?: Tweet[];
    matchedKeywords: string[];
    discoveredAt: string;
    accountId: string;
}

export interface Reply {
    id: string;
    tweetId: string;
    accountId: string;
    text: string;
    generatedAt: string;
    postedAt?: string;
    status: ReplyStatus;
    llmTokensUsed: number;
    errorMessage?: string;
    postedReplyId?: string;
}

export interface ApprovalQueueItem {
    reply: Reply;
    originalTweet: Tweet;
    queuedAt: string;
    expiresAt: string;
}

// Metrics types
export interface ProfileSnapshot {
    accountId: string;
    timestamp: string;
    followersCount: number;
    followingCount: number;
    tweetCount: number;
    listedCount: number;
}

export interface ReplyPerformanceReport {
    accountId: string;
    period: string;
    totalReplies: number;
    successfulReplies: number;
    failedReplies: number;
    pendingReplies: number;
    avgLikesPerReply: number;
    avgImpressionsPerReply: number;
    topPerformingReplies: ReplyMetrics[];
}

export interface ReplyMetrics {
    replyId: string;
    accountId: string;
    originalTweetId: string;
    timestamp: string;
    likeCount: number;
    retweetCount: number;
    impressions: number;
}

export interface DailyStats {
    accountId: string;
    date: string;
    tweetsSearched: number;
    repliesGenerated: number;
    repliesSent: number;
    repliesFailed: number;
    tokensUsed: number;
}

// Activity log types
export type ActivityType = string;
export type ActivityLevel = string;

export interface ActivityLog {
    id: string;
    accountId: string;
    type: ActivityType;
    level: ActivityLevel;
    message: string;
    details?: string;
    timestamp: string;
}

// Update types
export interface UpdateInfo {
    currentVersion: string;
    latestVersion: string;
    isUpdateAvailable: boolean;
    releaseUrl?: string;
    releaseNotes?: string;
    publishedAt?: string;
}

// Polymarket types
export type PolymarketEventType = string;
export type OrderSide = string;
export type FreshnessLevel = string; // "" | "insider" | "fresh" | "newbie" | "fresher"

export interface WalletProfile {
    address: string;
    betCount: number;
    joinDate?: string; // When the wallet joined Polymarket (e.g., "Dec 2025")
    freshnessLevel: FreshnessLevel;
    isFresh: boolean;
    analyzedAt: string;
    freshThreshold: number;
    // Deprecated but kept for backward compatibility
    nonce?: number;
    totalTxCount?: number;
    isBrandNew?: boolean;
    // Optional fields
    firstSeen?: string;
    ageHours?: number;
    balanceMatic?: string;
    balanceUsdc?: string;
}

export interface FreshWalletSignal {
    confidence: number;
    factors: Record<string, number>;
    triggered: boolean;
}

export interface PolymarketEvent {
    id: number;
    eventType: PolymarketEventType;
    assetId: string;
    marketSlug: string;
    marketName: string;
    marketImage: string;
    marketLink: string;
    timestamp: any;
    rawData: string;
    price?: string;
    size?: string;
    side?: OrderSide;
    bestBid?: string;
    bestAsk?: string;
    feeRateBps?: number;

    // Trade-specific fields
    tradeId?: string;
    walletAddress?: string;
    outcome?: string;
    outcomeIndex?: number;
    eventSlug?: string;
    eventTitle?: string;
    traderName?: string;
    conditionId?: string;

    // Fresh wallet detection fields
    isFreshWallet?: boolean;
    walletProfile?: WalletProfile;
    riskSignals?: string[];
    riskScore?: number;
    freshWalletSignal?: FreshWalletSignal;
}

export interface PolymarketEventFilter {
    eventTypes?: PolymarketEventType[];
    marketName?: string;
    minPrice?: number;
    maxPrice?: number;
    side?: OrderSide;
    minSize?: number;
    limit?: number;
    offset?: number;
    freshWalletsOnly?: boolean;
    minRiskScore?: number;
    maxWalletNonce?: number;
}

export interface PolymarketWatcherStatus {
    isRunning: boolean;
    isConnecting?: boolean;
    connectedAt?: string;
    eventsReceived: number;
    tradesReceived?: number;
    freshWalletsFound?: number;
    lastEventAt?: string;
    errorMessage?: string;
    reconnectCount?: number;
    webSocketEndpoint?: string;
}

export interface DatabaseInfo {
    sizeBytes: number;
    sizeFormatted: string;
    eventCount: number;
    path: string;
}

export interface PolymarketConfig {
    enabled: boolean;
    minTradeSize: number;
    alertThreshold: number;
    // Fresh wallet detection thresholds (bet count based)
    freshInsiderMaxBets: number;
    freshWalletMaxBets: number;
    freshNewbieMaxBets: number;
    customFreshMaxBets: number;
    // Deprecated: RPC-based detection is no longer used
    polygonRpcUrl?: string;
    polygonRpcUrls?: string[];
    freshWalletMaxNonce?: number;
    freshWalletMaxAge?: number;
}
