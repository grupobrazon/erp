import React, { createContext, useContext, useState, useCallback } from "react";
import { Home as HomeIcon } from "lucide-react";

const MAX_TABS = 8;
export const HOME_PATH = "/inicio";

const HOME_TAB = {
  id: HOME_PATH,
  path: HOME_PATH,
  label: "Início",
  Icon: HomeIcon,
  color: { icon: "text-indigo-300", border: "border-indigo-400" },
  fixed: true,
};

export const TabsContext = createContext(null);

export function TabsProvider({ children }) {
  const [tabs, setTabs] = useState([HOME_TAB]);
  const [activeTabId, setActiveTabId] = useState(HOME_PATH);
  const [mounted, setMounted] = useState(() => new Set([HOME_PATH]));

  const activateTab = useCallback((id) => {
    setActiveTabId(id);
    setMounted((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const openTab = useCallback((tab) => {
    const exists = tabs.some((t) => t.id === tab.path);
    if (exists) {
      activateTab(tab.path);
      return;
    }
    const newTab = {
      id: tab.path,
      path: tab.path,
      label: tab.label,
      Icon: tab.Icon,
      color: tab.color,
    };
    if (tabs.length >= MAX_TABS) {
      // remove the oldest non-fixed, non-active tab to make room
      const removable = tabs.filter((t) => !t.fixed && t.id !== activeTabId);
      if (removable.length === 0) {
        activateTab(tab.path); // just focus even if can't add
        return;
      }
      const removeId = removable[0].id;
      setTabs((prev) => [...prev.filter((t) => t.id !== removeId), newTab]);
      setMounted((prev) => {
        const n = new Set(prev);
        n.delete(removeId);
        return n;
      });
    } else {
      setTabs((prev) => [...prev, newTab]);
    }
    activateTab(tab.path);
  }, [tabs, activeTabId, activateTab]);

  const closeTab = useCallback((id) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab || tab.fixed) return;
    const idx = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    setMounted((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    if (activeTabId === id) {
      const fallback = next[Math.max(0, idx - 1)] || next[0];
      activateTab(fallback ? fallback.id : HOME_PATH);
    }
  }, [tabs, activeTabId, activateTab]);

  return (
    <TabsContext.Provider
      value={{ tabs, activeTabId, mounted, openTab, closeTab, activateTab }}
    >
      {children}
    </TabsContext.Provider>
  );
}

export function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("useTabs deve ser usado dentro de TabsProvider");
  return ctx;
}