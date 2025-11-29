"use client";

import { useCallback, useEffect, useState } from "react";
import supabase from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

type TeamScore = {
  team_id: number;
  gold: number;
};

type StateRow = {
  key: string;
  value: string | boolean | null;
};

export default function IcebreakerAdminPage() {
  const [scores, setScores] = useState<TeamScore[]>([]);
  const [loadingScores, setLoadingScores] = useState(false);

  const [isFrozen, setIsFrozen] = useState(false);
  const [loadingFreeze, setLoadingFreeze] = useState(false);
  const [loadingDisaster, setLoadingDisaster] = useState(false);

  // --- Helpers ---

  const fetchScores = useCallback(async () => {
    try {
      setLoadingScores(true);

      const { data, error } = await supabase
        .from("zo_banfoo_25_score")
        .select("team_id, score");

      if (error) throw error;

      const totalsMap = new Map<number, number>();
      (data ?? []).forEach((row: any) => {
        const teamId = row.team_id as number;
        const score = row.score as number;
        totalsMap.set(teamId, (totalsMap.get(teamId) ?? 0) + score);
      });

      const totals: TeamScore[] = Array.from(totalsMap.entries())
        .map(([team_id, gold]) => ({ team_id, gold }))
        .sort((a, b) => a.team_id - b.team_id);

      setScores(totals);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load scores");
    } finally {
      setLoadingScores(false);
    }
  }, []);

  const fetchFreezeState = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("zo_banfoo_25_state")
        .select("key, value")
        .eq("key", "freeze")
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        // ignore "no rows" style error if your table is empty; adjust as needed
        throw error;
      }

      if (data) {
        const row = data as StateRow;
        const raw = row.value;
        const asString = typeof raw === "boolean" ? String(raw) : String(raw);
        setIsFrozen(asString === "true");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load freeze state");
    }
  }, []);

  // --- Actions ---

  const handleToggleFreeze = async () => {
    try {
      setLoadingFreeze(true);
      const nextValue = !isFrozen;

      const { error } = await supabase
        .from("zo_banfoo_25_state")
        .update({
          value: String(nextValue),
          time_updated: new Date().toISOString(),
        })
        .eq("key", "freeze");

      if (error) throw error;

      setIsFrozen(nextValue);
      toast.success(nextValue ? "Challenges frozen." : "Challenges unfrozen.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update freeze state");
    } finally {
      setLoadingFreeze(false);
    }
  };

  const handleTriggerNaturalDisaster = async () => {
    try {
      setLoadingDisaster(true);

      // 1) Get all scores to compute current gold per team
      const { data, error } = await supabase
        .from("zo_banfoo_25_score")
        .select("team_id, score");

      if (error) throw error;

      const totalsMap = new Map<number, number>();
      (data ?? []).forEach((row: any) => {
        const teamId = row.team_id as number;
        const score = row.score as number;
        totalsMap.set(teamId, (totalsMap.get(teamId) ?? 0) + score);
      });

      // 2) Build deduction rows: lose half (floor) of current gold
      const disasterRows: any[] = [];

      for (const [team_id, gold] of totalsMap.entries()) {
        const safeGold = Math.max(0, gold); // in case of negatives
        const lost = Math.floor(safeGold / 2);

        if (lost > 0) {
          disasterRows.push({
            team_id,
            score: -lost,
            isAdmin: true,
            remarks: "Natural Disaster",
          });
        }
      }

      if (disasterRows.length > 0) {
        const { error: insertErr } = await supabase
          .from("zo_banfoo_25_score")
          .insert(disasterRows);

        if (insertErr) throw insertErr;
      }

      // 3) Flip the naturalDisaster flag to notify clients
      const { error: stateErr } = await supabase
        .from("zo_banfoo_25_state")
        .update({
          value: "true",
          time_updated: new Date().toISOString(),
        })
        .eq("key", "naturalDisaster");

      if (stateErr) throw stateErr;

      toast.warning(
        "Natural Disaster triggered. All teams have lost half their gold!"
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to trigger natural disaster");
    } finally {
      setLoadingDisaster(false);
    }
  };

  // --- Effects: initial data + realtime updates ---

  useEffect(() => {
    fetchScores();
    fetchFreezeState();

    const scoreChannel = supabase
      .channel("admin-score-listener")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "zo_banfoo_25_score",
        },
        () => {
          // Just re-fetch on any score change for simplicity
          fetchScores();
        }
      )
      .subscribe();

    const stateChannel = supabase
      .channel("admin-state-listener")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "zo_banfoo_25_state",
        },
        (payload) => {
          const newRow = payload.new as StateRow;
          if (newRow.key === "freeze") {
            const raw = newRow.value;
            const asString =
              typeof raw === "boolean" ? String(raw) : String(raw);
            setIsFrozen(asString === "true");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(scoreChannel);
      supabase.removeChannel(stateChannel);
    };
  }, [fetchScores, fetchFreezeState]);

  // --- Render ---

  return (
    <div className="min-h-screen p-8 space-y-8">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Z+O Camp Admin Panel</h1>
          <p className="text-sm text-muted-foreground">
            Control gold-steal events and manage the icebreaker in real time.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchScores}
          disabled={loadingScores}
        >
          {loadingScores ? "Refreshing…" : "Refresh scores"}
        </Button>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Scoreboard summary */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Team Gold Overview</CardTitle>
            <CardDescription>
              Live gold totals for each team (based on zo_banfoo_25_score).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scores.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No scores yet. Start the game to see teams appear here.
              </p>
            ) : (
              <div className="space-y-2">
                {scores.map((team) => (
                  <div
                    key={team.team_id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="font-medium">
                      Group {team.team_id.toString().padStart(2, "0")}
                    </span>
                    <span className="font-semibold">
                      {team.gold} gold bar{team.gold === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Game Controls</CardTitle>
            <CardDescription>
              Triggers that your player devices & scoreboard listen to.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Freeze / Unfreeze Challenges
              </p>
              <p className="text-xs text-muted-foreground">
                Toggles the global <code>freeze</code> state in{" "}
                <code>zo_banfoo_25_state</code>. Use this to pause scoring or
                scanning.
              </p>
              <Button
                variant={isFrozen ? "outline" : "default"}
                onClick={handleToggleFreeze}
                disabled={loadingFreeze}
                className="w-full"
              >
                {loadingFreeze
                  ? "Updating…"
                  : isFrozen
                  ? "Unfreeze challenges"
                  : "Freeze challenges"}
              </Button>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-medium text-destructive">
                Trigger Natural Disaster (Steal Gold)
              </p>
              <p className="text-xs text-muted-foreground">
                Sets <code>naturalDisaster</code> to <code>true</code> in{" "}
                <code>zo_banfoo_25_state</code>. Every team&apos;s client will
                run the flood logic and lose half of their current gold, showing
                the &quot;steal&quot; animation / toast.
              </p>
              <Button
                variant="destructive"
                onClick={handleTriggerNaturalDisaster}
                disabled={loadingDisaster}
                className="w-full"
              >
                {loadingDisaster
                  ? "Triggering disaster…"
                  : "Trigger Natural Disaster"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
