"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import IceBreakerClient from "./IceBreakerClient";
import AddScore from "@/components/AddScore";
import Scoreboard from "@/components/Scoreboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocalStorageState } from "@/lib/utils";

export default function Page() {
  const searchParams = useSearchParams();
  const rawTeamId = Number(searchParams.get("team_id") ?? "1");
  const teamId = isNaN(rawTeamId) || rawTeamId < 1 ? 1 : rawTeamId;
  const [currentTab, setCurrentTab] = useLocalStorageState("tab", "score");

  return (
    <Suspense fallback={<div className="p-8">Loading icebreaker…</div>}>
      <div className="max-w-xl mx-auto h-full flex flex-col justify-start items-center p-5">
        <Tabs
          onValueChange={(value) => setCurrentTab(value)}
          value={currentTab}
          className="w-full h-full flex flex-col"
        >
          <TabsList className="flex items-center justify-center flex-wrap h-fit space-y-1 self-center">
            <TabsTrigger value="score">Add Score</TabsTrigger>
            <TabsTrigger value="scoreboard">Scoreboard</TabsTrigger>
            <TabsTrigger value="icebreaker">Icebreaker</TabsTrigger>
          </TabsList>
          <TabsContent value="score" className="h-full">
            <AddScore teamId={teamId} />
          </TabsContent>
          <TabsContent value="scoreboard" className="h-full">
            <Scoreboard />
          </TabsContent>
          <TabsContent value="icebreaker" className="h-full">
            <IceBreakerClient teamId={teamId} />
          </TabsContent>
        </Tabs>
      </div>
    </Suspense>
  );
}
