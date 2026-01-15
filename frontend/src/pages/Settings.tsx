import { FolderOpen, RefreshCw, FileText } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';

export default function Settings() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card title="Configuration Files">
        <div className="space-y-4">
          <p className="text-gray-400">
            Account configurations are stored as YAML files in the <code className="bg-gray-700 px-1 rounded">data/accounts/</code> directory.
            You can edit these files manually and reload them.
          </p>

          <div className="flex items-center gap-2">
            <Button variant="secondary">
              <FolderOpen size={16} />
              Open Config Folder
            </Button>
            <Button variant="secondary">
              <RefreshCw size={16} />
              Reload All Configs
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Data Export">
        <div className="space-y-4">
          <p className="text-gray-400">
            Found tweets are automatically saved to Excel files in the <code className="bg-gray-700 px-1 rounded">data/exports/</code> directory.
            Each account has its own export file.
          </p>

          <Button variant="secondary">
            <FileText size={16} />
            Open Exports Folder
          </Button>
        </div>
      </Card>

      <Card title="About">
        <div className="space-y-2 text-gray-400">
          <p><strong className="text-gray-200">XTools</strong> - Twitter Automation Tool</p>
          <p>Version 1.0.0</p>
          <p className="text-sm">
            Built with Wails, Go, React, and TailwindCSS.
          </p>
        </div>
      </Card>
    </div>
  );
}
