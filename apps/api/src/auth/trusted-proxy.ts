import { BlockList, isIP } from "node:net";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/**
 * Networks a reverse proxy can reach the app from: loopback, private (RFC 1918, IPv6 ULA)
 * and link-local. IPv4-mapped IPv6 peers (`::ffff:10.0.0.2`) match the IPv4 rules.
 */
const proxyNetworks = new BlockList();
proxyNetworks.addSubnet("127.0.0.0", 8, "ipv4");
proxyNetworks.addSubnet("10.0.0.0", 8, "ipv4");
proxyNetworks.addSubnet("172.16.0.0", 12, "ipv4");
proxyNetworks.addSubnet("192.168.0.0", 16, "ipv4");
proxyNetworks.addAddress("::1", "ipv6");
proxyNetworks.addSubnet("fc00::", 7, "ipv6");
proxyNetworks.addSubnet("fe80::", 10, "ipv6");

/**
 * Whether a socket peer may vouch for `X-Forwarded-*` headers. Only loopback and private
 * peers qualify, so a client reaching the container directly cannot spoof them.
 */
export function isTrustedProxyPeer(address: string | undefined): boolean {
  if (!address) return false;
  const host = address.replace(/%.*$/, ""); // drop an IPv6 zone id (`fe80::1%eth0`)
  const family = isIP(host);
  if (family === 0) return false;
  return proxyNetworks.check(host, family === 4 ? "ipv4" : "ipv6");
}

/** TCP peer of the request on the Node server; undefined elsewhere (e.g. `app.request`). */
export function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}
