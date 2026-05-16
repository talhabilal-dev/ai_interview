import { generateText } from "ai";
import { google } from "@ai-sdk/google";

import { db } from "@/firebase/admin";
import { getRandomInterviewCover } from "@/lib/utils";
import { getCurrentUser } from "@/lib/actions/auth.action";

function buildFallbackQuestions({ role, level, type, techstack, amount }) {
  const primaryTech = techstack[0] || role;
  const secondaryTech = techstack[1] || primaryTech;

  const templatesByType = {
    Technical: [
      `How have you used ${primaryTech} in a ${role} role?`,
      `Can you explain a challenge you solved with ${secondaryTech}?`,
      `How do you approach writing reliable code for ${level} level work?`,
      `What tradeoffs would you consider when building with ${primaryTech}?`,
      `Describe a recent technical decision you made and why.`,
    ],
    Behavioral: [
      `Tell me about a time you handled a difficult situation on a team.`,
      `How do you stay organized when several priorities compete at once?`,
      `Describe a moment when you had to learn something quickly for a project.`,
      `Tell me about feedback you received that helped you improve.`,
      `How do you communicate progress when requirements are changing?`,
    ],
    Mixed: [
      `How have you used ${primaryTech} to support a ${role} project?`,
      `Tell me about a time you solved a team problem under pressure.`,
      `What is a technical tradeoff you have had to make recently?`,
      `How do you balance quality and speed when delivering work?`,
      `Describe a project where both collaboration and technical skill mattered.`,
    ],
  };

  const baseQuestions = templatesByType[type] || templatesByType.Mixed;
  const questions = [];

  for (let index = 0; index < amount; index += 1) {
    questions.push(baseQuestions[index % baseQuestions.length]);
  }

  return questions;
}

export async function POST(request) {
  const { type, role, level, techstack, amount } = await request.json();

  const user = await getCurrentUser();
  if (!user?.id) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const safeRole = String(role || "").trim();
  const safeLevel = String(level || "").trim();
  const safeType = String(type || "").trim();
  const techArray = Array.isArray(techstack)
    ? techstack
    : String(techstack || "").split(",");
  const cleanedTechstack = techArray
    .map((tech) => String(tech).trim())
    .filter(Boolean);

  if (!safeRole || !safeLevel || !safeType || cleanedTechstack.length === 0) {
    return Response.json(
      { success: false, error: "Missing required fields" },
      { status: 400 }
    );
  }

  const parsedAmount = Number.parseInt(amount, 10);
  const safeAmount = Number.isFinite(parsedAmount)
    ? Math.min(Math.max(parsedAmount, 1), 20)
    : 5;

  try {
    const { text: questions } = await generateText({
      model: google("gemini-2.0-flash-001"),
      prompt: `Prepare questions for a job interview.
        The job role is ${safeRole}.
        The job experience level is ${safeLevel}.
        The tech stack used in the job is: ${cleanedTechstack.join(", ")}.
        The focus between behavioural and technical questions should lean towards: ${safeType}.
        The amount of questions required is: ${safeAmount}.
        Please return only the questions, without any additional text.
        The questions are going to be read by a voice assistant so do not use "/" or "*" or any other special characters which might break the voice assistant.
        Return the questions formatted like this:
        ["Question 1", "Question 2", "Question 3"]
        
        Thank you! <3
    `,
    });

    let parsedQuestions = [];
    try {
      parsedQuestions = JSON.parse(questions);
    } catch (parseError) {
      console.error("Invalid question format:", parseError);
      return Response.json(
        { success: false, error: "Invalid question format" },
        { status: 500 }
      );
    }

    if (parsedQuestions.length === 0) {
      parsedQuestions = buildFallbackQuestions({
        role: safeRole,
        level: safeLevel,
        type: safeType,
        techstack: cleanedTechstack,
        amount: safeAmount,
      });
    }

    const interview = {
      role: safeRole,
      type: safeType,
      level: safeLevel,
      techstack: cleanedTechstack,
      questions: parsedQuestions,
      userId: user.id,
      finalized: true,
      coverImage: getRandomInterviewCover(),
      createdAt: new Date().toISOString(),
    };

    const interviewRef = await db.collection("interviews").add(interview);

    return Response.json(
      { success: true, interviewId: interviewRef.id },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = String(error?.message || "");
    const quotaExceeded =
      error?.statusCode === 429 ||
      errorMessage.toLowerCase().includes("quota") ||
      errorMessage.toLowerCase().includes("rate limit");

    if (quotaExceeded) {
      try {
        const fallbackQuestions = buildFallbackQuestions({
          role: safeRole,
          level: safeLevel,
          type: safeType,
          techstack: cleanedTechstack,
          amount: safeAmount,
        });

        const interview = {
          role: safeRole,
          type: safeType,
          level: safeLevel,
          techstack: cleanedTechstack,
          questions: fallbackQuestions,
          userId: user.id,
          finalized: true,
          coverImage: getRandomInterviewCover(),
          createdAt: new Date().toISOString(),
        };

        const interviewRef = await db.collection("interviews").add(interview);

        return Response.json(
          {
            success: true,
            interviewId: interviewRef.id,
            warning:
              "Interview questions were generated locally because the AI service quota was exceeded.",
          },
          { status: 200 }
        );
      } catch (fallbackError) {
        console.error("Fallback generation error:", fallbackError);
        return Response.json(
          {
            success: false,
            error:
              fallbackError?.message ||
              "Failed to generate interview questions locally.",
          },
          { status: 500 }
        );
      }
    }

    console.error("Error:", error);
    return Response.json(
      { success: false, error: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({ success: true, data: "Thank you!" }, { status: 200 });
}
