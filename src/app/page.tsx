"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import {
  Scanner as ScannerComp,
  centerText,
  IDetectedBarcode,
} from "@yudiel/react-qr-scanner";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UnscrambleGame } from "@/components/UnscrambleGame";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="h-[50vh] w-full max-w-3xl mx-auto rounded-xl border animate-pulse bg-muted" />
  ),
});

export default function Home() {
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    const start = () => setShowMap(true);
    // Prefer idle; fallback to a tiny timeout
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(start, { timeout: 800 });
    } else {
      setTimeout(start, 150);
    }
  }, []);

  const [initialWord, setInitialWord] = useState("TCAH");
  const [answerWord, setAnswerWord] = useState("CHAT");
  const [submitted, setSubmitted] = useState({
    initial: "TCAH",
    answer: "CHAT",
  });

  const handleScan = useCallback((detectedCodes: IDetectedBarcode[]) => {
    const code = detectedCodes[0]?.rawValue;
    if (!code) return toast.error("Missing Code!");
    console.log("Scanned:", code);
    const splitCode = code.split("_");
    if (splitCode[0] != "zocampbanfoo") {
      return toast.error("Invalid Code!");
    }
    return toast.success(splitCode[1]);
  }, []);

  const handleError = useCallback((error: unknown) => {
    if (error instanceof Error) {
      console.error("Scanner error:", error.message);
      toast.error(`Scanner error: ${error.message}`);
    } else {
      console.error("Unknown scanner error:", error);
      toast.error(`Unknown scanner error:: ${error}`);
    }
  }, []);

  return (
    <div>
      <div className="rounded-xl overflow-hidden border h-[50vh]">
        {showMap ? (
          <Map />
        ) : (
          <div className="h-full w-full animate-pulse bg-muted" />
        )}
      </div>

      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your
              account and remove your data from our servers.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      <div className="w-4/5 mx-auto aspect-square max-w-3xl">
        <ScannerComp
          formats={[
            "qr_code",
            "micro_qr_code",
            "rm_qr_code",
            "maxi_code",
            "pdf417",
            "aztec",
            "data_matrix",
            "matrix_codes",
            "dx_film_edge",
            "databar",
            "databar_expanded",
            "codabar",
            "code_39",
            "code_93",
            "code_128",
            "ean_8",
            "ean_13",
            "itf",
            "linear_codes",
            "upc_a",
            "upc_e",
          ]}
          onScan={handleScan}
          onError={handleError}
          components={{
            onOff: false,
            torch: true,
            zoom: true,
            finder: true,
            tracker: centerText,
          }}
          allowMultiple={false}
          scanDelay={0}
        />
      </div>
      <div className="min-h-dvh w-full p-6 flex flex-col gap-6">
        <Card className="w-full max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Initial (scrambled) word
                </label>
                <Input
                  value={initialWord}
                  onChange={(e) => setInitialWord(e.target.value)}
                  placeholder="e.g. TCAH"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Correct word</label>
                <Input
                  value={answerWord}
                  onChange={(e) => setAnswerWord(e.target.value)}
                  placeholder="e.g. CHAT"
                />
              </div>
            </div>
            <Button
              onClick={() =>
                setSubmitted({ initial: initialWord, answer: answerWord })
              }
            >
              Start / Update Puzzle
            </Button>
          </CardContent>
        </Card>

        <UnscrambleGame
          initialWord={submitted.initial}
          answerWord={submitted.answer}
        />
      </div>
    </div>
  );
}
