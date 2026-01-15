import { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, Key, Loader2 } from 'lucide-react';
import Button from './common/Button';
import { AccountConfig } from '../types';
import { ExtractCookies } from '../../wailsjs/go/main/App';

interface AccountEditorProps {
  account: AccountConfig | null;
  isCreating?: boolean;
  onSave: (account: AccountConfig) => void;
  onClose: () => void;
  showToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function AccountEditor({ account, isCreating, onSave, onClose, showToast }: AccountEditorProps) {
  const [formData, setFormData] = useState<Partial<AccountConfig>>({});
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    if (account) {
      setFormData(account);
    }
  }, [account]);

  if (!account) return null;

  const handleChange = (path: string, value: any) => {
    setFormData((prev) => {
      const newData = JSON.parse(JSON.stringify(prev)); // Deep clone
      const parts = path.split('.');
      let current: any = newData;

      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;

      return newData;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData as AccountConfig);
  };

  const addArrayItem = (path: string) => {
    const currentArray = path.split('.').reduce((obj: any, key) => obj?.[key], formData) || [];
    handleChange(path, [...currentArray, '']);
  };

  const removeArrayItem = (path: string, index: number) => {
    const currentArray = path.split('.').reduce((obj: any, key) => obj?.[key], formData) || [];
    handleChange(path, currentArray.filter((_: any, i: number) => i !== index));
  };

  const updateArrayItem = (path: string, index: number, value: string) => {
    const currentArray = path.split('.').reduce((obj: any, key) => obj?.[key], formData) || [];
    const newArray = [...currentArray];
    newArray[index] = value;
    handleChange(path, newArray);
  };

  const handleExtractCookies = async () => {
    setIsExtracting(true);
    showToast?.('Browser opening... Please log in to Twitter', 'info');

    try {
      const auth = await ExtractCookies();
      if (auth) {
        handleChange('browserAuth', auth);
        showToast?.('Cookies extracted successfully!', 'success');
      }
    } catch (err: any) {
      const errorMsg = typeof err === 'string' ? err : (err?.message || 'Failed to extract cookies');
      showToast?.(errorMsg, 'error');
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold">
            {isCreating ? 'Add Account' : `Edit Account: @${account.username}`}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          <div className="space-y-6">
            {/* Basic Info */}
            <section>
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Basic Info</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={formData.username || ''}
                    onChange={(e) => handleChange('username', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    placeholder="Twitter username (without @)"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Search Method</label>
                  <select
                    value={formData.authType || 'browser'}
                    onChange={(e) => handleChange('authType', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                  >
                    <option value="browser">Browser (Cookies for search)</option>
                    <option value="api">API Only (Bearer for search)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Replies always use API credentials</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Enabled</label>
                  <select
                    value={formData.enabled ? 'true' : 'false'}
                    onChange={(e) => handleChange('enabled', e.target.value === 'true')}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.debugMode || false}
                      onChange={(e) => handleChange('debugMode', e.target.checked)}
                      className="rounded bg-gray-700 border-gray-600"
                    />
                    <span className="text-sm text-gray-400">Debug Mode</span>
                    <span className="text-xs text-yellow-500">(10s interval, replies need approval)</span>
                  </label>
                </div>
              </div>
            </section>

            {/* Browser Auth - only shown for browser search method */}
            {formData.authType === 'browser' && (
              <section>
                <h3 className="text-sm font-semibold text-gray-400 mb-3">
                  Browser Authentication
                  <span className="text-xs text-blue-400 ml-2">(for searching)</span>
                </h3>
                <div className="space-y-3">
                  <div className="p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                    <p className="text-yellow-400 text-sm">
                      This will open a browser window. Log in to Twitter/X, and cookies will be automatically extracted after successful login.
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      onClick={handleExtractCookies}
                      disabled={isExtracting}
                    >
                      {isExtracting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Waiting for login...
                        </>
                      ) : (
                        <>
                          <Key size={16} />
                          Extract Cookies from Browser
                        </>
                      )}
                    </Button>

                    {formData.browserAuth?.cookies?.length ? (
                      <span className="text-green-400 text-sm">
                        {formData.browserAuth.cookies.length} cookies configured
                      </span>
                    ) : (
                      <span className="text-yellow-400 text-sm">No cookies configured</span>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* API Credentials - always shown (required for posting) */}
            <section>
              <h3 className="text-sm font-semibold text-gray-400 mb-3">
                API Credentials
                <span className="text-xs text-red-400 ml-2">(required for posting replies)</span>
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">API Key (Consumer Key)</label>
                    <input
                      type="password"
                      value={formData.apiCredentials?.apiKey || ''}
                      onChange={(e) => handleChange('apiCredentials.apiKey', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                      placeholder="Your API Key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">API Secret (Consumer Secret)</label>
                    <input
                      type="password"
                      value={formData.apiCredentials?.apiSecret || ''}
                      onChange={(e) => handleChange('apiCredentials.apiSecret', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                      placeholder="Your API Secret"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Access Token</label>
                    <input
                      type="password"
                      value={formData.apiCredentials?.accessToken || ''}
                      onChange={(e) => handleChange('apiCredentials.accessToken', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                      placeholder="Your Access Token"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Access Token Secret</label>
                    <input
                      type="password"
                      value={formData.apiCredentials?.accessSecret || ''}
                      onChange={(e) => handleChange('apiCredentials.accessSecret', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                      placeholder="Your Access Token Secret"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Bearer Token (for reading)</label>
                  <input
                    type="password"
                    value={formData.apiCredentials?.bearerToken || ''}
                    onChange={(e) => handleChange('apiCredentials.bearerToken', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    placeholder="Your Bearer Token"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Get these from the Twitter Developer Portal. OAuth 1.0a credentials are needed for posting replies.
                </p>
              </div>
            </section>

            {/* Search Config */}
            <section>
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Search Configuration</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-gray-400">Keywords</label>
                    <button
                      type="button"
                      onClick={() => addArrayItem('searchConfig.keywords')}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(formData.searchConfig?.keywords || []).map((keyword: string, index: number) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={keyword}
                          onChange={(e) => updateArrayItem('searchConfig.keywords', index, e.target.value)}
                          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                          placeholder="Enter keyword"
                        />
                        <button
                          type="button"
                          onClick={() => removeArrayItem('searchConfig.keywords', index)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {(!formData.searchConfig?.keywords || formData.searchConfig.keywords.length === 0) && (
                      <p className="text-sm text-gray-500 italic">No keywords added</p>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-gray-400">Exclude Keywords</label>
                    <button
                      type="button"
                      onClick={() => addArrayItem('searchConfig.excludeKeywords')}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(formData.searchConfig?.excludeKeywords || []).map((keyword: string, index: number) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={keyword}
                          onChange={(e) => updateArrayItem('searchConfig.excludeKeywords', index, e.target.value)}
                          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                          placeholder="Enter keyword to exclude"
                        />
                        <button
                          type="button"
                          onClick={() => removeArrayItem('searchConfig.excludeKeywords', index)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {(!formData.searchConfig?.excludeKeywords || formData.searchConfig.excludeKeywords.length === 0) && (
                      <p className="text-sm text-gray-500 italic">No exclude keywords added</p>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-gray-400">Blocklist (usernames to ignore)</label>
                    <button
                      type="button"
                      onClick={() => addArrayItem('searchConfig.blocklist')}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(formData.searchConfig?.blocklist || []).map((username: string, index: number) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => updateArrayItem('searchConfig.blocklist', index, e.target.value)}
                          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                          placeholder="Username to block"
                        />
                        <button
                          type="button"
                          onClick={() => removeArrayItem('searchConfig.blocklist', index)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {(!formData.searchConfig?.blocklist || formData.searchConfig.blocklist.length === 0) && (
                      <p className="text-sm text-gray-500 italic">No blocked users</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Interval (secs)</label>
                    <input
                      type="number"
                      value={formData.searchConfig?.intervalSecs || 300}
                      onChange={(e) => handleChange('searchConfig.intervalSecs', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Max Age (mins)</label>
                    <input
                      type="number"
                      value={formData.searchConfig?.maxAgeMins || 60}
                      onChange={(e) => handleChange('searchConfig.maxAgeMins', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Min Faves</label>
                    <input
                      type="number"
                      value={formData.searchConfig?.minFaves || 2}
                      onChange={(e) => handleChange('searchConfig.minFaves', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Min Replies</label>
                    <input
                      type="number"
                      value={formData.searchConfig?.minReplies || 12}
                      onChange={(e) => handleChange('searchConfig.minReplies', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Min Retweets</label>
                    <input
                      type="number"
                      value={formData.searchConfig?.minRetweets || 10}
                      onChange={(e) => handleChange('searchConfig.minRetweets', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.searchConfig?.englishOnly || false}
                      onChange={(e) => handleChange('searchConfig.englishOnly', e.target.checked)}
                      className="rounded bg-gray-700 border-gray-600"
                    />
                    <span className="text-sm text-gray-400">English Only</span>
                  </label>
                </div>
              </div>
            </section>

            {/* Reply Config */}
            <section>
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Reply Configuration</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Approval Mode</label>
                  <select
                    value={formData.replyConfig?.approvalMode || 'queue'}
                    onChange={(e) => handleChange('replyConfig.approvalMode', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                  >
                    <option value="auto">Auto (immediate)</option>
                    <option value="queue">Queue (manual approval)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Tone</label>
                  <input
                    type="text"
                    value={formData.replyConfig?.tone || ''}
                    onChange={(e) => handleChange('replyConfig.tone', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    placeholder="professional, friendly, casual"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Max Reply Length</label>
                  <input
                    type="number"
                    value={formData.replyConfig?.maxReplyLength || 280}
                    onChange={(e) => handleChange('replyConfig.maxReplyLength', parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.replyConfig?.includeHashtags || false}
                      onChange={(e) => handleChange('replyConfig.includeHashtags', e.target.checked)}
                      className="rounded bg-gray-700 border-gray-600"
                    />
                    <span className="text-sm text-gray-400">Include Hashtags in replies</span>
                  </label>
                </div>
              </div>
            </section>

            {/* LLM Config */}
            <section>
              <h3 className="text-sm font-semibold text-gray-400 mb-3">LLM Configuration</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Base URL</label>
                    <input
                      type="text"
                      value={formData.llmConfig?.baseUrl || ''}
                      onChange={(e) => handleChange('llmConfig.baseUrl', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Model</label>
                    <input
                      type="text"
                      value={formData.llmConfig?.model || ''}
                      onChange={(e) => handleChange('llmConfig.model', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                      placeholder="gpt-4"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">API Key</label>
                  <input
                    type="password"
                    value={formData.llmConfig?.apiKey || ''}
                    onChange={(e) => handleChange('llmConfig.apiKey', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Persona/System Prompt</label>
                  <textarea
                    value={formData.llmConfig?.persona || ''}
                    onChange={(e) => handleChange('llmConfig.persona', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg h-24"
                    placeholder="You are a helpful assistant..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Temperature</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.llmConfig?.temperature || 0.7}
                      onChange={(e) => handleChange('llmConfig.temperature', parseFloat(e.target.value))}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Max Tokens</label>
                    <input
                      type="number"
                      value={formData.llmConfig?.maxTokens || 500}
                      onChange={(e) => handleChange('llmConfig.maxTokens', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Rate Limits */}
            <section>
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Rate Limits</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Searches/Hour</label>
                  <input
                    type="number"
                    value={formData.rateLimits?.searchesPerHour || 10}
                    onChange={(e) => handleChange('rateLimits.searchesPerHour', parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Replies/Hour</label>
                  <input
                    type="number"
                    value={formData.rateLimits?.repliesPerHour || 5}
                    onChange={(e) => handleChange('rateLimits.repliesPerHour', parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Replies/Day</label>
                  <input
                    type="number"
                    value={formData.rateLimits?.repliesPerDay || 50}
                    onChange={(e) => handleChange('rateLimits.repliesPerDay', parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Min Delay (secs)</label>
                  <input
                    type="number"
                    value={formData.rateLimits?.minDelayBetween || 60}
                    onChange={(e) => handleChange('rateLimits.minDelayBetween', parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                  />
                </div>
              </div>
            </section>
          </div>
        </form>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-700">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            <Save size={16} />
            {isCreating ? 'Create Account' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
