import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UnsafeUrlError, assertSafeUrl, isAllowedHost } from "../lib/net";

describe("isAllowedHost", () => {
  it("accepts Pinterest hosts and their subdomains", () => {
    for (const host of ["pinterest.com", "www.pinterest.com", "i.pinimg.com", "pin.it", "pinterest.co.uk"]) {
      assert.equal(isAllowedHost(host), true, host);
    }
  });

  it("rejects lookalikes and unrelated hosts", () => {
    for (const host of ["notpinterest.com", "pinterest.com.evil.test", "example.test", "localhost"]) {
      assert.equal(isAllowedHost(host), false, host);
    }
  });

  it("is case and trailing-dot insensitive", () => {
    assert.equal(isAllowedHost("I.PinImg.CoM."), true);
  });
});

describe("assertSafeUrl", () => {
  it("rejects non-https schemes", async () => {
    await assert.rejects(() => assertSafeUrl("http://www.pinterest.com/"), UnsafeUrlError);
    await assert.rejects(() => assertSafeUrl("file:///etc/passwd"), UnsafeUrlError);
  });

  it("rejects hosts outside the allowlist", async () => {
    await assert.rejects(() => assertSafeUrl("https://example.test/"), UnsafeUrlError);
    await assert.rejects(() => assertSafeUrl("https://127.0.0.1/"), UnsafeUrlError);
    await assert.rejects(() => assertSafeUrl("https://[::1]/"), UnsafeUrlError);
  });

  it("rejects malformed input", async () => {
    await assert.rejects(() => assertSafeUrl("not a url"), UnsafeUrlError);
  });
});
