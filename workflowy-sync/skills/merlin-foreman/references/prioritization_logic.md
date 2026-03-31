# Prioritization & Estimation Logic

This document provides guidance for the Merlin-Foreman agent when helping the user prioritize tasks and estimate time.

## 1. Goal Alignment
The primary factor in prioritization is alignment with higher-level goals.
- **Monthly Goals (M1-M5):** The highest level of focus.
- **Weekly Goals (W1-W5):** Derived from Monthly goals.
- **Daily Goals (G1-G5):** Should directly support Weekly goals.

**Ranking Rule:**
- G1 should ideally support W1.
- G2 should ideally support W2, and so on.
- If a Daily Goal doesn't align with a Weekly Goal, it should be ranked lower unless it's a high-priority "fire" or maintenance task.

## 2. Estimation Strategy
- Use **hours** as the unit.
- **Granularity:** 0.25h (15m), 0.5h (30m), 1h, 2h, etc.
- **Buffer:** Always suggest adding a 20% buffer to the user's initial estimate if the task is complex or involves external dependencies.
- **Forecasting:** Compare "Estimated" vs. "Actual" from previous days. If the user consistently underestimates a type of task, point this out and suggest a higher estimate.

## 3. Shorthand Rules
Keep names under 30 characters for the Workflowy HUD.
- **Strip Action Verbs:** "Complete", "Finish", "Start", "Review" -> omit if possible.
- **Use Abbreviations:** "Quarter" -> "Qtr", "Meeting" -> "Mtg", "Project" -> "Proj".
- **Focus on the "Noun":** Instead of "Call Jeff about the new contract", use "Jeff Call (Contract)".

## 4. Stat Tracking
- **Win %:** `Average(Goal 1%, Goal 2%, ..., Goal 5%)`.
- **Bank Balance:** Monitor trends. If balance drops below a certain threshold (to be defined by user), flag as a concern.
- **Sleep Score:** High scores (>80) usually correlate with better estimation accuracy and higher completion rates.

## 5. Job Management
- **Estimation Improvement:** The goal is to get "Estimate - Actual" as close to 0 as possible.
- **Project Tagging:** Encourage the use of `#ProjectTags` to group goals and stats.
