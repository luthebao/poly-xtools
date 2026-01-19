export namespace domain {
	
	export class APICredentials {
	    apiKey: string;
	    apiSecret: string;
	    accessToken: string;
	    accessSecret: string;
	    bearerToken: string;
	
	    static createFrom(source: any = {}) {
	        return new APICredentials(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.apiKey = source["apiKey"];
	        this.apiSecret = source["apiSecret"];
	        this.accessToken = source["accessToken"];
	        this.accessSecret = source["accessSecret"];
	        this.bearerToken = source["bearerToken"];
	    }
	}
	export class RateLimits {
	    searchesPerHour: number;
	    repliesPerHour: number;
	    repliesPerDay: number;
	    minDelayBetween: number;
	
	    static createFrom(source: any = {}) {
	        return new RateLimits(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.searchesPerHour = source["searchesPerHour"];
	        this.repliesPerHour = source["repliesPerHour"];
	        this.repliesPerDay = source["repliesPerDay"];
	        this.minDelayBetween = source["minDelayBetween"];
	    }
	}
	export class ReplyConfig {
	    approvalMode: string;
	    replyMethod: string;
	    maxReplyLength: number;
	    tone: string;
	    includeHashtags: boolean;
	    signatureText?: string;
	
	    static createFrom(source: any = {}) {
	        return new ReplyConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.approvalMode = source["approvalMode"];
	        this.replyMethod = source["replyMethod"];
	        this.maxReplyLength = source["maxReplyLength"];
	        this.tone = source["tone"];
	        this.includeHashtags = source["includeHashtags"];
	        this.signatureText = source["signatureText"];
	    }
	}
	export class SearchConfig {
	    keywords: string[];
	    excludeKeywords: string[];
	    blocklist: string[];
	    englishOnly: boolean;
	    minFaves: number;
	    minReplies: number;
	    minRetweets: number;
	    maxAgeMins: number;
	    intervalSecs: number;
	
	    static createFrom(source: any = {}) {
	        return new SearchConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.keywords = source["keywords"];
	        this.excludeKeywords = source["excludeKeywords"];
	        this.blocklist = source["blocklist"];
	        this.englishOnly = source["englishOnly"];
	        this.minFaves = source["minFaves"];
	        this.minReplies = source["minReplies"];
	        this.minRetweets = source["minRetweets"];
	        this.maxAgeMins = source["maxAgeMins"];
	        this.intervalSecs = source["intervalSecs"];
	    }
	}
	export class LLMConfig {
	    baseUrl: string;
	    apiKey: string;
	    model: string;
	    temperature: number;
	    maxTokens: number;
	    persona: string;
	
	    static createFrom(source: any = {}) {
	        return new LLMConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.baseUrl = source["baseUrl"];
	        this.apiKey = source["apiKey"];
	        this.model = source["model"];
	        this.temperature = source["temperature"];
	        this.maxTokens = source["maxTokens"];
	        this.persona = source["persona"];
	    }
	}
	export class Cookie {
	    name: string;
	    value: string;
	    domain: string;
	    path: string;
	    expires: number;
	    secure: boolean;
	    httpOnly: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Cookie(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.value = source["value"];
	        this.domain = source["domain"];
	        this.path = source["path"];
	        this.expires = source["expires"];
	        this.secure = source["secure"];
	        this.httpOnly = source["httpOnly"];
	    }
	}
	export class BrowserAuth {
	    cookies: Cookie[];
	    userAgent: string;
	    proxyUrl?: string;
	
	    static createFrom(source: any = {}) {
	        return new BrowserAuth(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cookies = this.convertValues(source["cookies"], Cookie);
	        this.userAgent = source["userAgent"];
	        this.proxyUrl = source["proxyUrl"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AccountConfig {
	    id: string;
	    username: string;
	    enabled: boolean;
	    authType: string;
	    debugMode: boolean;
	    apiCredentials?: APICredentials;
	    browserAuth?: BrowserAuth;
	    llmConfig: LLMConfig;
	    searchConfig: SearchConfig;
	    replyConfig: ReplyConfig;
	    rateLimits: RateLimits;
	
	    static createFrom(source: any = {}) {
	        return new AccountConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.username = source["username"];
	        this.enabled = source["enabled"];
	        this.authType = source["authType"];
	        this.debugMode = source["debugMode"];
	        this.apiCredentials = this.convertValues(source["apiCredentials"], APICredentials);
	        this.browserAuth = this.convertValues(source["browserAuth"], BrowserAuth);
	        this.llmConfig = this.convertValues(source["llmConfig"], LLMConfig);
	        this.searchConfig = this.convertValues(source["searchConfig"], SearchConfig);
	        this.replyConfig = this.convertValues(source["replyConfig"], ReplyConfig);
	        this.rateLimits = this.convertValues(source["rateLimits"], RateLimits);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AccountStatus {
	    IsActive: boolean;
	    IsRunning: boolean;
	    // Go type: time
	    LastActivity: any;
	    ErrorMessage: string;
	    RepliesSent: number;
	    RepliesQueued: number;
	    // Go type: time
	    RateLimitReset: any;
	
	    static createFrom(source: any = {}) {
	        return new AccountStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.IsActive = source["IsActive"];
	        this.IsRunning = source["IsRunning"];
	        this.LastActivity = this.convertValues(source["LastActivity"], null);
	        this.ErrorMessage = source["ErrorMessage"];
	        this.RepliesSent = source["RepliesSent"];
	        this.RepliesQueued = source["RepliesQueued"];
	        this.RateLimitReset = this.convertValues(source["RateLimitReset"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ActivityLog {
	    id: string;
	    accountId: string;
	    type: string;
	    level: string;
	    message: string;
	    details?: string;
	    // Go type: time
	    timestamp: any;
	
	    static createFrom(source: any = {}) {
	        return new ActivityLog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.accountId = source["accountId"];
	        this.type = source["type"];
	        this.level = source["level"];
	        this.message = source["message"];
	        this.details = source["details"];
	        this.timestamp = this.convertValues(source["timestamp"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Tweet {
	    id: string;
	    authorId: string;
	    authorUsername: string;
	    authorName: string;
	    authorBio: string;
	    text: string;
	    // Go type: time
	    createdAt: any;
	    language: string;
	    likeCount: number;
	    retweetCount: number;
	    replyCount: number;
	    viewCount: number;
	    conversationId: string;
	    inReplyToId?: string;
	    threadTweets?: Tweet[];
	    matchedKeywords: string[];
	    // Go type: time
	    discoveredAt: any;
	    accountId: string;
	
	    static createFrom(source: any = {}) {
	        return new Tweet(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.authorId = source["authorId"];
	        this.authorUsername = source["authorUsername"];
	        this.authorName = source["authorName"];
	        this.authorBio = source["authorBio"];
	        this.text = source["text"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.language = source["language"];
	        this.likeCount = source["likeCount"];
	        this.retweetCount = source["retweetCount"];
	        this.replyCount = source["replyCount"];
	        this.viewCount = source["viewCount"];
	        this.conversationId = source["conversationId"];
	        this.inReplyToId = source["inReplyToId"];
	        this.threadTweets = this.convertValues(source["threadTweets"], Tweet);
	        this.matchedKeywords = source["matchedKeywords"];
	        this.discoveredAt = this.convertValues(source["discoveredAt"], null);
	        this.accountId = source["accountId"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Reply {
	    id: string;
	    tweetId: string;
	    accountId: string;
	    text: string;
	    // Go type: time
	    generatedAt: any;
	    // Go type: time
	    postedAt?: any;
	    status: string;
	    llmTokensUsed: number;
	    errorMessage?: string;
	    postedReplyId?: string;
	
	    static createFrom(source: any = {}) {
	        return new Reply(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.tweetId = source["tweetId"];
	        this.accountId = source["accountId"];
	        this.text = source["text"];
	        this.generatedAt = this.convertValues(source["generatedAt"], null);
	        this.postedAt = this.convertValues(source["postedAt"], null);
	        this.status = source["status"];
	        this.llmTokensUsed = source["llmTokensUsed"];
	        this.errorMessage = source["errorMessage"];
	        this.postedReplyId = source["postedReplyId"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ApprovalQueueItem {
	    reply: Reply;
	    originalTweet: Tweet;
	    // Go type: time
	    queuedAt: any;
	    // Go type: time
	    expiresAt: any;
	
	    static createFrom(source: any = {}) {
	        return new ApprovalQueueItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.reply = this.convertValues(source["reply"], Reply);
	        this.originalTweet = this.convertValues(source["originalTweet"], Tweet);
	        this.queuedAt = this.convertValues(source["queuedAt"], null);
	        this.expiresAt = this.convertValues(source["expiresAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class DailyStats {
	    accountId: string;
	    // Go type: time
	    date: any;
	    tweetsSearched: number;
	    repliesGenerated: number;
	    repliesSent: number;
	    repliesFailed: number;
	    tokensUsed: number;
	
	    static createFrom(source: any = {}) {
	        return new DailyStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.accountId = source["accountId"];
	        this.date = this.convertValues(source["date"], null);
	        this.tweetsSearched = source["tweetsSearched"];
	        this.repliesGenerated = source["repliesGenerated"];
	        this.repliesSent = source["repliesSent"];
	        this.repliesFailed = source["repliesFailed"];
	        this.tokensUsed = source["tokensUsed"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DatabaseInfo {
	    sizeBytes: number;
	    sizeFormatted: string;
	    eventCount: number;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new DatabaseInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sizeBytes = source["sizeBytes"];
	        this.sizeFormatted = source["sizeFormatted"];
	        this.eventCount = source["eventCount"];
	        this.path = source["path"];
	    }
	}
	export class FreshWalletSignal {
	    confidence: number;
	    factors: Record<string, number>;
	    triggered: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FreshWalletSignal(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.confidence = source["confidence"];
	        this.factors = source["factors"];
	        this.triggered = source["triggered"];
	    }
	}
	
	export class NotificationConfig {
	    enabled: boolean;
	    channel: string;
	    telegramBotToken: string;
	    telegramChatIDs: string[];
	    notifyBigTrades: boolean;
	    notifyFreshWallets: boolean;
	
	    static createFrom(source: any = {}) {
	        return new NotificationConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.channel = source["channel"];
	        this.telegramBotToken = source["telegramBotToken"];
	        this.telegramChatIDs = source["telegramChatIDs"];
	        this.notifyBigTrades = source["notifyBigTrades"];
	        this.notifyFreshWallets = source["notifyFreshWallets"];
	    }
	}
	export class PolymarketConfig {
	    enabled: boolean;
	    minTradeSize: number;
	    alertThreshold: number;
	    freshInsiderMaxBets: number;
	    freshWalletMaxBets: number;
	    freshNewbieMaxBets: number;
	    customFreshMaxBets: number;
	    polygonRpcUrl?: string;
	    polygonRpcUrls?: string[];
	    freshWalletMaxNonce?: number;
	    freshWalletMaxAge?: number;
	
	    static createFrom(source: any = {}) {
	        return new PolymarketConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.minTradeSize = source["minTradeSize"];
	        this.alertThreshold = source["alertThreshold"];
	        this.freshInsiderMaxBets = source["freshInsiderMaxBets"];
	        this.freshWalletMaxBets = source["freshWalletMaxBets"];
	        this.freshNewbieMaxBets = source["freshNewbieMaxBets"];
	        this.customFreshMaxBets = source["customFreshMaxBets"];
	        this.polygonRpcUrl = source["polygonRpcUrl"];
	        this.polygonRpcUrls = source["polygonRpcUrls"];
	        this.freshWalletMaxNonce = source["freshWalletMaxNonce"];
	        this.freshWalletMaxAge = source["freshWalletMaxAge"];
	    }
	}
	export class WalletProfile {
	    address: string;
	    betCount: number;
	    joinDate: string;
	    freshnessLevel: string;
	    isFresh: boolean;
	    // Go type: time
	    analyzedAt: any;
	    freshThreshold: number;
	    nonce?: number;
	    totalTxCount?: number;
	    isBrandNew?: boolean;
	    // Go type: time
	    firstSeen?: any;
	    ageHours?: number;
	    balanceMatic?: string;
	    balanceUsdc?: string;
	
	    static createFrom(source: any = {}) {
	        return new WalletProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.address = source["address"];
	        this.betCount = source["betCount"];
	        this.joinDate = source["joinDate"];
	        this.freshnessLevel = source["freshnessLevel"];
	        this.isFresh = source["isFresh"];
	        this.analyzedAt = this.convertValues(source["analyzedAt"], null);
	        this.freshThreshold = source["freshThreshold"];
	        this.nonce = source["nonce"];
	        this.totalTxCount = source["totalTxCount"];
	        this.isBrandNew = source["isBrandNew"];
	        this.firstSeen = this.convertValues(source["firstSeen"], null);
	        this.ageHours = source["ageHours"];
	        this.balanceMatic = source["balanceMatic"];
	        this.balanceUsdc = source["balanceUsdc"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PolymarketEvent {
	    id: number;
	    eventType: string;
	    assetId: string;
	    marketSlug: string;
	    marketName: string;
	    marketImage: string;
	    marketLink: string;
	    // Go type: time
	    timestamp: any;
	    rawData: string;
	    price?: string;
	    size?: string;
	    side?: string;
	    bestBid?: string;
	    bestAsk?: string;
	    feeRateBps?: number;
	    tradeId?: string;
	    walletAddress?: string;
	    outcome?: string;
	    outcomeIndex?: number;
	    eventSlug?: string;
	    eventTitle?: string;
	    traderName?: string;
	    conditionId?: string;
	    isFreshWallet?: boolean;
	    walletProfile?: WalletProfile;
	    riskSignals?: string[];
	    riskScore?: number;
	    freshWalletSignal?: FreshWalletSignal;
	
	    static createFrom(source: any = {}) {
	        return new PolymarketEvent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.eventType = source["eventType"];
	        this.assetId = source["assetId"];
	        this.marketSlug = source["marketSlug"];
	        this.marketName = source["marketName"];
	        this.marketImage = source["marketImage"];
	        this.marketLink = source["marketLink"];
	        this.timestamp = this.convertValues(source["timestamp"], null);
	        this.rawData = source["rawData"];
	        this.price = source["price"];
	        this.size = source["size"];
	        this.side = source["side"];
	        this.bestBid = source["bestBid"];
	        this.bestAsk = source["bestAsk"];
	        this.feeRateBps = source["feeRateBps"];
	        this.tradeId = source["tradeId"];
	        this.walletAddress = source["walletAddress"];
	        this.outcome = source["outcome"];
	        this.outcomeIndex = source["outcomeIndex"];
	        this.eventSlug = source["eventSlug"];
	        this.eventTitle = source["eventTitle"];
	        this.traderName = source["traderName"];
	        this.conditionId = source["conditionId"];
	        this.isFreshWallet = source["isFreshWallet"];
	        this.walletProfile = this.convertValues(source["walletProfile"], WalletProfile);
	        this.riskSignals = source["riskSignals"];
	        this.riskScore = source["riskScore"];
	        this.freshWalletSignal = this.convertValues(source["freshWalletSignal"], FreshWalletSignal);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PolymarketEventFilter {
	    eventTypes?: string[];
	    marketName?: string;
	    minPrice?: number;
	    maxPrice?: number;
	    side?: string;
	    minSize?: number;
	    limit?: number;
	    offset?: number;
	    freshWalletsOnly?: boolean;
	    minRiskScore?: number;
	    maxWalletNonce?: number;
	
	    static createFrom(source: any = {}) {
	        return new PolymarketEventFilter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.eventTypes = source["eventTypes"];
	        this.marketName = source["marketName"];
	        this.minPrice = source["minPrice"];
	        this.maxPrice = source["maxPrice"];
	        this.side = source["side"];
	        this.minSize = source["minSize"];
	        this.limit = source["limit"];
	        this.offset = source["offset"];
	        this.freshWalletsOnly = source["freshWalletsOnly"];
	        this.minRiskScore = source["minRiskScore"];
	        this.maxWalletNonce = source["maxWalletNonce"];
	    }
	}
	export class PolymarketWatcherStatus {
	    isRunning: boolean;
	    isConnecting: boolean;
	    // Go type: time
	    connectedAt?: any;
	    eventsReceived: number;
	    tradesReceived: number;
	    freshWalletsFound: number;
	    // Go type: time
	    lastEventAt?: any;
	    errorMessage?: string;
	    reconnectCount: number;
	    webSocketEndpoint: string;
	
	    static createFrom(source: any = {}) {
	        return new PolymarketWatcherStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.isRunning = source["isRunning"];
	        this.isConnecting = source["isConnecting"];
	        this.connectedAt = this.convertValues(source["connectedAt"], null);
	        this.eventsReceived = source["eventsReceived"];
	        this.tradesReceived = source["tradesReceived"];
	        this.freshWalletsFound = source["freshWalletsFound"];
	        this.lastEventAt = this.convertValues(source["lastEventAt"], null);
	        this.errorMessage = source["errorMessage"];
	        this.reconnectCount = source["reconnectCount"];
	        this.webSocketEndpoint = source["webSocketEndpoint"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ProfileSnapshot {
	    accountId: string;
	    // Go type: time
	    timestamp: any;
	    followersCount: number;
	    followingCount: number;
	    tweetCount: number;
	    listedCount: number;
	
	    static createFrom(source: any = {}) {
	        return new ProfileSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.accountId = source["accountId"];
	        this.timestamp = this.convertValues(source["timestamp"], null);
	        this.followersCount = source["followersCount"];
	        this.followingCount = source["followingCount"];
	        this.tweetCount = source["tweetCount"];
	        this.listedCount = source["listedCount"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class ReplyMetrics {
	    replyId: string;
	    accountId: string;
	    originalTweetId: string;
	    // Go type: time
	    timestamp: any;
	    likeCount: number;
	    retweetCount: number;
	    impressions: number;
	
	    static createFrom(source: any = {}) {
	        return new ReplyMetrics(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.replyId = source["replyId"];
	        this.accountId = source["accountId"];
	        this.originalTweetId = source["originalTweetId"];
	        this.timestamp = this.convertValues(source["timestamp"], null);
	        this.likeCount = source["likeCount"];
	        this.retweetCount = source["retweetCount"];
	        this.impressions = source["impressions"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ReplyPerformanceReport {
	    accountId: string;
	    period: string;
	    totalReplies: number;
	    successfulReplies: number;
	    failedReplies: number;
	    pendingReplies: number;
	    avgLikesPerReply: number;
	    avgImpressionsPerReply: number;
	    topPerformingReplies: ReplyMetrics[];
	
	    static createFrom(source: any = {}) {
	        return new ReplyPerformanceReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.accountId = source["accountId"];
	        this.period = source["period"];
	        this.totalReplies = source["totalReplies"];
	        this.successfulReplies = source["successfulReplies"];
	        this.failedReplies = source["failedReplies"];
	        this.pendingReplies = source["pendingReplies"];
	        this.avgLikesPerReply = source["avgLikesPerReply"];
	        this.avgImpressionsPerReply = source["avgImpressionsPerReply"];
	        this.topPerformingReplies = this.convertValues(source["topPerformingReplies"], ReplyMetrics);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	

}

export namespace updater {
	
	export class UpdateInfo {
	    currentVersion: string;
	    latestVersion: string;
	    isUpdateAvailable: boolean;
	    releaseUrl: string;
	    releaseNotes: string;
	    publishedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.isUpdateAvailable = source["isUpdateAvailable"];
	        this.releaseUrl = source["releaseUrl"];
	        this.releaseNotes = source["releaseNotes"];
	        this.publishedAt = source["publishedAt"];
	    }
	}

}

