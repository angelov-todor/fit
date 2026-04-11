import { useState, useMemo } from 'react';
import { Download, ChevronDown, ChevronRight, Code } from 'lucide-react';
import { exportToCSV, formatValue } from '../utils/fitParser';
import type { ParsedFitData } from '../types/fit';

interface Props {
  data: ParsedFitData;
}

interface TableSectionProps {
  title: string;
  rows: Record<string, unknown>[];
  exportName: string;
}

function TableSection({ title, rows, exportName }: TableSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const allKeys = useMemo(() =>
    Array.from(new Set(rows.flatMap(r => Object.keys(r)))),
    [rows]
  );

  if (rows.length === 0) return null;
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{title}</span>
          <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">{rows.length}</span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); exportToCSV(rows, `${exportName}.csv`); }}
          className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          CSV
        </button>
      </div>

      {expanded && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700">
                  {allKeys.map(key => (
                    <th key={key} className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    {allKeys.map(key => (
                      <td key={key} className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {formatValue(key, row[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
              <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of {rows.length}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2 py-1 rounded border border-slate-200 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="px-2 py-1 rounded border border-slate-200 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function DataTable({ data }: Props) {
  const [devMode, setDevMode] = useState(false);

  const sections = devMode
    ? Object.entries(data.rawMessages).map(([name, rows]) => ({
        title: name.replace(/_/g, ' '),
        rows,
        key: name,
      }))
    : [
        { title: 'Records', rows: data.records as Record<string, unknown>[], key: 'records' },
        { title: 'Laps', rows: data.laps as Record<string, unknown>[], key: 'laps' },
        { title: 'Sessions', rows: data.sessions as Record<string, unknown>[], key: 'sessions' },
        { title: 'Events', rows: data.events, key: 'events' },
        { title: 'Device Info', rows: data.device_infos as Record<string, unknown>[], key: 'device_infos' },
        data.file_id && { title: 'File ID', rows: [data.file_id as Record<string, unknown>], key: 'file_id' },
      ].filter(Boolean) as { title: string; rows: Record<string, unknown>[]; key: string }[];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          onClick={() => setDevMode(d => !d)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            devMode
              ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200'
              : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
          }`}
        >
          <Code className="w-3.5 h-3.5" />
          Raw Data
        </button>
      </div>
      {sections.map(s => (
        <TableSection
          key={s.key}
          title={s.title}
          rows={s.rows}
          exportName={s.key}
        />
      ))}
    </div>
  );
}
