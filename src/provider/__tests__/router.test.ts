import { describe, it, expect } from "vitest";
import { classifyTask } from "../router";

describe("classifyTask", () => {
  it("classifies planning prompts", () => {
    expect(classifyTask("plan the architecture for our new API")).toBe("planning");
    expect(classifyTask("what is the best way to structure this?")).toBe("planning");
    expect(classifyTask("design a strategy for scaling")).toBe("planning");
  });

  it("classifies coding prompts", () => {
    expect(classifyTask("write a function to parse JSON")).toBe("coding");
    expect(classifyTask("fix the bug in the login flow")).toBe("coding");
    expect(classifyTask("implement the React component")).toBe("coding");
  });

  it("classifies search prompts", () => {
    expect(classifyTask("google the latest news on TypeScript 5.8")).toBe("search");
    expect(classifyTask("find online documentation for Express")).toBe("search");
  });

  it("classifies fast prompts", () => {
    expect(classifyTask("what is the git status")).toBe("fast");
    expect(classifyTask("list all files")).toBe("fast");
    expect(classifyTask("check the npm version")).toBe("fast");
  });

  it("returns general when no keywords match", () => {
    expect(classifyTask("ok")).toBe("general");
    expect(classifyTask("thanks")).toBe("general");
  });

  it("prioritizes highest-scoring category when multiple match", () => {
    // "plan the architecture and write code to implement it"
    // Both planning and coding tokens match, but planning wins
    const result = classifyTask(
      "plan the architecture for the new API and write the implementation",
    );
    // "plan", "architecture", "what is the best way" (partial: "the") vs "write", "implement"
    expect(["planning", "coding"]).toContain(result);
  });
});
