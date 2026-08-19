import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Upload, FileText } from 'lucide-react';

interface Props {
  onFile: (file: File) => void;
  loading: boolean;
}

export default function FileDropzone({ onFile, loading }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && /\.(fit|zip|gpx)$/i.test(file.name)) onFile(file);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      onClick={() => !loading && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
        ${dragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800'}
        ${loading ? 'opacity-60 cursor-not-allowed' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".fit,.zip,.gpx"
        className="hidden"
        onChange={handleChange}
        disabled={loading}
      />
      <div className="flex flex-col items-center gap-3">
        {loading ? (
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center">
            <Upload className="w-7 h-7 text-blue-600" />
          </div>
        )}
        <div>
          <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
            {loading ? 'Parsing file...' : 'Drop a FIT or GPX file here'}
          </p>
          {!loading && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              or click to browse — supports <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">.fit</code>, <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">.gpx</code> and <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">.zip</code> files
            </p>
          )}
        </div>
        {!loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
            <FileText className="w-4 h-4" />
            All processing happens locally in your browser
          </div>
        )}
      </div>
    </div>
  );
}
