"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

const Page = () => {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    role: "",
    level: "Mid-level",
    type: "Technical",
    techstack: "",
    amount: 5,
  });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const trimmedRole = form.role.trim();
    const trimmedTechstack = form.techstack.trim();
    const parsedAmount = Number.parseInt(form.amount, 10);

    if (!trimmedRole || !trimmedTechstack) {
      setError("Role and tech stack are required.");
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount < 1 || parsedAmount > 20) {
      setError("Amount must be a number between 1 and 20.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/vapi/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: trimmedRole,
          level: form.level,
          type: form.type,
          techstack: trimmedTechstack,
          amount: parsedAmount,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data?.error || "Failed to generate interview.");
        return;
      }

      if (data?.interviewId) {
        router.push(`/interview/${data.interviewId}`);
      } else {
        setError("Interview created but no id was returned.");
      }
    } catch (err) {
      console.error("Interview generation error:", err);
      setError("Failed to generate interview.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col gap-6 max-w-2xl">
      <div className="flex flex-col gap-2">
        <h3>Interview generation</h3>
        <p className="text-light-100">
          Fill in the details and we will generate interview questions.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-6 form">
        <div className="flex flex-col gap-2">
          <label className="label" htmlFor="role">
            Role
          </label>
          <input
            id="role"
            name="role"
            type="text"
            className="input"
            placeholder="Frontend Developer"
            value={form.role}
            onChange={handleChange}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="label" htmlFor="level">
            Level
          </label>
          <select
            id="level"
            name="level"
            className="input"
            value={form.level}
            onChange={handleChange}
          >
            <option value="Intern">Intern</option>
            <option value="Junior">Junior</option>
            <option value="Mid-level">Mid-level</option>
            <option value="Senior">Senior</option>
            <option value="Lead">Lead</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="label" htmlFor="type">
            Question focus
          </label>
          <select
            id="type"
            name="type"
            className="input"
            value={form.type}
            onChange={handleChange}
          >
            <option value="Technical">Technical</option>
            <option value="Behavioral">Behavioral</option>
            <option value="Mixed">Mixed</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="label" htmlFor="techstack">
            Tech stack
          </label>
          <input
            id="techstack"
            name="techstack"
            type="text"
            className="input"
            placeholder="React, Node.js, PostgreSQL"
            value={form.techstack}
            onChange={handleChange}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="label" htmlFor="amount">
            Number of questions
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min={1}
            max={20}
            className="input"
            value={form.amount}
            onChange={handleChange}
          />
        </div>

        {error ? <p className="text-destructive-100">{error}</p> : null}

        <Button className="btn-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Generating..." : "Generate interview"}
        </Button>
      </form>
    </section>
  );
};

export default Page;
