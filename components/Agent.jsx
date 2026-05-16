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
  const [endReason, setEndReason] = useState("");
  const [callError, setCallError] = useState("");
  const hasFinishedRef = useRef(false);

  const finishCall = (message, isError = false) => {
    if (hasFinishedRef.current) return;

    hasFinishedRef.current = true;
    setCallStatus("FINISHED");
    setEndReason(message || "");

    if (message) {
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `${isError ? "Error" : "Call ended"}: ${message}`,
        },
      ]);
    }
  };

  useEffect(() => {
    const onCallStart = () => {
      hasFinishedRef.current = false;
      setEndReason("");
      setCallError("");
      setCallStatus("ACTIVE");
    };

    const onCallEnd = () => {
      finishCall("The provider ended the meeting.");
    };

    const onMessage = (message) => {
      if (message.type === "transcript" && message.transcriptType === "final") {
        const newMessage = { role: message.role, content: message.transcript };
        setMessages((prev) => [...prev, newMessage]);
      }
    };

    const onSpeechStart = () => {
      setIsSpeaking(true);
    };

    const onSpeechEnd = () => {
      setIsSpeaking(false);
    };

    const onError = (error) => {
      console.error("Vapi error event:", error);

      try {
        const payload = error?.message || error;
        if (payload?.type === "ejected" || payload?.error?.type === "ejected") {
          const msg =
            payload?.message?.msg ||
            payload?.msg ||
            payload?.reason ||
            payload?.error?.msg ||
            "Meeting has ended";
          finishCall(msg, false);
        }
      } catch (e) {
        console.error("Error processing vapi error payload:", e);
      }
    };

    const onEjected = (payload) => {
      const msg =
        payload?.message?.msg ||
        payload?.msg ||
        payload?.reason ||
        payload?.error?.msg ||
        "Meeting has ended";
      finishCall(msg, false);
    };

    const onDailyError = (payload) => {
      const msg =
        payload?.errorMsg ||
        payload?.message?.msg ||
        payload?.message ||
        payload?.error?.msg ||
        "Meeting has ended";

      if (payload?.error?.type === "ejected" || payload?.message?.type === "ejected") {
        finishCall(msg, false);
        return;
      }

      console.error("Vapi daily-error event:", payload);
      finishCall(msg, true);
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

  useEffect(() => {
    if (messages.length > 0) {
      setLastMessage(messages[messages.length - 1].content);
    }

    const handleGenerateFeedback = async (transcriptMessages) => {
      const { success, feedbackId: id } = await createFeedback({
        interviewId,
        userId,
        transcript: transcriptMessages,
        feedbackId,
      });

      if (success && id) {
        router.push(`/interview/${interviewId}/feedback`);
      } else {
        router.push("/");
      }
    };

    if (callStatus === "FINISHED") {
      if (type === "generate") {
        router.push("/");
      } else {
        handleGenerateFeedback(messages);
      }
    }
  }, [messages, callStatus, feedbackId, interviewId, router, type, userId]);

  const handleCall = async () => {
    setCallError("");

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error("Your browser does not support microphone access.");
      }

      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.getTracks().forEach((track) => track.stop());
    } catch (micError) {
      console.error("Microphone permission error:", micError);
      setCallStatus("INACTIVE");
      setCallError("Microphone access is blocked or unavailable. Allow mic permissions and try again.");
      return;
    }

    setCallStatus("CONNECTING");

    try {
      if (type === "generate") {
        const res = await vapi.start(
          "d31d6f74-5e12-4c69-8e20-c04f364e798f"
        );
        console.log("vapi.start (generate) result:", res);
      } else {
        const formattedQuestions = questions
          ? questions.map((question) => `- ${question}`).join("\n")
          : "";

        const techstackString = Array.isArray(techstack) ? techstack.join(", ") : techstack;

        const res = await vapi.start(
          interviewer,
          undefined,
          undefined,
          undefined,
          undefined,
          {
            roomDeleteOnUserLeaveEnabled: false,
            variableValues: {
              questions: formattedQuestions,
              role: role || "Developer",
              level: level || "Mid-level",
              techstack: techstackString || "N/A",
              type: type || "Technical",
            },
          }
        );

        console.log("vapi.start (interviewer) result:", res);
      }
    } catch (err) {
      console.error("vapi.start error:", err);
      setCallStatus("INACTIVE");
      setCallError(err?.message || "Failed to start the call.");
    }
  };

  const handleDisconnect = () => {
    finishCall("You ended the meeting.");
    vapi.stop();
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

      {callStatus === "FINISHED" && endReason ? (
        <p className="mt-4 text-sm text-light-100 text-center max-w-xl mx-auto">
          {endReason}
        </p>
      ) : null}

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
              {callStatus === "INACTIVE" || callStatus === "FINISHED" ? "Call" : ". . ."}
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