"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { retryFeedbackScoring } from "@/lib/actions/general.action";

const RetryScoring = ({ feedbackId, interviewId }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRetry = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await retryFeedbackScoring(feedbackId);
      if (result.success) {
        // Refresh the page to show the new scores
        router.refresh();
      } else {
        setError(result.error || "Scoring failed. Please try again.");
      }
    } catch (e) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <Button
        className="btn-primary"
        onClick={handleRetry}
        disabled={loading}
      >
        {loading ? "Generating score..." : "Generate my score"}
      </Button>
      {error && (
        <p className="text-destructive-100 text-sm text-center">{error}</p>
      )}
    </div>
  );
};

export default RetryScoring;