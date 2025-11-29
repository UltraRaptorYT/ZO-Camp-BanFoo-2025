"use client";
import supabase from "@/lib/supabase";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

type ScoreboardProps = {
  isAdmin?: boolean;
  hideAdmin?: string;
};

export default function Scoreboard({
  isAdmin = false,
  hideAdmin = "false",
}: ScoreboardProps) {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const [frozenTime, setFrozenTime] = useState<string | null>(null);

  // Toggle freeze (admin only)
  async function updateFrozenState() {
    const nextValue = (!isFrozen).toString(); // keep DB as "true"/"false"

    const { data, error } = await supabase
      .from("zo_banfoo_25_state")
      .update({ value: nextValue, time_updated: new Date().toISOString() })
      .eq("key", "freeze")
      .select("value, time_updated")
      .single();

    if (error) {
      console.log(error);
      return;
    }

    setIsFrozen(data.value === "true");
    setFrozenTime(data.time_updated);
  }

  async function getFrozenState() {
    const { data, error } = await supabase
      .from("zo_banfoo_25_state")
      .select("value, time_updated")
      .eq("key", "freeze")
      .maybeSingle();

    if (error) {
      console.log(error);
      return;
    }

    if (data) {
      setIsFrozen(data.value === "true");
      setFrozenTime(data.time_updated ?? null);
    }
  }

  // Everyone listens to freeze-state changes
  useEffect(() => {
    const channel = supabase
      .channel("freeze-state-channel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "zo_banfoo_25_state",
          filter: "key=eq.freeze",
        },
        () => {
          getFrozenState();
        }
      )
      .subscribe();

    // initial fetch
    getFrozenState();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // When frozenTime changes (i.e. just froze or un-froze), recompute once
  useEffect(() => {
    if (!frozenTime) return;
    getLeaderboard();
  }, [frozenTime]);

  async function getTeamName() {
    const { data, error } = await supabase
      .from("zo_banfoo_25_team")
      .select("*")
      .order("team_name", { ascending: true });

    if (error) {
      console.log(error);
      return;
    }
    return data;
  }

  async function getLeaderboard() {
    const teamName = await getTeamName();
    if (!teamName) return;

    const { data, error } = await supabase.from("zo_banfoo_25_score").select();

    if (error) {
      console.log(error);
      return;
    }

    let scoreData = [...data];

    // If frozen, only count scores up to frozenTime (snapshot)
    if (isFrozen && frozenTime) {
      scoreData = scoreData.filter((e) => {
        return new Date(e.created_at) <= new Date(frozenTime);
      });
    }

    for (const score of scoreData) {
      const team = teamName.find((e) => e.id === score.team_id);
      if (!team) continue;
      team.score = (team.score || 0) + (score.score || 0);
    }

    const newData = teamName.map((e) => ({
      ...e,
      score: e.score ?? 0,
    }));

    newData.sort((a, b) => b.score - a.score);
    setLeaderboard(newData);
  }

  // 🔸 Score changes subscription
  // When frozen: ignore score change events and don't refetch leaderboard.
  useEffect(() => {
    const channel = supabase
      .channel("score-changes-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "zo_banfoo_25_score" },
        async () => {
          if (isFrozen) {
            // leaderboard is locked; don't change points or motion
            return;
          }
          await getLeaderboard();
        }
      )
      .subscribe();

    // Initial load only if not frozen
    if (!isFrozen) {
      getLeaderboard();
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isFrozen]); // rewire subscription when freeze state changes

  return (
    <div className="w-full h-full flex flex-col justify-start items-center">
      {isAdmin && (
        <div
          className={cn(
            "fixed bottom-3 right-3 transition-opacity",
            hideAdmin === "false" ? "opacity-100" : "opacity-0"
          )}
        >
          <Button onClick={updateFrozenState}>
            {isFrozen ? "Unfreeze" : "Freeze"} Leaderboard
          </Button>
        </div>
      )}

      <div className="h-fit">
        <h1 className="text-3xl text-center flex flex-col gap-2 font-bold pt-2">
          <span>Z+O Camp 2025 Banfoo</span>
        </h1>
        <div className="text-center italic text-sm h-5">
          <span>{isFrozen ? "Leaderboard Frozen" : ""}</span>
        </div>
      </div>

      <div className="flex flex-col items-center w-full gap-6 mt-6 px-4">
        <AnimatePresence initial={false}>
          {leaderboard.map((team, idx) => (
            <motion.div
              key={team.team_name}
              layout={!isFrozen}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="w-full max-w-md flex items-center justify-between px-4 py-3 rounded-xl shadow-sm"
              style={{ backgroundColor: team.color }}
            >
              <div className="w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center font-bold">
                {idx + 1}
              </div>

              <span className="font-semibold text-black text-lg truncate">
                {team.team_name}
              </span>

              <motion.span
                layout={!isFrozen}
                key={team.score}
                initial={{ scale: 1.02 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", duration: 1, ease: "easeOut" }}
                className="text-black font-bold text-lg"
              >
                {team.score}
              </motion.span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
