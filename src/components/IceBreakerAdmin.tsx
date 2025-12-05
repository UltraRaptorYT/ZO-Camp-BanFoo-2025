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

type TeamRow = {
  id: number;
  team_name?: string | null;
};

type StateRow = {
  key: string;
  value: string | boolean | null;
  time_updated?: string | null;
};


export default function IcebreakerAdminPage() {
  const [scores, setScores] = useState<TeamScore[]>([]);
  const [loadingScores, setLoadingScores] = useState(false);

  const [isFrozen, setIsFrozen] = useState(false);
  const [loadingFreeze, setLoadingFreeze] = useState(false);
  const [loadingDisaster, setLoadingDisaster] = useState(false);
  const [loadingWorldPeace, setLoadingWorldPeace] = useState(false);

  // --- Helpers ---
  const handleTriggerWorldPeace = async () => {
    try {
      setLoadingWorldPeace(true);

      // 1) Read all score rows
      const { data, error } = await supabase
        .from("zo_banfoo_25_score")
        .select("team_id, score");

      if (error) throw error;

      // 2) Sum current gold per team
      const totalsMap = new Map<number, number>();
      (data ?? []).forEach((row: any) => {
        const teamId = row.team_id as number;
        const score = row.score as number;
        totalsMap.set(teamId, (totalsMap.get(teamId) ?? 0) + score);
      });

      // 3) Create "doubling" rows
      // Add +currentTotal for each team (so total becomes 2x)
      const worldPeaceRows: any[] = [];

      for (const [team_id, gold] of totalsMap.entries()) {
        const safeGold = Math.max(0, gold);

        if (safeGold > 0) {
          worldPeaceRows.push({
            team_id,
            score: safeGold,
            isAdmin: true,
            remarks: "World Peace",
          });
        }
      }

      if (worldPeaceRows.length > 0) {
        const { error: insertErr } = await supabase
          .from("zo_banfoo_25_score")
          .insert(worldPeaceRows);

        if (insertErr) throw insertErr;
      }

      // 4) Flip state key to notify clients
      // Use upsert so it works even if the row doesn't exist yet
      const { error: stateErr } = await supabase
        .from("zo_banfoo_25_state")
        .upsert(
          {
            key: "worldPeace",
            value: "true",
            time_updated: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (stateErr) throw stateErr;

      toast.success("World Peace triggered. All teams' gold is doubled!");

      fetchScores();
    } catch (err) {
      console.error(err);
      toast.error("Failed to trigger World Peace");
    } finally {
      setLoadingWorldPeace(false);
    }
  };

  const fetchScores = useCallback(async () => {
    try {
      setLoadingScores(true);

      // Fetch teams + scores in parallel
      const [
        { data: teamData, error: teamErr },
        { data: scoreData, error: scoreErr },
      ] = await Promise.all([
        supabase.from("zo_banfoo_25_team").select("id, team_name"),
        supabase.from("zo_banfoo_25_score").select("team_id, score"),
      ]);

      if (teamErr) throw teamErr;
      if (scoreErr) throw scoreErr;

      const teams = (teamData ?? []) as TeamRow[];

      // Sum scores
      const totalsMap = new Map<number, number>();
      (scoreData ?? []).forEach((row: any) => {
        const teamId = row.team_id as number;
        const score = row.score as number;
        totalsMap.set(teamId, (totalsMap.get(teamId) ?? 0) + score);
      });

      // Merge: ensure every team shows up, even if no score rows
      const totals: TeamScore[] = teams
        .map((t) => ({
          team_id: t.id,
          gold: totalsMap.get(t.id) ?? 0,
        }))
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
        throw error;
      }

      if (data) {
        const row = data as StateRow;
        const raw = row.value;
        const asString = typeof raw === "boolean" ? String(raw) : String(raw);
        setIsFrozen(asString === "true");
      } else {
        // Optional: default if no state row exists
        setIsFrozen(false);
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

      // Fetch all scores to compute current gold per team
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

      // Build deduction rows: lose half (floor) of current gold
      const disasterRows: any[] = [];

      for (const [team_id, gold] of totalsMap.entries()) {
        const safeGold = Math.max(0, gold);
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

      // Flip the naturalDisaster flag to notify clients
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

      // Refresh admin totals
      fetchScores();
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
          fetchScores();
        }
      )
      .subscribe();

    // Also listen for team changes so new teams appear immediately
    const teamChannel = supabase
      .channel("admin-team-listener")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "zo_banfoo_25_team",
        },
        () => {
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
      supabase.removeChannel(teamChannel);
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
              Live gold totals for each team (teams from zo_banfoo_25_team).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scores.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No teams found yet in <code>zo_banfoo_25_team</code>.
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {/* Simplified layout (removes the old per-row "points style" look) */}
                <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                  <span>Group</span>
                  <span>Gold</span>
                </div>
                {scores.map((team) => (
                  <div
                    key={team.team_id}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="font-medium">Group {team.team_id}</span>
                    <span className="font-semibold">{team.gold}</span>
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

            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-medium text-emerald-600">
                Trigger World Peace (Double Gold)
              </p>
              <p className="text-xs text-muted-foreground">
                Sets <code>worldPeace</code> to <code>true</code> in{" "}
                <code>zo_banfoo_25_state</code>. All teams&apos; current gold
                will be doubled by inserting an admin score equal to their
                current total.
              </p>
              <Button
                className="w-full"
                onClick={handleTriggerWorldPeace}
                disabled={loadingWorldPeace}
              >
                {loadingWorldPeace
                  ? "Triggering world peace…"
                  : "Trigger World Peace"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
