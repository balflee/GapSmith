import { describe, it, expect } from "vitest";
import {
  calculateBondingPrice,
  getSlotsRemaining,
  getNextStepPrice,
  generateCurvePoints,
  BASE_PRICES,
  STEP_SIZE,
} from "../bonding-curve";

describe("bonding-curve", () => {
  describe("calculateBondingPrice", () => {
    it("returns base price at 0 purchases", () => {
      expect(calculateBondingPrice(490, 0)).toBe(490);
      expect(calculateBondingPrice(1290, 0)).toBe(1290);
      expect(calculateBondingPrice(1990, 0)).toBe(1990);
    });

    it("price stays the same within a step (purchases 1-19)", () => {
      const priceAt0 = calculateBondingPrice(490, 0);
      for (let n = 1; n < 20; n++) {
        expect(calculateBondingPrice(490, n)).toBe(priceAt0);
      }
    });

    it("price increases after step boundary (20 purchases)", () => {
      const priceAt0 = calculateBondingPrice(490, 0);
      const priceAt20 = calculateBondingPrice(490, 20);
      expect(priceAt20).toBeGreaterThan(priceAt0);
    });

    it("price increases at each subsequent step", () => {
      const price0 = calculateBondingPrice(490, 0);
      const price20 = calculateBondingPrice(490, 20);
      const price40 = calculateBondingPrice(490, 40);
      expect(price20).toBeGreaterThan(price0);
      expect(price40).toBeGreaterThan(price20);
    });

    it("returns integer cent values (no fractional cents)", () => {
      for (let n = 0; n <= 100; n += 7) {
        const price = calculateBondingPrice(490, n);
        expect(Number.isInteger(price)).toBe(true);
      }
    });
  });

  describe("getSlotsRemaining", () => {
    it("returns STEP_SIZE when purchaseCount is 0", () => {
      expect(getSlotsRemaining(0)).toBe(STEP_SIZE);
    });

    it("returns correct remaining slots within a step", () => {
      expect(getSlotsRemaining(1)).toBe(19);
      expect(getSlotsRemaining(10)).toBe(10);
      expect(getSlotsRemaining(19)).toBe(1);
    });

    it("returns STEP_SIZE at step boundaries", () => {
      expect(getSlotsRemaining(20)).toBe(STEP_SIZE);
      expect(getSlotsRemaining(40)).toBe(STEP_SIZE);
    });
  });

  describe("getNextStepPrice", () => {
    it("is higher than current price", () => {
      const currentPrice = calculateBondingPrice(490, 0);
      const nextPrice = getNextStepPrice(490, 0);
      expect(nextPrice).toBeGreaterThan(currentPrice);
    });

    it("equals the price at the next step boundary", () => {
      const nextPrice = getNextStepPrice(490, 5);
      // Next step starts at purchase 20 (slots remaining from 5 = 15, so 5+15=20)
      const priceAtNextStep = calculateBondingPrice(490, 20);
      expect(nextPrice).toBe(priceAtNextStep);
    });
  });

  describe("generateCurvePoints", () => {
    it("returns monotonically increasing prices", () => {
      const points = generateCurvePoints(490);
      for (let i = 1; i < points.length; i++) {
        expect(points[i].price).toBeGreaterThanOrEqual(points[i - 1].price);
      }
      // Ensure at least some increase happens
      expect(points[points.length - 1].price).toBeGreaterThan(points[0].price);
    });

    it("defaults to 200 steps", () => {
      const points = generateCurvePoints(490);
      expect(points.length).toBe(200);
    });

    it("respects custom maxSteps", () => {
      const points = generateCurvePoints(490, 50);
      expect(points.length).toBe(50);
    });

    it("first point matches base price", () => {
      const points = generateCurvePoints(490);
      expect(points[0].price).toBe(490);
      expect(points[0].step).toBe(0);
    });
  });

  describe("BASE_PRICES", () => {
    it("has all expected SKUs", () => {
      expect(BASE_PRICES).toEqual({
        scout: 490,
        forge: 1290,
        prove: 1990,
        bundle: 2990,
        cli: 1490,
      });
    });
  });
});
