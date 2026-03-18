import { describe, expect, it } from "vitest";
import { renderRelated } from "../app/cli/src/format.js";

describe("renderRelated", () => {
  it("renders nested related node payloads from the live API", () => {
    const output = renderRelated({
      items: [
        {
          relation: { relationType: "supports" },
          node: { id: "node_123", title: "Retrieval rule" }
        }
      ]
    });

    expect(output).toContain("1. Retrieval rule (supports)");
  });
});
