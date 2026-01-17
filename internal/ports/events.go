package ports

// EventBus handles backend-to-frontend communication
type EventBus interface {
	// Emit sends an event to the frontend
	Emit(eventName string, data interface{})

	// EmitTo sends an event for a specific account
	EmitTo(accountID string, eventName string, data interface{})

	// Subscribe allows backend components to listen to events
	Subscribe(eventName string, handler EventHandler) func()

	// Unsubscribe removes an event handler
	Unsubscribe(eventName string, handler EventHandler)
}

// EventHandler is a callback for event handling
type EventHandler func(data interface{})

// Event names (constants)
const (
	// Tweet events
	EventTweetFound     = "tweet:found"
	EventTweetSearched  = "tweet:searched"

	// Reply events
	EventReplyGenerated = "reply:generated"
	EventReplyPosted    = "reply:posted"
	EventReplyFailed    = "reply:failed"
	EventReplyApproved  = "reply:approved"
	EventReplyRejected  = "reply:rejected"

	// Approval queue events
	EventApprovalRequired = "approval:required"
	EventApprovalQueueUpdated = "approval:queue_updated"

	// Metrics events
	EventMetricsUpdated = "metrics:updated"

	// Rate limit events
	EventRateLimitHit   = "ratelimit:hit"
	EventRateLimitReset = "ratelimit:reset"

	// Account events
	EventAccountStarted = "account:started"
	EventAccountStopped = "account:stopped"
	EventAccountError   = "account:error"
	EventAccountUpdated = "account:updated"

	// Worker events
	EventWorkerStatus   = "worker:status"
	EventWorkerError    = "worker:error"

	// Polymarket events
	EventPolymarketEvent = "polymarket:event"
)

// TweetFoundEvent payload
type TweetFoundEvent struct {
	AccountID string      `json:"accountId"`
	Tweet     interface{} `json:"tweet"`
	Keyword   string      `json:"keyword"`
}

// ReplyEvent payload for reply-related events
type ReplyEvent struct {
	AccountID string      `json:"accountId"`
	Reply     interface{} `json:"reply"`
	TweetID   string      `json:"tweetId"`
	Error     string      `json:"error,omitempty"`
}

// AccountStatusEvent payload
type AccountStatusEvent struct {
	AccountID string `json:"accountId"`
	Status    string `json:"status"`
	Message   string `json:"message,omitempty"`
	Error     string `json:"error,omitempty"`
}

// WorkerStatusEvent payload
type WorkerStatusEvent struct {
	AccountID    string `json:"accountId"`
	WorkerType   string `json:"workerType"`
	IsRunning    bool   `json:"isRunning"`
	LastActivity string `json:"lastActivity"`
	NextRun      string `json:"nextRun,omitempty"`
}
