// Uses the same exclusive, prerequisite-first credential preparation as cloud deployment.
process.env.SOLAIR_PREPARE_LAPTOP = "1";
await import("./prepare-team.mjs");
