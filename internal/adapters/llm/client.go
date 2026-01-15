package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"xtools/internal/domain"
	"xtools/internal/ports"
)

// OpenAIClient implements LLMProvider for OpenAI-compatible APIs
type OpenAIClient struct {
	config     domain.LLMConfig
	httpClient *http.Client
}

// NewOpenAIClient creates a new OpenAI-compatible LLM client
func NewOpenAIClient(config domain.LLMConfig) (*OpenAIClient, error) {
	if config.APIKey == "" {
		return nil, fmt.Errorf("API key is required")
	}
	if config.BaseURL == "" {
		config.BaseURL = "https://api.openai.com/v1"
	}
	if config.Model == "" {
		config.Model = "gpt-4o-mini"
	}
	if config.MaxTokens == 0 {
		config.MaxTokens = 280
	}
	if config.Temperature == 0 {
		config.Temperature = 0.7
	}

	return &OpenAIClient{
		config: config,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}, nil
}

// ChatRequest represents the OpenAI chat completion request
type ChatRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
	Temperature float64       `json:"temperature,omitempty"`
}

// ChatMessage represents a message in the chat
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatResponse represents the OpenAI chat completion response
type ChatResponse struct {
	ID      string         `json:"id"`
	Choices []ChatChoice   `json:"choices"`
	Usage   *ChatUsage     `json:"usage,omitempty"`
	Error   *APIError      `json:"error,omitempty"`
}

// ChatChoice represents a response choice
type ChatChoice struct {
	Index        int         `json:"index"`
	Message      ChatMessage `json:"message"`
	FinishReason string      `json:"finish_reason"`
}

// ChatUsage represents token usage
type ChatUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// APIError represents an API error
type APIError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Code    string `json:"code"`
}

// GenerateReply generates a reply for a tweet
func (c *OpenAIClient) GenerateReply(ctx context.Context, req ports.ReplyRequest) (*ports.ReplyResponse, error) {
	systemPrompt := c.buildSystemPrompt(req)
	userPrompt := c.buildUserPrompt(req)

	chatReq := ChatRequest{
		Model:       c.config.Model,
		MaxTokens:   c.config.MaxTokens,
		Temperature: c.config.Temperature,
		Messages: []ChatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
	}

	body, err := json.Marshal(chatReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		strings.TrimSuffix(c.config.BaseURL, "/")+"/chat/completions",
		bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Authorization", "Bearer "+c.config.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var chatResp ChatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if chatResp.Error != nil {
		return nil, fmt.Errorf("API error: %s", chatResp.Error.Message)
	}

	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("no response generated")
	}

	replyText := strings.TrimSpace(chatResp.Choices[0].Message.Content)

	// Ensure reply fits character limit
	if len(replyText) > req.MaxLength && req.MaxLength > 0 {
		replyText = c.truncateReply(replyText, req.MaxLength)
	}

	tokensUsed := 0
	if chatResp.Usage != nil {
		tokensUsed = chatResp.Usage.TotalTokens
	}

	return &ports.ReplyResponse{
		Text:       replyText,
		Confidence: 1.0,
		TokensUsed: tokensUsed,
		Model:      c.config.Model,
		Fallback:   false,
	}, nil
}

func (c *OpenAIClient) buildSystemPrompt(req ports.ReplyRequest) string {
	if c.config.Persona != "" {
		return c.config.Persona
	}

	// Default system prompt
	prompt := `You are a helpful Twitter bot that generates engaging, relevant replies to tweets.

Guidelines:
- Keep replies under 280 characters
- Be conversational and add value to the discussion
- Match the tone of the conversation
- Don't be promotional or spammy
- Be respectful and constructive`

	if req.Tone != "" {
		prompt += fmt.Sprintf("\n- Maintain a %s tone", req.Tone)
	}

	if req.IncludeHashtags {
		prompt += "\n- Include relevant hashtags when appropriate"
	}

	return prompt
}

func (c *OpenAIClient) buildUserPrompt(req ports.ReplyRequest) string {
	var sb strings.Builder

	// Post content
	sb.WriteString("## Post Content\n")
	sb.WriteString(fmt.Sprintf("@%s: %s\n\n", req.OriginalTweet.AuthorUsername, req.OriginalTweet.Text))

	// Author bio
	if req.AuthorBio != "" {
		sb.WriteString("## Author Bio\n")
		sb.WriteString(fmt.Sprintf("%s\n\n", req.AuthorBio))
	}

	// Thread context
	if len(req.ThreadContext) > 0 {
		sb.WriteString("## Thread Context\n")
		for i, t := range req.ThreadContext {
			if i >= 3 {
				break
			}
			sb.WriteString(fmt.Sprintf("- @%s: %s\n", t.AuthorUsername, t.Text))
		}
		sb.WriteString("\n")
	}

	// Matched keywords for context
	if len(req.Keywords) > 0 {
		sb.WriteString("## Matched Keywords\n")
		sb.WriteString(fmt.Sprintf("%s\n\n", strings.Join(req.Keywords, ", ")))
	}

	// Instructions
	sb.WriteString("## Task\n")
	maxLen := req.MaxLength
	if maxLen <= 0 {
		maxLen = 260
	}
	sb.WriteString(fmt.Sprintf("Write a reply to this post in %d characters or less.\n", maxLen))
	sb.WriteString("Output only the reply text, nothing else.")

	return sb.String()
}

func (c *OpenAIClient) truncateReply(text string, maxLen int) string {
	if len(text) <= maxLen {
		return text
	}

	// Try to truncate at word boundary
	truncated := text[:maxLen-3]
	lastSpace := strings.LastIndex(truncated, " ")
	if lastSpace > maxLen/2 {
		truncated = truncated[:lastSpace]
	}

	return truncated + "..."
}

// ValidateConfig checks if the configuration is valid
func (c *OpenAIClient) ValidateConfig() error {
	if c.config.APIKey == "" {
		return fmt.Errorf("API key is required")
	}
	if c.config.BaseURL == "" {
		return fmt.Errorf("base URL is required")
	}
	return nil
}

// GetModelInfo returns information about the configured model
func (c *OpenAIClient) GetModelInfo() ports.ModelInfo {
	return ports.ModelInfo{
		Provider:    "openai-compatible",
		Model:       c.config.Model,
		MaxTokens:   c.config.MaxTokens,
		Temperature: c.config.Temperature,
	}
}

// Close cleans up resources
func (c *OpenAIClient) Close() error {
	return nil
}

// ProviderFactory creates LLM providers
type ProviderFactory struct{}

// NewProviderFactory creates a new factory
func NewProviderFactory() *ProviderFactory {
	return &ProviderFactory{}
}

// CreateProvider creates an LLM provider from config
func (f *ProviderFactory) CreateProvider(cfg domain.LLMConfig) (ports.LLMProvider, error) {
	return NewOpenAIClient(cfg)
}

// Ensure OpenAIClient implements LLMProvider interface
var _ ports.LLMProvider = (*OpenAIClient)(nil)
var _ ports.LLMProviderFactory = (*ProviderFactory)(nil)
