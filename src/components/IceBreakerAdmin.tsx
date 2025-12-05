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
  const [loadingAid, setLoadingAid] = useState(false);
  const [loadingThief, setLoadingThief] = useState(false);

  const upsertState = useCallback(async (key: string, value: string) => {
    const { error } = await supabase.from("zo_banfoo_25_state").upsert(
      {
        key,
        value,
        time_updated: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) throw error;
  }, []);

  const pulseState = useCallback(
    async (key: string, delayMs: number) => {
      await upsertState(key, "true");

      // fire-and-forget reset
      setTimeout(() => {
        upsertState(key, "false").catch((err) =>
          console.warn(`Failed to reset ${key}:`, err)
        );
      }, delayMs);
    },
    [upsertState]
  );
  // --- Helpers ---
  const handleTriggerThief = async () => {
    try {
      setLoadingThief(true);

      // Pull teams + scores
      const [
        { data: teamData, error: teamErr },
        { data: scoreData, error: scoreErr },
      ] = await Promise.all([
        supabase.from("zo_banfoo_25_team").select("id, team_name"),
        supabase.from("zo_banfoo_25_score").select("team_id, score"),
      ]);

      if (teamErr) throw teamErr;
      if (scoreErr) throw scoreErr;

      const teams = (teamData ?? []) as {
        id: number;
        team_name?: string | null;
      }[];

      const totalsMap = new Map<number, number>();
      (scoreData ?? []).forEach((row: any) => {
        const teamId = row.team_id as number;
        const score = row.score as number;
        totalsMap.set(teamId, (totalsMap.get(teamId) ?? 0) + score);
      });

      const totals = teams.map((t) => ({
        team_id: t.id,
        gold: totalsMap.get(t.id) ?? 0,
      }));

      // Find leader
      const leader = totals.reduce(
        (best, cur) => (cur.gold > best.gold ? cur : best),
        { team_id: totals[0]?.team_id ?? 0, gold: totals[0]?.gold ?? 0 }
      );

      const payload = {
        leader_team_id: leader.team_id,
        leader_gold: leader.gold,
      };

      // OPTIONAL: reset previous thief decisions (if you want re-runnable events)
      // Remove this block if the event only runs once.
      const { error: resetErr } = await supabase
        .from("zo_banfoo_25_thief_decisions")
        .delete()
        .neq("team_id", -1);

      if (resetErr) {
        console.warn("Could not reset thief decisions:", resetErr);
      }

      // Trigger state
      // store payload first
      await upsertState("thief", JSON.stringify(payload));

      // then auto-reset the same key later
      setTimeout(() => {
        upsertState("thief", "false").catch((err) =>
          console.warn("Failed to reset thief:", err)
        );
      }, 120000);

      toast.success("Thief event triggered.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to trigger Thief event");
    } finally {
      setLoadingThief(false);
    }
  };

  const handleTriggerDisasterAid = async () => {
    try {
      setLoadingAid(true);

      // OPTIONAL: reset previous choices so this event is clean
      // Remove this block if you never need to re-run the event.
      const { error: resetErr } = await supabase
        .from("zo_banfoo_25_disaster_aid")
        .delete()
        .neq("team_id", -1); // harmless way to target all rows

      if (resetErr) {
        console.warn("Could not reset disaster aid decisions:", resetErr);
        // not fatal; continue
      }

      // Trigger state (use upsert so it works even if row doesn't exist)
      await pulseState("disasterAid", 120000); // 2 minutes

      toast.success("Disaster Aid triggered. Teams may now Donate or Pass.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to trigger Disaster Aid");
    } finally {
      setLoadingAid(false);
    }
  };

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
      await pulseState("worldPeace", 1500);

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
      await pulseState("naturalDisaster", 1500);

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
        <Card>
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
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Game Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Freeze / Unfreeze Challenges
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

            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-medium text-amber-600">
                Trigger Disaster Aid (Donate / Pass)
              </p>
              <p className="text-xs text-muted-foreground">
                Sets <code>disasterAid</code> to <code>true</code> in{" "}
                <code>zo_banfoo_25_state</code>. Teams will be prompted to
                donate 10 gold or pass.
              </p>
              <Button
                variant="outline"
                onClick={handleTriggerDisasterAid}
                disabled={loadingAid}
                className="w-full"
              >
                {loadingAid
                  ? "Triggering disaster aid…"
                  : "Trigger Disaster Aid"}
              </Button>
            </div>
            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-medium text-blue-600">
                Trigger Thief (Steal / Pass)
              </p>
              <Button
                variant="outline"
                onClick={handleTriggerThief}
                disabled={loadingThief}
                className="w-full"
              >
                {loadingThief
                  ? "Triggering thief event…"
                  : "Trigger Thief Event"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
