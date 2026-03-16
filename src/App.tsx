import React, { useEffect, useMemo, useState } from "react";
import { CallHistoryEntry, CallStrategy, Person, Roster } from "./types";
import { exportTemplate, importRosterFromFile } from "./excel";
import { loadFromStorage, saveToStorage } from "./storage";

const STORAGE_KEYS = {
  recentRosters: "rollcall_recent_rosters",
  lastStrategy: "rollcall_last_strategy",
  lastRosterId: "rollcall_last_roster_id",
  history: "rollcall_history",
} as const;

const MAX_RECENT_ROSTERS = 5;

interface StoredRosterMeta {
  id: string;
  name: string;
  createdAt: string;
  count: number;
}

export const App: React.FC = () => {
  const [currentRoster, setCurrentRoster] = useState<Roster | null>(null);
  const [recentRosters, setRecentRosters] = useState<StoredRosterMeta[]>([]);
  const [strategy, setStrategy] = useState<CallStrategy>("random");
  const [isCalling, setIsCalling] = useState(false);
  const [displayPerson, setDisplayPerson] = useState<Person | null>(null);
  const [callIndexMap, setCallIndexMap] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<CallHistoryEntry[]>([]);

  useEffect(() => {
    const storedRosters =
      loadFromStorage<StoredRosterMeta[]>(STORAGE_KEYS.recentRosters) ?? [];
    const storedStrategy =
      loadFromStorage<CallStrategy>(STORAGE_KEYS.lastStrategy) ?? "random";
    const storedHistory =
      loadFromStorage<CallHistoryEntry[]>(STORAGE_KEYS.history) ?? [];
    setRecentRosters(storedRosters);
    setStrategy(storedStrategy);
    setHistory(storedHistory);
  }, []);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.recentRosters, recentRosters);
  }, [recentRosters]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.lastStrategy, strategy);
  }, [strategy]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.history, history.slice(0, 50));
  }, [history]);

  const handleExportTemplate = () => {
    exportTemplate();
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const partial = await importRosterFromFile(file);
      const roster: Roster = {
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        ...partial,
      };
      setCurrentRoster(roster);
      setDisplayPerson(null);
      setCallIndexMap((prev) => ({ ...prev, [roster.id]: 0 }));

      const meta: StoredRosterMeta = {
        id: roster.id,
        name: roster.name,
        createdAt: roster.createdAt,
        count: roster.people.length,
      };

      setRecentRosters((prev) => {
        const filtered = prev.filter((r) => r.id !== meta.id);
        return [meta, ...filtered].slice(0, MAX_RECENT_ROSTERS);
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "导入失败，请检查表格格式。";
      // eslint-disable-next-line no-alert
      alert(message);
    } finally {
      event.target.value = "";
    }
  };

  const currentList = useMemo(
    () => currentRoster?.people ?? [],
    [currentRoster]
  );

  const getNextPerson = (): Person | null => {
    if (!currentRoster || currentList.length === 0) return null;

    if (strategy === "random") {
      const index = Math.floor(Math.random() * currentList.length);
      return currentList[index] ?? null;
    }

    if (strategy === "noRepeatRandom") {
      const calledIds = new Set(history.map((h) => h.person.id));
      const remaining = currentList.filter((p) => !calledIds.has(p.id));
      const pool = remaining.length > 0 ? remaining : currentList;
      const index = Math.floor(Math.random() * pool.length);
      return pool[index] ?? null;
    }

    const currentIndex = callIndexMap[currentRoster.id] ?? 0;
    const person = currentList[currentIndex] ?? null;
    const nextIndex = (currentIndex + 1) % currentList.length;
    setCallIndexMap((prev) => ({
      ...prev,
      [currentRoster.id]: nextIndex,
    }));
    return person;
  };

  const triggerEffectAndPick = () => {
    if (!currentRoster || currentList.length === 0) {
      // eslint-disable-next-line no-alert
      alert("请先导入名单文件。");
      return;
    }
    if (isCalling) return;

    setIsCalling(true);

    const duration = 2000;
    const step = 80;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - (1 - progress) * (1 - progress);

      const index = Math.floor(
        Math.random() * currentList.length * (1 - easeOut * 0.3)
      );
      setDisplayPerson(currentList[index] ?? null);

      if (progress < 1) {
        const adaptiveStep = step + progress * 120;
        window.setTimeout(() => requestAnimationFrame(tick), adaptiveStep);
      } else {
        const finalPerson = getNextPerson();
        if (finalPerson && currentRoster) {
          setDisplayPerson(finalPerson);
          setHistory((prev) => [
            {
              timestamp: new Date().toISOString(),
              person: finalPerson,
              rosterId: currentRoster.id,
              rosterName: currentRoster.name,
            },
            ...prev,
          ]);
        }
        setIsCalling(false);
      }
    };

    requestAnimationFrame(tick);
  };

  const handleSelectRoster = (meta: StoredRosterMeta) => {
    if (!currentRoster || currentRoster.id !== meta.id) {
      // For simplicity, recent rosters only store meta; in a real app we would persist full data.
      // Here we just inform the user.
      // eslint-disable-next-line no-alert
      alert("当前示例仅在会话中保存完整名单，请重新导入对应名单文件。");
    }
  };

  const currentStrategyLabel = useMemo(() => {
    switch (strategy) {
      case "random":
        return "完全随机";
      case "roundRobin":
        return "按名单轮流";
      case "noRepeatRandom":
        return "随机且不重复（轮完一轮再重置）";
      default:
        return "";
    }
  }, [strategy]);

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-title">点名器</div>
        <div className="app-actions">
          <button type="button" onClick={handleExportTemplate}>
            导出名单模板
          </button>
          <label className="upload-button">
            导入名单
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              style={{ display: "none" }}
            />
          </label>
        </div>
      </header>

      <main className="layout">
        <section className="panel sidebar">
          <h2>最近导入</h2>
          {recentRosters.length === 0 ? (
            <div className="empty-tip">暂无记录</div>
          ) : (
            <ul className="roster-list">
              {recentRosters.map((r) => (
                <li
                  key={r.id}
                  className={
                    currentRoster?.id === r.id ? "roster-item active" : "roster-item"
                  }
                  onClick={() => handleSelectRoster(r)}
                >
                  <div className="roster-name">{r.name}</div>
                  <div className="roster-meta">
                    <span>{r.count} 人</span>
                    <span>
                      {new Date(r.createdAt).toLocaleString("zh-CN", {
                        hour12: false,
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h2>点名记录</h2>
          {history.length === 0 ? (
            <div className="empty-tip">暂无记录</div>
          ) : (
            <ul className="history-list">
              {history.slice(0, 15).map((h) => (
                <li key={h.timestamp + h.person.id} className="history-item">
                  <span className="history-name">{h.person.name}</span>
                  {h.person.group && (
                    <span className="history-group">{h.person.group}</span>
                  )}
                  <span className="history-roster">{h.rosterName}</span>
                  <span className="history-time">
                    {new Date(h.timestamp).toLocaleTimeString("zh-CN", {
                      hour12: false,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel main-panel">
          <div className="config-row">
            <div>
              <div className="label">当前名单</div>
              <div className="value">
                {currentRoster
                  ? `${currentRoster.name}（共 ${currentRoster.people.length} 人）`
                  : "未导入"}
              </div>
            </div>

            <div>
              <div className="label">点名策略</div>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as CallStrategy)}
              >
                <option value="random">完全随机</option>
                <option value="roundRobin">按名单轮流</option>
                <option value="noRepeatRandom">随机且不重复</option>
              </select>
              <div className="hint">{currentStrategyLabel}</div>
            </div>
          </div>

          <div className="stage-wrapper">
            <div className={`stage ${isCalling ? "stage-animating" : ""}`}>
              <div className="stage-backdrop" />
              <div className="stage-content">
                <div className="stage-label">当前点名</div>
                <div className="stage-name">
                  {displayPerson?.name ?? "准备开始"}
                </div>
                {displayPerson?.group && (
                  <div className="stage-sub">
                    {displayPerson.group} · {displayPerson.id}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="controls">
            <button
              type="button"
              className="primary"
              onClick={triggerEffectAndPick}
              disabled={isCalling}
            >
              {isCalling ? "点名中..." : "开始点名"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

