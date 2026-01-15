package storage

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"

	"xtools/internal/domain"
	"xtools/internal/ports"
)

// YAMLConfigStore implements ConfigStore using YAML files
type YAMLConfigStore struct {
	baseDir string
	mu      sync.RWMutex
	cache   map[string]*domain.AccountConfig
}

// NewYAMLConfigStore creates a new YAML-based config store
func NewYAMLConfigStore(baseDir string) (*YAMLConfigStore, error) {
	// Ensure directory exists
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create config directory: %w", err)
	}

	store := &YAMLConfigStore{
		baseDir: baseDir,
		cache:   make(map[string]*domain.AccountConfig),
	}

	// Load existing configs into cache
	if err := store.loadAll(); err != nil {
		return nil, err
	}

	return store, nil
}

func (s *YAMLConfigStore) loadAll() error {
	entries, err := os.ReadDir(s.baseDir)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yml") {
			continue
		}

		accountID := strings.TrimSuffix(entry.Name(), ".yml")
		cfg, err := s.loadFromFile(accountID)
		if err != nil {
			continue // Skip invalid configs
		}
		s.cache[accountID] = cfg
	}

	return nil
}

func (s *YAMLConfigStore) loadFromFile(accountID string) (*domain.AccountConfig, error) {
	path := s.GetConfigPath(accountID)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg domain.AccountConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	// Ensure ID matches filename
	cfg.ID = accountID

	return &cfg, nil
}

// LoadAccount loads an account configuration
func (s *YAMLConfigStore) LoadAccount(accountID string) (*domain.AccountConfig, error) {
	s.mu.RLock()
	if cfg, ok := s.cache[accountID]; ok {
		s.mu.RUnlock()
		return cfg, nil
	}
	s.mu.RUnlock()

	// Try loading from file
	cfg, err := s.loadFromFile(accountID)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, domain.ErrAccountNotFound
		}
		return nil, err
	}

	s.mu.Lock()
	s.cache[accountID] = cfg
	s.mu.Unlock()

	return cfg, nil
}

// SaveAccount saves an account configuration
func (s *YAMLConfigStore) SaveAccount(cfg domain.AccountConfig) error {
	if cfg.ID == "" {
		return fmt.Errorf("account ID is required")
	}

	data, err := yaml.Marshal(&cfg)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	path := s.GetConfigPath(cfg.ID)
	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	s.mu.Lock()
	s.cache[cfg.ID] = &cfg
	s.mu.Unlock()

	return nil
}

// ListAccounts returns all account configurations
func (s *YAMLConfigStore) ListAccounts() ([]domain.AccountConfig, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	accounts := make([]domain.AccountConfig, 0, len(s.cache))
	for _, cfg := range s.cache {
		accounts = append(accounts, *cfg)
	}

	return accounts, nil
}

// DeleteAccount removes an account configuration
func (s *YAMLConfigStore) DeleteAccount(accountID string) error {
	path := s.GetConfigPath(accountID)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete config: %w", err)
	}

	s.mu.Lock()
	delete(s.cache, accountID)
	s.mu.Unlock()

	return nil
}

// WatchChanges watches for config file changes
func (s *YAMLConfigStore) WatchChanges(ctx context.Context) <-chan ports.ConfigChangeEvent {
	ch := make(chan ports.ConfigChangeEvent)

	// Simple implementation - could use fsnotify for real file watching
	go func() {
		defer close(ch)
		<-ctx.Done()
	}()

	return ch
}

// ReloadAccount reloads configuration from disk
func (s *YAMLConfigStore) ReloadAccount(accountID string) (*domain.AccountConfig, error) {
	cfg, err := s.loadFromFile(accountID)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	s.cache[accountID] = cfg
	s.mu.Unlock()

	return cfg, nil
}

// GetConfigPath returns the file path for an account config
func (s *YAMLConfigStore) GetConfigPath(accountID string) string {
	return filepath.Join(s.baseDir, accountID+".yml")
}

// CreateExampleConfig creates an example configuration file
func (s *YAMLConfigStore) CreateExampleConfig() error {
	example := domain.AccountConfig{
		ID:       "example_account",
		Username: "your_twitter_username",
		Enabled:  false,
		AuthType: domain.AuthTypeAPI,
		APICredentials: &domain.APICredentials{
			APIKey:       "your_api_key",
			APISecret:    "your_api_secret",
			AccessToken:  "your_access_token",
			AccessSecret: "your_access_secret",
			BearerToken:  "your_bearer_token",
		},
		LLMConfig: domain.LLMConfig{
			BaseURL:     "https://api.openai.com/v1",
			APIKey:      "your_openai_api_key",
			Model:       "gpt-4o-mini",
			Temperature: 0.7,
			MaxTokens:   20000,
			Persona:     "You are a helpful assistant that replies to tweets.",
		},
		SearchConfig: domain.SearchConfig{
			Keywords:        []string{"keyword1", "keyword2"},
			ExcludeKeywords: []string{"spam"},
			Blocklist:       []string{"blocked_user"},
			EnglishOnly:     true,
			MinFaves:        2,
			MinReplies:      12,
			MinRetweets:     10,
			MaxAgeMins:      60,
			IntervalSecs:    300,
		},
		ReplyConfig: domain.ReplyConfig{
			ApprovalMode:   domain.ApprovalModeQueue,
			MaxReplyLength: 280,
			Tone:           "professional",
		},
		RateLimits: domain.RateLimits{
			SearchesPerHour: 10,
			RepliesPerHour:  5,
			RepliesPerDay:   50,
			MinDelayBetween: 60,
		},
	}

	return s.SaveAccount(example)
}

// Ensure YAMLConfigStore implements ConfigStore interface
var _ ports.ConfigStore = (*YAMLConfigStore)(nil)
