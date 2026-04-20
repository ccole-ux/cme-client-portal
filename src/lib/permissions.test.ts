import { describe, expect, it } from "vitest";
import {
  canReviewSubmissions,
  isCmeAdmin,
  isCmeStaff,
} from "./permissions";

describe("permissions helpers", () => {
  describe("canReviewSubmissions", () => {
    it("allows cme_admin", () => {
      expect(canReviewSubmissions("cme_admin")).toBe(true);
    });

    it("allows cme_reviewer — the whole point of the role", () => {
      expect(canReviewSubmissions("cme_reviewer")).toBe(true);
    });

    it("denies cme_viewer (read-only internal)", () => {
      expect(canReviewSubmissions("cme_viewer")).toBe(false);
    });

    it("denies actc_reviewer — submits but doesn't approve", () => {
      expect(canReviewSubmissions("actc_reviewer")).toBe(false);
    });

    it("denies actc_viewer", () => {
      expect(canReviewSubmissions("actc_viewer")).toBe(false);
    });

    it("denies null/undefined", () => {
      expect(canReviewSubmissions(null)).toBe(false);
      expect(canReviewSubmissions(undefined)).toBe(false);
    });
  });

  describe("isCmeAdmin", () => {
    it("matches only cme_admin", () => {
      expect(isCmeAdmin("cme_admin")).toBe(true);
      expect(isCmeAdmin("cme_reviewer")).toBe(false);
      expect(isCmeAdmin("cme_viewer")).toBe(false);
      expect(isCmeAdmin("actc_reviewer")).toBe(false);
      expect(isCmeAdmin("actc_viewer")).toBe(false);
      expect(isCmeAdmin(null)).toBe(false);
    });
  });

  describe("isCmeStaff", () => {
    it("matches admin + reviewer + viewer", () => {
      expect(isCmeStaff("cme_admin")).toBe(true);
      expect(isCmeStaff("cme_reviewer")).toBe(true);
      expect(isCmeStaff("cme_viewer")).toBe(true);
    });

    it("excludes ACTC roles", () => {
      expect(isCmeStaff("actc_reviewer")).toBe(false);
      expect(isCmeStaff("actc_viewer")).toBe(false);
    });
  });
});
