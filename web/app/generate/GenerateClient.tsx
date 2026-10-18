"use client";
import { useCallback, useState } from "react";
import { Generator, type Generated } from "../../components/Generator";
import { History, type HistoryItem } from "../../components/History";
import { StrengthChecker } from "../../components/StrengthChecker";
import { SourcesPanel } from "../../components/SourcesPanel";
export function GenerateClient() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const add = useCallback((g: Generated) => {
    setHistory((h) => [{ ...g, id: crypto.randomUUID(), at: new Date() }, ...h].slice(0, 10));
  }, []);
  return <div className="space-y-8">
    <header className="max-w-3xl"><h1 className="text-3xl font-bold">Generate a secret</h1>
      <p className="text-sm text-slate-500">Generated values stay in browser state. Receipts store commitments only.</p>
    </header>
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6"><Generator onGenerated={add}/>
        <History items={history} onClear={() => setHistory([])}/></div>
      <div className="space-y-6"><SourcesPanel/><StrengthChecker/></div>
    </div>
  </div>;
}
