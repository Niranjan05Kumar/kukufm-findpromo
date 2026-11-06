import React, { useState, useRef } from 'react';
import type { SingleEpisodeAnalyzeResult } from '../single_episode_analyzer.ts';
import { analyzeScreenplayText } from '../single_episode_analyzer.ts';

interface EpisodeUploadProps {
  onAnalyzeComplete: (result: SingleEpisodeAnalyzeResult) => void;
  isAnalyzing: boolean;
  setIsAnalyzing: (state: boolean) => void;
}

export const EpisodeUpload: React.FC<EpisodeUploadProps> = ({
  onAnalyzeComplete,
  isAnalyzing,
  setIsAnalyzing
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const files = e.target.files;
    if (!files || files.length === 0) {
      setSelectedFile(null);
      return;
    }

    const file = files[0];
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setErrorMessage('Invalid file format: Please select a .txt screenplay file.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size === 0) {
      setErrorMessage('The selected file is empty.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      setErrorMessage('Please select an episode screenplay (.txt) file first.');
      return;
    }

    setErrorMessage(null);
    setIsAnalyzing(true);

    try {
      // Read file content as text
      const content = await selectedFile.text();
      if (!content || content.trim().length === 0) {
        setErrorMessage('The uploaded screenplay file is empty.');
        setIsAnalyzing(false);
        return;
      }

      let result: SingleEpisodeAnalyzeResult | null = null;

      // Try server-side API first (keeps OpenAI API key safe on server)
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            filename: selectedFile.name
          })
        });

        if (response.ok) {
          result = await response.json();
        } else {
          const errData = await response.json().catch(() => null);
          if (errData && errData.error) {
            setErrorMessage(errData.error);
            setIsAnalyzing(false);
            return;
          }
        }
      } catch {
        // Server API not reachable (e.g. static preview); fallback to client-side pipeline
      }

      // If server route was not available, run client-side pipeline directly
      if (!result) {
        result = await analyzeScreenplayText(content, selectedFile.name);
      }

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to analyze screenplay episode.');
        setIsAnalyzing(false);
        return;
      }

      // Reset file input for next use
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSelectedFile(null);

      onAnalyzeComplete(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Error processing file: ${msg}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-indigo-900/60 shadow-lg space-y-3">
      <div>
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>📤</span>
          <span>Test Another Episode</span>
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Upload an episode screenplay (.txt) to test the promo-finding system.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          disabled={isAnalyzing}
          onChange={handleFileChange}
          className="flex-1 text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-indigo-300 hover:file:bg-slate-700 cursor-pointer bg-slate-950 p-1.5 rounded-lg border border-slate-800 focus:outline-none"
        />

        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || !selectedFile}
          className={`px-4 py-2 rounded-lg font-semibold text-xs tracking-wide transition-all shadow-md ${
            isAnalyzing || !selectedFile
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 shadow-indigo-600/30'
          }`}
        >
          {isAnalyzing ? 'Analyzing episode…' : 'Analyze Episode'}
        </button>
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="text-xs text-rose-300 bg-rose-950/60 border border-rose-800/80 p-2.5 rounded-lg flex items-start gap-2">
          <span className="font-bold">⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};

