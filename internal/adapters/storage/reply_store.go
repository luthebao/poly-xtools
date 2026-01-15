package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"xtools/internal/domain"
	"xtools/internal/ports"
)

// SQLiteReplyStore implements ReplyStore using SQLite
type SQLiteReplyStore struct {
	db *sql.DB
}

// NewSQLiteReplyStore creates a new reply store
func NewSQLiteReplyStore(db *sql.DB) (*SQLiteReplyStore, error) {
	store := &SQLiteReplyStore{db: db}
	if err := store.migrate(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *SQLiteReplyStore) migrate() error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS pending_replies (
			id TEXT PRIMARY KEY,
			account_id TEXT NOT NULL,
			reply_json TEXT NOT NULL,
			original_tweet_json TEXT NOT NULL,
			queued_at DATETIME NOT NULL,
			expires_at DATETIME NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_pending_account ON pending_replies(account_id)`,
		`CREATE TABLE IF NOT EXISTS replies (
			id TEXT PRIMARY KEY,
			account_id TEXT NOT NULL,
			tweet_id TEXT NOT NULL,
			text TEXT NOT NULL,
			status TEXT NOT NULL,
			generated_at DATETIME NOT NULL,
			posted_at DATETIME,
			posted_reply_id TEXT,
			llm_tokens_used INTEGER,
			error_message TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS idx_replies_account ON replies(account_id)`,
	}

	for _, m := range migrations {
		if _, err := s.db.Exec(m); err != nil {
			return fmt.Errorf("reply store migration failed: %w", err)
		}
	}

	return nil
}

// AddPendingReply adds a reply to the approval queue
func (s *SQLiteReplyStore) AddPendingReply(item domain.ApprovalQueueItem) error {
	replyJSON, err := json.Marshal(item.Reply)
	if err != nil {
		return err
	}

	tweetJSON, err := json.Marshal(item.OriginalTweet)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(`
		INSERT INTO pending_replies (id, account_id, reply_json, original_tweet_json, queued_at, expires_at)
		VALUES (?, ?, ?, ?, ?, ?)`,
		item.Reply.ID, item.Reply.AccountID, string(replyJSON), string(tweetJSON),
		item.QueuedAt, item.ExpiresAt)

	return err
}

// GetPendingReplies returns pending replies for an account (or all if accountID is empty)
func (s *SQLiteReplyStore) GetPendingReplies(accountID string) ([]domain.ApprovalQueueItem, error) {
	var rows *sql.Rows
	var err error

	if accountID == "" {
		// Return all pending replies when no account specified
		rows, err = s.db.Query(`
			SELECT id, reply_json, original_tweet_json, queued_at, expires_at
			FROM pending_replies
			WHERE expires_at > ?
			ORDER BY queued_at ASC`,
			time.Now())
	} else {
		rows, err = s.db.Query(`
			SELECT id, reply_json, original_tweet_json, queued_at, expires_at
			FROM pending_replies
			WHERE account_id = ? AND expires_at > ?
			ORDER BY queued_at ASC`,
			accountID, time.Now())
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []domain.ApprovalQueueItem
	for rows.Next() {
		var id, replyJSON, tweetJSON string
		var item domain.ApprovalQueueItem

		if err := rows.Scan(&id, &replyJSON, &tweetJSON, &item.QueuedAt, &item.ExpiresAt); err != nil {
			continue
		}

		if err := json.Unmarshal([]byte(replyJSON), &item.Reply); err != nil {
			continue
		}
		if err := json.Unmarshal([]byte(tweetJSON), &item.OriginalTweet); err != nil {
			continue
		}

		items = append(items, item)
	}

	return items, nil
}

// UpdateReplyStatus updates a reply's status
func (s *SQLiteReplyStore) UpdateReplyStatus(replyID string, status domain.ReplyStatus) error {
	// First check pending_replies
	var accountID string
	err := s.db.QueryRow(`SELECT account_id FROM pending_replies WHERE id = ?`, replyID).Scan(&accountID)

	if err == nil {
		// Get the full reply from pending
		var replyJSON string
		s.db.QueryRow(`SELECT reply_json FROM pending_replies WHERE id = ?`, replyID).Scan(&replyJSON)

		var reply domain.Reply
		json.Unmarshal([]byte(replyJSON), &reply)
		reply.Status = status

		if status == domain.ReplyStatusApproved || status == domain.ReplyStatusRejected ||
			status == domain.ReplyStatusPosted || status == domain.ReplyStatusFailed {
			// Move to replies table
			s.SaveReply(reply)
			s.RemovePendingReply(replyID)
		} else {
			// Update in pending_replies
			updatedJSON, _ := json.Marshal(reply)
			_, err = s.db.Exec(`UPDATE pending_replies SET reply_json = ? WHERE id = ?`,
				string(updatedJSON), replyID)
		}
		return err
	}

	// Update in replies table
	_, err = s.db.Exec(`UPDATE replies SET status = ? WHERE id = ?`, string(status), replyID)
	return err
}

// RemovePendingReply removes a reply from the pending queue
func (s *SQLiteReplyStore) RemovePendingReply(replyID string) error {
	_, err := s.db.Exec(`DELETE FROM pending_replies WHERE id = ?`, replyID)
	return err
}

// SaveReply saves a reply to the history
func (s *SQLiteReplyStore) SaveReply(reply domain.Reply) error {
	_, err := s.db.Exec(`
		INSERT OR REPLACE INTO replies
		(id, account_id, tweet_id, text, status, generated_at, posted_at, posted_reply_id, llm_tokens_used, error_message)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		reply.ID, reply.AccountID, reply.TweetID, reply.Text, string(reply.Status),
		reply.GeneratedAt, reply.PostedAt, reply.PostedReplyID, reply.LLMTokensUsed, reply.ErrorMessage)
	return err
}

// GetReplies returns replies for an account
func (s *SQLiteReplyStore) GetReplies(accountID string, limit int) ([]domain.Reply, error) {
	rows, err := s.db.Query(`
		SELECT id, account_id, tweet_id, text, status, generated_at, posted_at, posted_reply_id, llm_tokens_used, error_message
		FROM replies
		WHERE account_id = ?
		ORDER BY generated_at DESC
		LIMIT ?`,
		accountID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var replies []domain.Reply
	for rows.Next() {
		var reply domain.Reply
		var status string
		var postedAt sql.NullTime

		if err := rows.Scan(&reply.ID, &reply.AccountID, &reply.TweetID, &reply.Text,
			&status, &reply.GeneratedAt, &postedAt, &reply.PostedReplyID,
			&reply.LLMTokensUsed, &reply.ErrorMessage); err != nil {
			continue
		}

		reply.Status = domain.ReplyStatus(status)
		if postedAt.Valid {
			reply.PostedAt = &postedAt.Time
		}

		replies = append(replies, reply)
	}

	return replies, nil
}

// GetReplyByID returns a specific reply
func (s *SQLiteReplyStore) GetReplyByID(replyID string) (*domain.Reply, error) {
	var reply domain.Reply
	var status string
	var postedAt sql.NullTime

	err := s.db.QueryRow(`
		SELECT id, account_id, tweet_id, text, status, generated_at, posted_at, posted_reply_id, llm_tokens_used, error_message
		FROM replies
		WHERE id = ?`,
		replyID).Scan(&reply.ID, &reply.AccountID, &reply.TweetID, &reply.Text,
		&status, &reply.GeneratedAt, &postedAt, &reply.PostedReplyID,
		&reply.LLMTokensUsed, &reply.ErrorMessage)

	if err == sql.ErrNoRows {
		return nil, domain.ErrAccountNotFound
	}
	if err != nil {
		return nil, err
	}

	reply.Status = domain.ReplyStatus(status)
	if postedAt.Valid {
		reply.PostedAt = &postedAt.Time
	}

	return &reply, nil
}

// Ensure SQLiteReplyStore implements ReplyStore interface
var _ ports.ReplyStore = (*SQLiteReplyStore)(nil)
