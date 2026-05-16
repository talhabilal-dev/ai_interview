"use server";

import { generateObject } from "ai";
import { google } from "@ai-sdk/google";

import { db } from "@/firebase/admin";
import { feedbackSchema } from "@/constants";

export async function createFeedback(params) {
  const { interviewId, userId, transcript, feedbackId } = params;

  console.log("[createFeedback] called, transcript length:", transcript?.length);

  if (!interviewId || !userId || !transcript?.length) {
    console.error("[createFeedback] missing required params");
    return { success: false };
  }

  // ── STEP 1: Save transcript to Firestore immediately ──────────────────
  // This runs BEFORE Gemini so the transcript is never lost even if AI fails.
  let feedbackRef;
  try {
    if (feedbackId) {
      feedbackRef = db.collection("feedback").doc(feedbackId);
    } else {
      feedbackRef = db.collection("feedback").doc();
    }

    await feedbackRef.set({
      interviewId,
      userId,
      transcript,
      totalScore: null,
      categoryScores: null,
      strengths: null,
      areasForImprovement: null,
      finalAssessment: null,
      status: "transcript_saved",
      createdAt: new Date().toISOString(),
    });

    console.log("[createFeedback] transcript saved to Firestore, id:", feedbackRef.id);
  } catch (firestoreError) {
    console.error("[createFeedback] Firestore save failed:", firestoreError?.message);
    return { success: false };
  }

  // ── STEP 2: Generate AI feedback with Gemini ──────────────────────────
  try {
    const formattedTranscript = transcript
      .map((sentence) => `- ${sentence.role}: ${sentence.content}\n`)
      .join("");

    console.log("[createFeedback] calling Gemini...");

    const { object } = await generateObject({
      model: google("gemini-2.0-flash-001", {
        structuredOutputs: false,
      }),
      schema: feedbackSchema,
      prompt: `
        You are an AI interviewer analyzing a mock interview. Your task is to evaluate the candidate based on structured categories. Be thorough and detailed in your analysis. Don't be lenient with the candidate. If there are mistakes or areas for improvement, point them out.
        Transcript:
        ${formattedTranscript}

        Please score the candidate from 0 to 100 in the following areas. Do not add categories other than the ones provided:
        - **Communication Skills**: Clarity, articulation, structured responses.
        - **Technical Knowledge**: Understanding of key concepts for the role.
        - **Problem-Solving**: Ability to analyze problems and propose solutions.
        - **Cultural & Role Fit**: Alignment with company values and job role.
        - **Confidence & Clarity**: Confidence in responses, engagement, and clarity.
        `,
      system:
        "You are a professional interviewer analyzing a mock interview. Your task is to evaluate the candidate based on structured categories",
    });

    console.log("[createFeedback] Gemini done, totalScore:", object.totalScore);

    // ── STEP 3: Update the same Firestore doc with AI scores ────────────
    await feedbackRef.update({
      totalScore: object.totalScore,
      categoryScores: object.categoryScores,
      strengths: object.strengths,
      areasForImprovement: object.areasForImprovement,
      finalAssessment: object.finalAssessment,
      status: "completed",
    });

    console.log("[createFeedback] feedback updated with scores");
    return { success: true, feedbackId: feedbackRef.id };

  } catch (geminiError) {
    // Gemini failed but transcript is already saved — return the feedbackId
    // so the user is redirected to the feedback page (which will show
    // partial data until they retry scoring).
    console.error("[createFeedback] Gemini error:", geminiError?.message);
    console.error("[createFeedback] status:", geminiError?.status || geminiError?.statusCode);
    return { success: true, feedbackId: feedbackRef.id, geminiError: true };
  }
}

// ── Retry scoring for a saved transcript ─────────────────────────────────
// Call this from a "Retry scoring" button on the feedback page if Gemini failed.
export async function retryFeedbackScoring(feedbackDocId) {
  console.log("[retryFeedbackScoring] retrying for:", feedbackDocId);

  try {
    const docSnap = await db.collection("feedback").doc(feedbackDocId).get();
    if (!docSnap.exists) return { success: false, error: "Feedback not found" };

    const data = docSnap.data();
    if (!data.transcript?.length) return { success: false, error: "No transcript saved" };

    const formattedTranscript = data.transcript
      .map((s) => `- ${s.role}: ${s.content}\n`)
      .join("");

    const { object } = await generateObject({
      model: google("gemini-2.0-flash-001", { structuredOutputs: false }),
      schema: feedbackSchema,
      prompt: `
        You are an AI interviewer analyzing a mock interview. Evaluate the candidate based on structured categories.
        Transcript:
        ${formattedTranscript}

        Score from 0 to 100 in these areas only:
        - **Communication Skills**: Clarity, articulation, structured responses.
        - **Technical Knowledge**: Understanding of key concepts for the role.
        - **Problem-Solving**: Ability to analyze problems and propose solutions.
        - **Cultural & Role Fit**: Alignment with company values and job role.
        - **Confidence & Clarity**: Confidence in responses, engagement, and clarity.
      `,
      system: "You are a professional interviewer analyzing a mock interview.",
    });

    await db.collection("feedback").doc(feedbackDocId).update({
      totalScore: object.totalScore,
      categoryScores: object.categoryScores,
      strengths: object.strengths,
      areasForImprovement: object.areasForImprovement,
      finalAssessment: object.finalAssessment,
      status: "completed",
    });

    console.log("[retryFeedbackScoring] success, score:", object.totalScore);
    return { success: true };
  } catch (error) {
    console.error("[retryFeedbackScoring] error:", error?.message);
    return { success: false, error: error?.message };
  }
}

export async function getInterviewById(id) {
  const interview = await db.collection("interviews").doc(id).get();
  return interview.data();
}

export async function getFeedbackByInterviewId(params) {
  const { interviewId, userId } = params;

  if (!interviewId || !userId) return null;

  const querySnapshot = await db
    .collection("feedback")
    .where("interviewId", "==", interviewId)
    .where("userId", "==", userId)
    .limit(1)
    .get();

  if (querySnapshot.empty) return null;

  const feedbackDoc = querySnapshot.docs[0];
  return { id: feedbackDoc.id, ...feedbackDoc.data() };
}

export async function getLatestInterviews(params) {
  const { userId, limit = 20 } = params;

  if (!userId) return [];

  const interviews = await db
    .collection("interviews")
    .orderBy("createdAt", "desc")
    .where("finalized", "==", true)
    .where("userId", "!=", userId)
    .limit(limit)
    .get();

  return interviews.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

export async function getInterviewsByUserId(userId) {
  if (!userId) return [];

  const interviews = await db
    .collection("interviews")
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .get();

  return interviews.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}