import { useState } from 'react';
import { Map, BarChart2, Table2, RefreshCw, Download, Moon, Sun, Monitor } from 'lucide-react';
import FileDropzone from './components/FileDropzone';
import SummaryCards from './components/SummaryCards';
import ChartsView from './components/ChartsView';
import MapView from './components/MapView';
import DataTable from './components/DataTable';
import { parseFitFile, exportToGPX } from './utils/fitParser';
import { useDarkMode } from './hooks/useDarkMode';
import type { ParsedFitData } from './types/fit';

type Tab = 'charts' | 'map' | 'tables';

export default function App() {
  const [fitData, setFitData] = useState<ParsedFitData | null>(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('charts');
  const { theme, toggle, reset: resetTheme } = useDarkMode();

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const data = await parseFitFile(file);
      setFitData(data);
      setFileName(file.name.replace(/\.(fit|zip)$/i, ''));
      setActiveTab('charts');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse FIT file');
    } finally {
      setLoading(false);
    }
  };

  const resetFile = () => {
    setFitData(null);
    setFileName('');
    setError(null);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'charts', label: 'Charts', icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'map', label: 'Map', icon: <Map className="w-4 h-4" /> },
    { id: 'tables', label: 'Tables', icon: <Table2 className="w-4 h-4" /> },
  ];

  const ThemeIcon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="FIT File Viewer" className="w-8 h-8" />
            <span className="font-bold text-slate-800 dark:text-slate-100">FIT File Viewer</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              onContextMenu={e => { e.preventDefault(); resetTheme(); }}
              title={`Theme: ${theme} (right-click to reset to system)`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <ThemeIcon className="w-4 h-4" />
            </button>

            {fitData && (
              <>
                {fitData.records.some(r => r.position_lat != null) && (
                  <button
                    onClick={() => exportToGPX(fitData.records as Record<string, unknown>[], `${fileName}.gpx`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    GPX
                  </button>
                )}

                <button
                  onClick={resetFile}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  New File
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {!fitData ? (
          <div className="max-w-2xl mx-auto pt-16 space-y-4">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">FIT File Viewer</h1>
              <p className="text-slate-500 dark:text-slate-400">
                View GPS tracks, charts, and data from Garmin FIT files — all locally in your browser
              </p>
            </div>
            <FileDropzone onFile={handleFile} loading={loading} />
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
                <strong>Error:</strong> {error}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 text-center text-sm text-slate-500 dark:text-slate-400 pt-4">
              {[
                { icon: '📊', label: 'Interactive Charts', desc: 'HR, power, speed, cadence' },
                { icon: '🗺️', label: 'GPS Map', desc: 'View your route on a map' },
                { icon: '📋', label: 'Data Tables', desc: 'Browse all FIT messages' },
              ].map(f => (
                <div key={f.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <div className="text-2xl mb-1">{f.icon}</div>
                  <div className="font-semibold text-slate-700 dark:text-slate-200">{f.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* File info */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{fileName}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {fitData.records.length.toLocaleString()} records · {fitData.laps.length} laps · {fitData.sessions.length} session(s)
                </p>
              </div>
            </div>

            {/* Summary */}
            <SummaryCards data={fitData} />

            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 gap-0">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div>
              {activeTab === 'charts' && <ChartsView records={fitData.records} laps={fitData.laps} />}
              {activeTab === 'map' && <MapView records={fitData.records} />}
              {activeTab === 'tables' && <DataTable data={fitData} />}
            </div>
          </>
        )}
      </main>

      <footer className="text-center text-xs text-slate-400 py-6 border-t border-slate-200 dark:border-slate-700 mt-8">
        &copy; {new Date().getFullYear()} angelov-todor &middot; MIT License &middot;{' '}
        <a href="https://github.com/angelov-todor/fit" className="hover:text-slate-600 dark:hover:text-slate-300 underline" target="_blank" rel="noopener noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
