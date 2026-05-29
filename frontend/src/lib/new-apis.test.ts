import { describe, expect, it } from "vitest";
import { ofxApi, aiApi, debtApi } from "@/lib/api";

describe("new API clients", () => {
  it("ofxApi exposes preview and confirm", () => {
    expect(typeof ofxApi.preview).toBe("function");
    expect(typeof ofxApi.confirm).toBe("function");
  });

  it("aiApi exposes suggestions, apply, applyBulk", () => {
    expect(typeof aiApi.suggestions).toBe("function");
    expect(typeof aiApi.apply).toBe("function");
    expect(typeof aiApi.applyBulk).toBe("function");
  });

  it("debtApi exposes listAccounts, simulate, compare, snowball", () => {
    expect(typeof debtApi.listAccounts).toBe("function");
    expect(typeof debtApi.simulate).toBe("function");
    expect(typeof debtApi.compare).toBe("function");
    expect(typeof debtApi.snowball).toBe("function");
  });
});