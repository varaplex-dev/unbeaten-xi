"use client";

import { useEffect, useState } from "react";
import { isGameDataReady, loadGameData } from "@/lib/data/gameData";

/** True once the heavy dataset is loaded. Kicks the (idempotent, shared) load
 * off on mount, so a component can render a loading state until the data is in
 * and then re-render with it. */
export function useGameDataReady(): boolean {
  const [ready, setReady] = useState(isGameDataReady);
  useEffect(() => {
    if (ready) return;
    let alive = true;
    void loadGameData().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [ready]);
  return ready;
}

/** Mounted once high in the tree (root layout) to start the dataset download
 * as early as possible, so it's usually ready by the time the player reaches a
 * game screen. Renders nothing. */
export function GameDataPreload() {
  useEffect(() => {
    void loadGameData();
  }, []);
  return null;
}
