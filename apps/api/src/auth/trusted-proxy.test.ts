import { describe, expect, it } from "vitest";
import { isTrustedProxyPeer } from "./trusted-proxy.ts";

describe("isTrustedProxyPeer", () => {
  it("trusts loopback, private and link-local peers", () => {
    for (const address of [
      "127.0.0.1",
      "127.8.9.10",
      "10.0.0.2",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.1.20",
      "::1",
      "0:0:0:0:0:0:0:1",
      "fc00::1",
      "fd12:3456::7",
      "fe80::1",
      "fe80::1%eth0",
      "::ffff:127.0.0.1",
      "::ffff:172.18.0.1",
      "::ffff:192.168.0.9",
    ]) {
      expect(isTrustedProxyPeer(address), address).toBe(true);
    }
  });

  it("does not trust public, malformed or missing peers", () => {
    for (const address of [
      "203.0.113.9",
      "8.8.8.8",
      "172.15.255.255",
      "172.32.0.1",
      "192.169.0.1",
      "11.0.0.1",
      "2001:db8::1",
      "::ffff:203.0.113.9",
      "localhost",
      "not-an-ip",
      "",
      undefined,
    ]) {
      expect(isTrustedProxyPeer(address), String(address)).toBe(false);
    }
  });
});
