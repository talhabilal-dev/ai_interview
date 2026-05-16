"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { vapi } from "@/lib/vapi.sdk";
import { interviewer } from "@/constants";
import { createFeedback } from "@/lib/actions/general.action";

const Agent = ({
  userName,
  userId,
  interviewId,
  feedbackId,
  type,
  questions,
  role,
  level,
  techstack,
}) => {
  const router = useRouter();
  const [callStatus, setCallStatus] = useState("INACTIVE");
  const [messages, setMessages] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastMessage, setLastMessage] = useState("");
  const [callError, setCallError] = useState("");

  // Keep a ref in sync with messages so the call-end handler
  // always reads the latest transcript (avoids stale closure bug).
  const messagesRef = useRef([]);
  const hasFinishedRef = useRef(false);

  useEffect(() => {
    const onCallStart = () => {
      hasFinishedRef.current = false;
      messagesRef.current = [];
      setMessages([]);
      setCallError("");
      setCallStatus("ACTIVE");
    };

    const onCallEnd = () => {
      if (hasFinishedRef.current) return;
      hasFinishedRef.current = true;
      setCallStatus("FINISHED");
    };

    const onMessage = (message) => {
      if (message.type === "transcript" && message.transcriptType === "final") {
        const newMessage = { role: message.role, content: message.transcript };
        // Update ref immediately (synchronous) so call-end always sees latest
        messagesRef.current = [...messagesRef.current, newMessage];
        setMessages((prev) => [...prev, newMessage]);
      }
    };

    const onSpeechStart = () => setIsSpeaking(true);
    const onSpeechEnd = () => setIsSpeaking(false);

    const onError = (error) => {
      console.error("Vapi error event:", error);
      try {
        const payload = error?.message || error;
        if (payload?.type === "ejected" || payload?.error?.type === "ejected") {
          if (hasFinishedRef.current) return;
          hasFinishedRef.current = true;
          setCallStatus("FINISHED");
        }
      } catch (e) {
        console.error("Error processing vapi error payload:", e);
      }
    };

    const onEjected = () => {
      if (hasFinishedRef.current) return;
      hasFinishedRef.current = true;
      setCallStatus("FINISHED");
    };

    const onDailyError = (payload) => {
      if (
        payload?.error?.type === "ejected" ||
        payload?.message?.type === "ejected"
      ) {
        if (hasFinishedRef.current) return;
        hasFinishedRef.current = true;
        setCallStatus("FINISHED");
        return;
      }
      console.error("Vapi daily-error event:", payload);
    };

    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd);
    vapi.on("message", onMessage);
    vapi.on("speech-start", onSpeechStart);
    vapi.on("speech-end", onSpeechEnd);
    vapi.on("error", onError);
    vapi.on("ejected", onEjected);
    vapi.on("daily-error", onDailyError);

    return () => {
      vapi.off("call-start", onCallStart);
      vapi.off("call-end", onCallEnd);
      vapi.off("message", onMessage);
      vapi.off("speech-start", onSpeechStart);
      vapi.off("speech-end", onSpeechEnd);
      vapi.off("error", onError);
      vapi.off("ejected", onEjected);
      vapi.off("daily-error", onDailyError);
    };
  }, []);

  // Update last message for the transcript display
  useEffect(() => {
    if (messages.length > 0) {
      setLastMessage(messages[messages.length - 1].content);
    }
  }, [messages]);

  // Handle post-call logic — runs when callStatus becomes "FINISHED".
  // Uses messagesRef (not messages state) to avoid the stale closure problem
  // where messages would be [] because React state hadn't updated yet.
  useEffect(() => {
    if (callStatus !== "FINISHED") return;

    if (type === "generate") {
      router.push("/");
      return;
    }

    const transcript = messagesRef.current;
    console.log("Generating feedback with transcript length:", transcript.length);

    if (transcript.length === 0) {
      console.warn("Transcript empty — no messages captured. Redirecting home.");
      router.push("/");
      return;
    }

    const handleGenerateFeedback = async () => {
      const { success, feedbackId: id } = await createFeedback({
        interviewId,
        userId,
        transcript,
        feedbackId,
      });

      if (success && id) {
        router.push(`/interview/${interviewId}/feedback`);
      } else {
        router.push("/");
      }
    };

    handleGenerateFeedback();
  }, [callStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCall = async () => {
    setCallError("");

    if (!navigator?.mediaDevices?.getUserMedia) {
      setCallError("Your browser does not support microphone access.");
      return;
    }

    setCallStatus("CONNECTING");

    try {
      if (type === "generate") {
        await vapi.start("d31d6f74-5e12-4c69-8e20-c04f364e798f");
      } else {
        const formattedQuestions = questions
          ? questions.map((q) => `- ${q}`).join("\n")
          : "";

        const techstackString = Array.isArray(techstack)
          ? techstack.join(", ")
          : techstack;

        const assistantOverrides = {
          variableValues: {
            questions: formattedQuestions,
            role: role || "Developer",
            level: level || "Mid-level",
            techstack: techstackString || "N/A",
            type: type || "Technical",
          },
        };

        await vapi.start(interviewer, assistantOverrides);
      }
    } catch (err) {
      console.error("vapi.start error:", err);
      setCallStatus("INACTIVE");
      setCallError(err?.message || "Failed to start the call.");
    }
  };

  const handleDisconnect = () => {
    vapi.stop();
    // onCallEnd will fire and set callStatus to FINISHED
  };

  return (
    <>
      <div className="call-view">
        <div className="card-interviewer">
          <div className="avatar">
            <Image
              src="/ai-avatar.png"
              alt="profile-image"
              width={65}
              height={54}
              className="object-cover"
            />
            {isSpeaking && <span className="animate-speak" />}
          </div>
          <h3>AI Interviewer</h3>
        </div>

        <div className="card-border">
          <div className="card-content">
            <Image
              src="/user-avatar.png"
              alt="profile-image"
              width={539}
              height={539}
              className="rounded-full object-cover size-30"
            />
            <h3>{userName}</h3>
          </div>
        </div>
      </div>

      {messages.length > 0 && (
        <div className="transcript-border">
          <div className="transcript">
            <p
              key={lastMessage}
              className={cn(
                "transition-opacity duration-500 opacity-0",
                "animate-fadeIn opacity-100"
              )}
            >
              {lastMessage}
            </p>
          </div>
        </div>
      )}

      {callError ? (
        <p className="mt-4 text-sm text-destructive-100 text-center max-w-xl mx-auto">
          {callError}
        </p>
      ) : null}

      <div className="w-full flex justify-center">
        {callStatus !== "ACTIVE" ? (
          <button className="relative btn-call" onClick={handleCall}>
            <span
              className={cn(
                "absolute animate-ping rounded-full opacity-75",
                callStatus !== "CONNECTING" && "hidden"
              )}
            />
            <span className="relative">
              {callStatus === "INACTIVE" || callStatus === "FINISHED"
                ? "Call"
                : ". . ."}
            </span>
          </button>
        ) : (
          <button className="btn-disconnect" onClick={handleDisconnect}>
            End
          </button>
        )}
      </div>
    </>
  );
};

export default Agent;