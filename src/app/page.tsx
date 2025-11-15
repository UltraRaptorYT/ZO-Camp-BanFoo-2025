"use client";

// import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
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
  DialogFooter,
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

// const Map = dynamic(() => import("@/components/Map"), {
//   ssr: false,
//   loading: () => (
//     <div className="h-[50vh] w-full max-w-3xl mx-auto rounded-xl border animate-pulse bg-muted" />
//   ),
// });

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

type Qn = FileQuestion | InputQuestion | GiftQuestion;

type QuestionType = {
  id: number;
  qn: Qn;
  type: "reward" | "noreward" | "empty" | "temptation" | "virtue";
  points: number;
  created_at: string;
};

export default function Home() {
  const searchParams = useSearchParams();
  const teamId = Number(searchParams.get("team_id")) || 1;
  // const [teamId, setTeamId] = useState()
  const goldRef = useRef(0);
  const [gold, setGold] = useState(0);
  const [question, setQuestion] = useState<QuestionType>();
  const [openDialog, setOpenDialog] = useState(false);
  const [answerInput, setAnswerInput] = useState("");
  const [openCorrect, setOpenCorrect] = useState(false);
  const [files, setFiles] = useState<File[] | undefined>();
  const handleDrop = (files: File[]) => {
    console.log(files);
    setFiles(files);
  };

  useEffect(() => {
    goldRef.current = gold;
  }, [gold]);

  useEffect(() => {
    const getScore = async () => {
      const { data, error } = await supabase
        .from("zo_banfoo_25_score")
        .select()
        .eq("team_id", teamId);

      if (error) {
        return toast.error("Failed to get score");
      }

      const score = data
        .map((e) => e.score)
        .reduce((a, v) => {
          return a + v;
        }, 0);

      setGold(score);
    };

    getScore();
  }, []);

  useEffect(() => {
    // subscribe to updates on zo_banfoo_25_state table
    const channel = supabase
      .channel("state-listener")
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT | UPDATE | DELETE | *
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
    console.log("State changed:", newState);

    if (newState.value == "true") {
      if (newState.key == "naturalDisaster") {
        const currentGold = goldRef.current;
        console.log("Current gold at disaster:", currentGold);

        const lost = Math.floor(currentGold / 2);
        if (lost <= 0) {
          toast.warning("WARNING!", {
            description:
              "A major flood has been triggered, but you had no gold to lose.",
          });
          return;
        }

        // 1) log the deduction in DB (negative score)
        const { error } = await supabase.from("zo_banfoo_25_score").insert({
          team_id: teamId,
          score: -lost,
          isAdmin: true,
          remarks: "Natural Disaster",
        });

        if (error) {
          console.error(error);
          toast.error("Failed to apply natural disaster.");
          return;
        }

        // 2) update local state
        setGold(currentGold - lost);

        toast.warning(`WARNING!`, {
          description: `Excessive anger detected!

A major flood has been triggered. ${lost} gold bars have been swept away by the flood.`,
        });
      } else {
        toast.warning(`WARNING!`);
      }
    }
  };

  // const [showMap, setShowMap] = useState(false);

  // useEffect(() => {
  //   const start = () => setShowMap(true);
  //   // Prefer idle; fallback to a tiny timeout
  //   if ("requestIdleCallback" in window) {
  //     (window as any).requestIdleCallback(start, { timeout: 800 });
  //   } else {
  //     setTimeout(start, 150);
  //   }
  // }, []);

  const openQuestion = async (questionNumber: string) => {
    try {
      if (!questionNumber) {
        throw new Error("Invalid Question Number");
      }

      console.log("Fetching question data for code:", questionNumber);
      const eventBody = {
        questionNumber,
      };

      console.log(eventBody);

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
      toast.error("User not found locally or via API.");
      return null;
    }
  };

  const handleScan = useCallback(async (detectedCodes: IDetectedBarcode[]) => {
    const code = detectedCodes[0]?.rawValue;
    return await processCode(code);
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

  const handleFileSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!question || question.qn.type !== "FILE") return;

    if (!files || files.length === 0) {
      toast.error("Please upload at least one file.");
      return;
    }

    try {
      // Upload each file to Supabase Storage
      const uploadedPaths: string[] = [];

      for (const file of files) {
        const filePath = `team-${teamId}/qr-${question.id}/${Date.now()}-${
          file.name
        }`;

        const { error } = await supabase.storage
          .from("zo_banfoo_25_uploads") // CHANGE to your actual bucket name
          .upload(filePath, file);

        if (error) {
          console.error("Upload error:", error);
          throw error;
        }

        uploadedPaths.push(filePath);
      }

      // Log completion of challenge (adjust columns to match your schema)
      await supabase.from("zo_banfoo_25_icebreaker").insert({
        team_id: teamId,
        qr: question.id,
        // files: uploadedPaths, // <- if you have a column (e.g. jsonb/text[]) for this
      });

      await supabase.from("zo_banfoo_25_score").insert({
        team_id: teamId,
        score: question.points,
        remarks: `Question ${question.id}`,
      });

      setGold((prev) => prev + question.points);
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

    await supabase.from("zo_banfoo_25_icebreaker").insert({
      team_id: teamId,
      qr: question.id,
    });
    toast.success("Congratulations! 🎉");

    await supabase.from("zo_banfoo_25_score").insert({
      team_id: teamId,
      score: question.points,
      remarks: `Question ${question.id}`,
    });

    setGold((prev) => prev + question.points);
    setOpenDialog(false);
  };

  const processCode = async (rawCode: string) => {
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!question || question.qn.type !== "INPUT") return;

    const userAnswer = String(answerInput).trim();
    const correctAnswer = String(question.qn.answer).trim();

    let isCorrect = userAnswer.toUpperCase() === correctAnswer.toUpperCase();
    if (question.id == 30) {
      isCorrect = userAnswer.includes(correctAnswer);
    }

    if (isCorrect) {
      toast.success("Correct answer! 🎉");
      setOpenCorrect(true);

      await supabase.from("zo_banfoo_25_icebreaker").insert({
        team_id: teamId,
        qr: question.id,
      });

      await supabase.from("zo_banfoo_25_score").insert({
        team_id: teamId,
        score: question.points,
        remarks: `Question ${question.id}`,
      });

      setGold((prev) => prev + question.points);
    } else {
      toast.error("Incorrect answer, try again!");
      return;
    }

    setOpenDialog(false);
  };
  return (
    <div className="fullHeight p-8 flex flex-col gap-5">
      <h1 className="text-center font-bold text-2xl">Z+O Camp Ice Breaker</h1>
      <div className="flex justify-between">
        <div>Team: Group {teamId}</div>
        <div>Gold: {gold}</div>
      </div>
      {/* <div className="rounded-xl overflow-hidden border h-[50vh]">
        {showMap ? (
          <Map />
        ) : (
          <div className="h-full w-full animate-pulse bg-muted" />
        )}
      </div> */}

      <Dialog open={openCorrect} onOpenChange={setOpenCorrect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {question?.type == "temptation"
                ? "TREASURE FOUND!"
                : question?.type == "empty"
                ? "NO TREASURE FOUND!"
                : question?.type == "virtue"
                ? "VIRTUOUS ACTS REMINDER"
                : "CHALLENGE COMPLETED!"}
            </DialogTitle>
            <DialogDescription>
              {question?.type == "temptation"
                ? ""
                : question?.type == "empty"
                ? "Unfortunately, there is no gold bar here. Better luck at the next location!"
                : question?.type == "virtue"
                ? `Have you done a virtuous act during camp? Upload a photo of your act to earn gold bars!

Remember: Only genuine acts of virtue count! Show your virtuous hearts now!`
                : question?.type == "noreward"
                ? `
Well done completing the challenge!

But oops... Looks like this treasure chest had a hole in the bottom! The gold bars rolled away long ago! Better luck at the next location!`
                : `Well done completing the challenge!

              ${question?.points} gold bars added to your treasure chest! Keep up the good work!`}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog}>
        {/* <DialogTrigger>Open</DialogTrigger> */}
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {question?.type == "temptation"
                ? "TREASURE FOUND!"
                : question?.type == "empty"
                ? "NO TREASURE FOUND!"
                : question?.type == "virtue"
                ? "VIRTUOUS ACTS REMINDER"
                : "CHALLENGE UNLOCKED!"}
            </DialogTitle>
            <DialogDescription>
              {question?.type == "temptation"
                ? ""
                : question?.type == "empty"
                ? "Unfortunately, there is no gold bar here. Better luck at the next location!"
                : question?.type == "virtue"
                ? `Have you done a virtuous act during camp? Upload a photo of your act to earn gold bars!

Remember: Only genuine acts of virtue count! Show your virtuous hearts now!`
                : "You've discovered a challenge! Complete it!"}
            </DialogDescription>
          </DialogHeader>
          {question?.type == "temptation" ? (
            <div className="space-y-4">
              <p>{question.qn.question}</p>
              <DialogFooter className="sm:justify-start">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleTemptation}
                  >
                    Close
                  </Button>
                </DialogClose>
              </DialogFooter>
            </div>
          ) : question?.qn.type == "INPUT" ? (
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
              <Button type="submit">Submit</Button>
            </form>
          ) : question?.qn.type == "FILE" ? (
            <form onSubmit={handleFileSubmit} className="space-y-4">
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

              <Button
                type="submit"
                disabled={!files || files.length === 0}
                className="columnn center"
              >
                Submit
              </Button>
              <DialogFooter className="sm:justify-start">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setOpenDialog(false)}
                  >
                    Close
                  </Button>
                </DialogClose>
              </DialogFooter>
            </form>
          ) : (
            ""
          )}
        </DialogContent>
      </Dialog>
      <Button onClick={() => processCode("zocampbanfoo_3")}>
        Trigger Scan
      </Button>
      <div className="mx-auto aspect-square max-w-3xl">
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
    </div>
  );
}
