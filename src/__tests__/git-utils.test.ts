import { describe, it, expect } from "vitest";
import { git } from "../tools/git/utils.js";

describe("git helper", () => {
  it("should return git version", () => {
    const result = git(["--version"]);
    expect(result).toContain("git version");
  });

  it("should handle invalid git command", () => {
    const result = git(["invalid-command"]);
    // Git returns error message for invalid commands
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it("should return output with cwd parameter", () => {
    const result = git(["rev-parse", "--show-toplevel"]);
    expect(result).toBeTruthy();
  });
});
