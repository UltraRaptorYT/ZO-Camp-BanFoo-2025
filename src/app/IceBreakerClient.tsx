"use client";

import { useCallback, useState, FormEvent, useEffect, useRef } from "react";
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
  // DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import supabase from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/components/ui/shadcn-io/dropzone";
import { cn } from "@/lib/utils";

type FileQuestion = {
  type: "FILE";
  question: string;
  src: string;
};

type InputQuestion = {
  type: "INPUT";
  question: string;
  answer: string;
};

type GiftQuestion = {
  type: "GIFT";
  question: string;
};

type TaskQuestion = {
  type: "TASK";
  question: string;
};

type Qn = FileQuestion | InputQuestion | GiftQuestion | TaskQuestion;

type QuestionType = {
  id: number;
  qn: Qn;
  type: "reward" | "noreward" | "empty" | "temptation" | "virtue";
  points: number;
  created_at: string;
};

// --- Helper functions to combine dialog logic ---

type DialogVariant = "challenge" | "result";

const getDialogTitle = (
  question: QuestionType | undefined,
  variant: DialogVariant
) => {
  const defaultTitle =
    variant === "challenge" ? "CHALLENGE UNLOCKED!" : "CHALLENGE COMPLETED!";

  if (!question) return defaultTitle;

  switch (question.type) {
    case "temptation":
      return "TREASURE FOUND!";
    case "empty":
      return "NO TREASURE FOUND!";
    case "virtue":
      return "VIRTUOUS ACTS REMINDER";
    default:
      return defaultTitle;
  }
};

const getDialogDescription = (
  question: QuestionType | undefined,
  variant: DialogVariant
) => {
  if (!question) {
    return variant === "challenge"
      ? "You've discovered a challenge! Complete it!"
      : "Well done completing the challenge!";
  }

  // Temptation: both dialogs show no extra description
  if (question.type === "temptation") {
    return "";
  }

  if (question.type === "empty") {
    return "Unfortunately, there is no gold bar here. Better luck at the next location!";
  }

  if (question.type === "virtue") {
    return `Have you done a virtuous act during camp? Upload a photo of your act to earn gold bars!

Remember: Only genuine acts of virtue count! Show your virtuous hearts now!`;
  }

  if (question.type === "noreward") {
    if (variant === "result") {
      return [
        "Well done completing the challenge!",
        "But oops... Looks like this treasure chest had a hole in the bottom!",
        "The gold bars rolled away long ago!",
        "Better luck at the next location!",
      ].join("\n");
    }

    // Challenge variant falls back to generic challenge message
    return "You've discovered a challenge! Complete it!";
  }

  // Default: normal reward question
  if (variant === "result") {
    return `Well done completing the challenge!

${question.points} gold bars added to your treasure chest! Keep up the good work!`;
  }

  return "You've discovered a challenge! Complete it!";
};

// --- Component ---

type IcebreakerClientProps = {
  teamId: number;
};

