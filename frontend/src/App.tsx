import { useCallback, useEffect, useState } from 'react';
import { Calculator } from './components/Calculator';
import { Header } from './components/Header';
import { HistoryList } from './components/HistoryList';
import { addEntry, loadHistory, saveHistory, type HistoryEntry } from './lib/history';

export function App() {
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  // Stable across renders, so the Calculator doesn't resend a pending request.
  const handleCalculated = useCallback((entry: HistoryEntry) => {
    setHistory((previous) => addEntry(previous, entry));
  }, []);

  return (
    <div className="app">
      <Header />
      <main className="app__main">
        <Calculator onCalculated={handleCalculated} />
        <HistoryList entries={history} />
      </main>
    </div>
  );
}
