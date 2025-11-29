"use client";

import AddScore from "@/components/AddScore";
import Scoreboard from "@/components/Scoreboard";
import IceBreakerAdmin from "@/components/IceBreakerAdmin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocalStorageState } from "@/lib/utils";

export default function Admin() {
  const [currentTab, setCurrentTab] = useLocalStorageState("tab", "score");

  return (
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
          <AddScore isAdmin={true} />
        </TabsContent>
        <TabsContent value="scoreboard" className="h-full">
          <Scoreboard isAdmin={true} />
        </TabsContent>
        <TabsContent value="icebreaker" className="h-full">
          <IceBreakerAdmin />
        </TabsContent>
      </Tabs>
    </div>
  );
}
