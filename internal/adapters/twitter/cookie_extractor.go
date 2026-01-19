package twitter

import (
	"context"
	"fmt"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/rod/lib/proto"

	"xtools/internal/domain"
)

// CookieExtractor helps extract Twitter cookies via browser login
type CookieExtractor struct {
	browser *rod.Browser
	timeout time.Duration
}

// NewCookieExtractor creates a new cookie extractor
func NewCookieExtractor() *CookieExtractor {
	return &CookieExtractor{
		timeout: 5 * time.Minute, // User has 5 minutes to log in
	}
}

// ExtractCookies opens browser for login and extracts cookies
func (e *CookieExtractor) ExtractCookies(ctx context.Context) (*domain.BrowserAuth, error) {
	// Launch visible browser for user to log in with stealth settings
	path, _ := launcher.LookPath()
	u := launcher.New().
		Bin(path).
		Headless(false).
		// Anti-bot detection flags
		Set("disable-blink-features", "AutomationControlled").
		Set("disable-features", "IsolateOrigins,site-per-process").
		Set("disable-infobars").
		Set("disable-dev-shm-usage").
		Set("no-first-run").
		Set("no-default-browser-check").
		Delete("enable-automation").
		MustLaunch()

	e.browser = rod.New().ControlURL(u).MustConnect()
	defer e.browser.MustClose()

	// Create page with stealth scripts
	page := e.browser.MustPage("")

	// Inject stealth scripts before navigation to avoid detection
	e.injectStealthScripts(page)

	// Navigate to Twitter login
	page.MustNavigate("https://twitter.com/i/flow/login")
	page.MustWaitLoad()

	fmt.Println("[Cookie Extractor] Browser opened. Please log in to Twitter...")
	fmt.Println("[Cookie Extractor] Waiting for login (max 5 minutes)...")

	// Wait for successful login by checking for home page or auth cookie
	err := e.waitForLogin(ctx, page)
	if err != nil {
		return nil, fmt.Errorf("login timeout or cancelled: %w", err)
	}

	fmt.Println("[Cookie Extractor] Login detected! Extracting cookies...")

	// Extract cookies
	cookies, err := e.extractTwitterCookies(page)
	if err != nil {
		return nil, fmt.Errorf("failed to extract cookies: %w", err)
	}

	// Get user agent
	userAgent := page.MustEval(`() => navigator.userAgent`).String()

	return &domain.BrowserAuth{
		Cookies:   cookies,
		UserAgent: userAgent,
	}, nil
}

func (e *CookieExtractor) waitForLogin(ctx context.Context, page *rod.Page) error {
	timeout := time.After(e.timeout)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timeout:
			return fmt.Errorf("login timeout exceeded")
		case <-ticker.C:
			// Check if we have auth_token cookie (indicates successful login)
			cookies, err := page.Cookies([]string{"https://twitter.com"})
			if err != nil {
				continue
			}

			for _, c := range cookies {
				if c.Name == "auth_token" && c.Value != "" {
					// Wait a bit more to ensure all cookies are set
					time.Sleep(2 * time.Second)
					return nil
				}
			}

			// Also check URL - if redirected to home, login succeeded
			info := page.MustInfo()
			if info.URL == "https://twitter.com/home" || info.URL == "https://x.com/home" {
				time.Sleep(2 * time.Second)
				return nil
			}
		}
	}
}

func (e *CookieExtractor) extractTwitterCookies(page *rod.Page) ([]domain.Cookie, error) {
	// Get all cookies for twitter.com
	protoCookies, err := page.Cookies([]string{"https://twitter.com", "https://x.com"})
	if err != nil {
		return nil, err
	}

	var cookies []domain.Cookie
	essentialCookies := map[string]bool{
		"auth_token":    true,
		"ct0":           true,
		"twid":          true,
		"guest_id":      true,
		"guest_id_ads":  true,
		"personalization_id": true,
	}

	for _, c := range protoCookies {
		// Only keep essential cookies to avoid bloat
		if !essentialCookies[c.Name] {
			continue
		}

		cookie := protoCookieToDomain(c)
		cookies = append(cookies, cookie)
	}

	if len(cookies) == 0 {
		return nil, fmt.Errorf("no essential cookies found - login may have failed")
	}

	// Verify we have auth_token
	hasAuth := false
	for _, c := range cookies {
		if c.Name == "auth_token" {
			hasAuth = true
			break
		}
	}

	if !hasAuth {
		return nil, fmt.Errorf("auth_token cookie not found - login may have failed")
	}

	fmt.Printf("[Cookie Extractor] Extracted %d essential cookies\n", len(cookies))
	return cookies, nil
}

func protoCookieToDomain(c *proto.NetworkCookie) domain.Cookie {
	return domain.Cookie{
		Name:     c.Name,
		Value:    c.Value,
		Domain:   c.Domain,
		Path:     c.Path,
		Expires:  int64(c.Expires),
		Secure:   c.Secure,
		HttpOnly: c.HTTPOnly,
	}
}

// injectStealthScripts injects JavaScript to avoid bot detection
func (e *CookieExtractor) injectStealthScripts(page *rod.Page) {
	// Override webdriver property
	page.MustEvalOnNewDocument(`
		Object.defineProperty(navigator, 'webdriver', {
			get: () => undefined
		});
	`)

	// Override plugins to appear more realistic
	page.MustEvalOnNewDocument(`
		Object.defineProperty(navigator, 'plugins', {
			get: () => [
				{ name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
				{ name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
				{ name: 'Native Client', filename: 'internal-nacl-plugin' }
			]
		});
	`)

	// Override languages
	page.MustEvalOnNewDocument(`
		Object.defineProperty(navigator, 'languages', {
			get: () => ['en-US', 'en']
		});
	`)

	// Override permissions query
	page.MustEvalOnNewDocument(`
		const originalQuery = window.navigator.permissions.query;
		window.navigator.permissions.query = (parameters) => (
			parameters.name === 'notifications' ?
				Promise.resolve({ state: Notification.permission }) :
				originalQuery(parameters)
		);
	`)

	// Override chrome property
	page.MustEvalOnNewDocument(`
		window.chrome = {
			runtime: {},
			loadTimes: function() {},
			csi: function() {},
			app: {}
		};
	`)

	// Hide automation indicators in chrome
	page.MustEvalOnNewDocument(`
		Object.defineProperty(navigator, 'maxTouchPoints', {
			get: () => 0
		});
	`)
}

// Close cleans up the browser
func (e *CookieExtractor) Close() {
	if e.browser != nil {
		e.browser.MustClose()
	}
}