export default function IcebreakerClient({ teamId }: IcebreakerClientProps) {
  const lastSystemEventRef = useRef<Record<string, string>>({});
  const goldRef = useRef(0);
  const [gold, setGold] = useState(0);
  const [question, setQuestion] = useState<QuestionType>();
  const [openDialog, setOpenDialog] = useState(false);
  const [answerInput, setAnswerInput] = useState("");
  const [openCorrect, setOpenCorrect] = useState(false);
  const [files, setFiles] = useState<File[] | undefined>();
  const [systemKey, setSystemKey] = useState<string | null>(null);

  const [systemOpen, setSystemOpen] = useState(false);
  const [systemTitle, setSystemTitle] = useState("WARNING!");
  const [systemDesc, setSystemDesc] = useState("");

  const getSystemDialogClass = (key: string | null) => {
    console.log(key);
    switch (key) {
      case "naturalDisaster":
        return "bg-red-800/80 text-white";
      case "worldPeace":
        return "bg-green-700/80 text-white";
      default:
        return "bg-slate-900/80 text-white";
    }
  };

  const handleDrop = (files: File[]) => {
    console.log(files);
    setFiles(files);
  };

  // --- Shared helper: log completion + award points ---
  const awardPointsAndLog = useCallback(
    async (
      q: QuestionType,
      extraIcebreakerFields: Record<string, any> = {}
    ) => {
      try {
        // Log completion of this QR challenge
        const { error: iceErr } = await supabase
          .from("zo_banfoo_25_icebreaker")
          .insert({
            team_id: teamId,
            qr: q.id,
            ...extraIcebreakerFields,
          });

        if (iceErr) {
          console.error("Icebreaker insert error:", iceErr);
          toast.error("Failed to log challenge completion.");
          return false;
        }

        // Award points
        const { error: scoreErr } = await supabase
          .from("zo_banfoo_25_score")
          .insert({
            team_id: teamId,
            score: q.points,
            remarks: `Question ${q.id}`,
          });

        if (scoreErr) {
          console.error("Score insert error:", scoreErr);
          toast.error("Failed to award points.");
          return false;
        }

        setGold((prev) => prev + q.points);
        return true;
      } catch (err) {
        console.error(err);
        toast.error("Something went wrong while awarding points.");
        return false;
      }
    },
    [teamId]
  );

  useEffect(() => {
    goldRef.current = gold;
  }, [gold]);

  const refreshGoldFromDB = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("zo_banfoo_25_score")
        .select("score")
        .eq("team_id", teamId);

      if (error) {
        console.error(error);
        toast.error("Failed to get score");
        return null;
      }

      const total = (data ?? []).reduce(
        (sum, row: { score: number }) => sum + row.score,
        0
      );

      setGold(total);
      goldRef.current = total; // keep ref in sync

      return total;
    } catch (err) {
      console.error(err);
      toast.error("Failed to refresh score");
      return null;
    }
  }, [teamId]);

  useEffect(() => {
    refreshGoldFromDB();
  }, [refreshGoldFromDB]);

  useEffect(() => {
    const channel = supabase
      .channel("state-listener")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "zo_banfoo_25_state",
        },
        async (payload) => {
          console.log("Realtime payload:", payload);
          await handleStateUpdate(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleStateUpdate = async (newState: any) => {
    if (!newState?.key) return;

    const key = String(newState.key);
    const value =
      typeof newState.value === "boolean"
        ? String(newState.value)
        : String(newState.value);
    setSystemKey(key);

    const stamp = String(newState.time_updated ?? "");

    // Simple de-dupe by time_updated (if available)
    if (stamp && lastSystemEventRef.current[key] === stamp) {
      return;
    }
    if (key === "naturalDisaster" && value === "true") {
      if (stamp) lastSystemEventRef.current[key] = stamp;

      const previousGold = goldRef.current ?? 0;
      const newGold = await refreshGoldFromDB();
      if (newGold === null) return;

      const lost = Math.max(0, previousGold - newGold);

      setSystemTitle("WARNING!");
      setSystemDesc(
        lost > 0
          ? `A major flood has been triggered.\n${lost} gold bars have been swept away by the flood.`
          : "A major flood has been triggered, but your team had no gold to lose."
      );

      setSystemOpen(true);
      return;
    }

    if (key === "worldPeace" && value === "true") {
      if (stamp) lastSystemEventRef.current[key] = stamp;

      const previousGold = goldRef.current ?? 0;
      const newGold = await refreshGoldFromDB();
      if (newGold === null) return;

      const gained = Math.max(0, newGold - previousGold);

      setSystemTitle("INCREDIBLE NEWS!");
      setSystemDesc(
        [
          "All groups' good deeds have reached the camp target!",
          "",
          "All gold bars you have already earned are now DOUBLED!",
          gained > 0 ? `Your team gained +${gained} gold bars.` : "",
          "",
          "Thank you for your kindness and contributions.",
          "The world is better because of you~",
          "",
          "Don't forget to keep doing good deeds as you continue your journey!",
        ]
          .filter(Boolean)
          .join("\n")
      );

      setSystemOpen(true);
      return;
    }

    // other state keys if needed
  };

  useEffect(() => {
    const scoreChannel = supabase
      .channel(`score-listener-team-${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "zo_banfoo_25_score",
          filter: `team_id=eq.${teamId}`,
        },
        async () => {
          await refreshGoldFromDB();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(scoreChannel);
    };
  }, [teamId, refreshGoldFromDB]);

  const openQuestion = async (questionNumber: string) => {
    try {
      if (!questionNumber) {
        throw new Error("Invalid Question Number");
      }

      console.log("Fetching question data for code:", questionNumber);

      const { data, error } = await supabase
        .from("zo_banfoo_25_qr")
        .select()
        .eq("id", questionNumber);

      if (error) {
        console.error("Question fetch failed:", error);
        throw new Error(JSON.stringify(error) || "API error");
      }

      if (data && data.length > 0) {
        return data[0] as QuestionType;
      }

      return null;
    } catch (err) {
      console.error(err);
      toast.error("Question not found");
      return null;
    }
  };

  const processCode = async (rawCode: string | undefined) => {
    if (!rawCode) return toast.error("Missing Code!");

    console.log("Processing code:", rawCode);
    const splitCode = rawCode.split("_");
    if (splitCode[0] !== "zocampbanfoo") {
      return toast.error("Invalid Code!");
    }

    const questionNumber = splitCode[1];
    const questionRes = await openQuestion(questionNumber);

    console.log(questionRes);

    if (questionRes) {
      setQuestion(questionRes);
      setOpenDialog(true);
      setAnswerInput("");
    }
  };

  const handleScan = useCallback(
    async (detectedCodes: IDetectedBarcode[]) => {
      if (openDialog) return;
      const code = detectedCodes[0]?.rawValue;
      return await processCode(code);
    },
    [openDialog]
  );

  const handleError = useCallback((error: unknown) => {
    if (error instanceof Error) {
      console.error("Scanner error:", error.message);
      toast.error(`Scanner error: ${error.message}`);
    } else {
      console.error("Unknown scanner error:", error);
      toast.error(`Unknown scanner error:: ${String(error)}`);
    }
  }, []);

  const handleFileSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!question || question.qn.type !== "FILE") return;

    if (!files || files.length === 0) {
      toast.error("Please upload at least one file.");
      return;
    }

    try {
      const uploadedPaths: string[] = [];

      for (const file of files) {
        const filePath = `${question.qn.src}/team-${teamId}_qr-${
          question.id
        }_${Date.now()}_${file.name}`;

        const { error } = await supabase.storage
          .from("zo_banfoo_25")
          .upload(filePath, file);

        if (error) {
          console.error("Upload error:", error);
          throw error;
        }

        uploadedPaths.push(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/zo_banfoo_25/${filePath}`
        );
      }

      const ok = await awardPointsAndLog(question, { files: uploadedPaths });
      if (!ok) return;

      setFiles(undefined);
      setOpenDialog(false);
      setOpenCorrect(true);

      toast.success("Files uploaded successfully! 🎉");
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong while uploading the files.");
    }
  };

  const handleTemptation = async () => {
    if (!question || question.type !== "temptation") return;

    // Temptation: no extra fields, just completion + score
    const ok = await awardPointsAndLog(question);
    if (ok) {
      toast.success("Congratulations! 🎉");
    }
    setOpenDialog(false);
  };

  const handleTaskComplete = async () => {
    if (!question || question.qn.type !== "TASK") return;

    const ok = await awardPointsAndLog(question);
    if (!ok) return;

    toast.success("Task completed! 🎉");
    setOpenDialog(false);
    setOpenCorrect(true);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!question || question.qn.type !== "INPUT") return;

    const userAnswer = String(answerInput).trim();
    const correctAnswer = String(question.qn.answer).trim();

    let isCorrect = userAnswer.toUpperCase() === correctAnswer.toUpperCase();
    if (question.id === 30) {
      console.log(correctAnswer, userAnswer);
      isCorrect = userAnswer.includes(correctAnswer);
    }

    if (!isCorrect) {
      toast.error("Incorrect answer, try again!");
      return;
    }

    toast.success("Correct answer! 🎉");

    const ok = await awardPointsAndLog(question);
    if (!ok) return;

    setOpenCorrect(true);
    setOpenDialog(false);
  };

  return (
    <div className="fullHeight p-8 flex flex-col gap-5">
      <h1 className="text-center font-bold text-2xl">Z+O Camp Ice Breaker</h1>
      <div className="flex justify-between">
        <div>Team: Group {teamId}</div>
        <div>Gold: {gold}</div>
      </div>

      {/* System / Global event dialog (highest priority) */}
      <Dialog open={systemOpen} onOpenChange={setSystemOpen}>
        <DialogContent
          showCloseButton={false}
          className={`z-200 ${getSystemDialogClass(systemKey)}`}
        >
          <DialogHeader className="gap-4">
            <DialogTitle className="text-xl">{systemTitle}</DialogTitle>
            <DialogDescription className="text-base whitespace-pre-line text-white">
              {systemDesc}
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-center">
            <Button
              onClick={() => {
                setSystemOpen(false);
                setSystemKey(null);
              }}
            >
              Okay
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Result dialog */}
      <Dialog open={openCorrect} onOpenChange={setOpenCorrect}>
        <DialogContent showCloseButton={false}>
          <DialogHeader className="gap-5">
            <DialogTitle className="text-xl">
              {getDialogTitle(question, "result")}
            </DialogTitle>
            <DialogDescription className="text-base whitespace-pre-line">
              {getDialogDescription(question, "result")}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Main challenge dialog */}
      <Dialog open={openDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{getDialogTitle(question, "challenge")}</DialogTitle>
            <DialogDescription className="whitespace-pre-line">
              {getDialogDescription(question, "challenge")}
            </DialogDescription>
          </DialogHeader>

          {/* Challenge content */}
          {question?.type === "temptation" ? (
            <div className="space-y-4">
              <p>{question.qn.question}</p>

              {/* ACTION ROW */}
              <div className="flex flex-row items-center justify-center gap-3">
                <Button onClick={handleTemptation}>Claim</Button>
              </div>
            </div>
          ) : question?.qn.type === "INPUT" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p>{question.qn.question}</p>

              <div className="grid w-full max-w-sm items-center gap-3">
                <Label htmlFor="answer">Answer</Label>
                <Input
                  id="answer"
                  type="text"
                  placeholder="Answer"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                />
              </div>

              {/* ACTION ROW */}
              <div className="flex flex-row items-center justify-center gap-3">
                <Button type="submit">Submit</Button>

                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      toast.info("You gave up!");
                      setOpenDialog(false);
                    }}
                  >
                    I give up
                  </Button>
                </DialogClose>
              </div>
            </form>
          ) : question?.qn.type === "FILE" ? (
            <form onSubmit={handleFileSubmit} className="space-y-4 w-full">
              <p>{question.qn.question}</p>

              <Dropzone
                className="whitespace-pre-line w-full"
                maxFiles={3}
                onDrop={handleDrop}
                onError={console.error}
                src={files}
              >
                <DropzoneEmptyState />
                <DropzoneContent />
              </Dropzone>

              {/* ACTION ROW */}
              <div className="flex flex-row items-center justify-center gap-3">
                <Button type="submit" disabled={!files || files.length === 0}>
                  Submit
                </Button>

                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      toast.info("You gave up!");
                      setOpenDialog(false);
                    }}
                  >
                    I give up
                  </Button>
                </DialogClose>
              </div>
            </form>
          ) : question?.qn.type === "TASK" ? (
            <div className="space-y-4">
              <p>{question.qn.question}</p>

              {/* ACTION ROW */}
              <div className="flex flex-row items-center justify-center gap-3">
                <Button onClick={handleTaskComplete}>Completed</Button>

                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      toast.info("You gave up!");
                      setOpenDialog(false);
                    }}
                  >
                    I give up
                  </Button>
                </DialogClose>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Button onClick={() => processCode("zocampbanfoo_13")}>
        Trigger Scan
      </Button>

      <div className="mx-auto aspect-square max-w-3xl border w-full">
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
          paused={openDialog || systemOpen}
        />
      </div>
    </div>
  );
}
