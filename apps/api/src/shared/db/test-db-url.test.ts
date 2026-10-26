import { describe, expect, it } from "vitest";
import { testDatabaseUrl } from "./test-db-url.ts";

const dev = {
  POSTGRES_USER: "english",
  POSTGRES_PASSWORD: "p@ss word",
  POSTGRES_DB: "english_course",
};

describe("testDatabaseUrl", () => {
  it("uses DATABASE_URL_TEST when set", () => {
    const url = "postgres://u:p@db.example:5432/custom_test";
    expect(testDatabaseUrl({ ...dev, DATABASE_URL_TEST: url })).toBe(url);
    expect(testDatabaseUrl({ DATABASE_URL_TEST: url })).toBe(url);
  });

  it("otherwise targets <POSTGRES_DB>_test on the dev db published at localhost:5432", () => {
    const url = new URL(testDatabaseUrl(dev));
    expect(url.host).toBe("localhost:5432");
    expect(url.pathname).toBe("/english_course_test");
    expect(decodeURIComponent(url.username)).toBe("english");
    expect(decodeURIComponent(url.password)).toBe("p@ss word");
  });

  it("names every missing dev variable", () => {
    expect(() => testDatabaseUrl({ POSTGRES_USER: "english", POSTGRES_PASSWORD: "" })).toThrow(
      "Set DATABASE_URL_TEST, or POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB (missing: POSTGRES_PASSWORD, POSTGRES_DB)",
    );
  });

  it("ignores DATABASE_URL", () => {
    expect(() => testDatabaseUrl({ DATABASE_URL: "postgres://u:p@localhost:5432/db" })).toThrow(
      /missing: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB/,
    );
  });
});
