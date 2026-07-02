export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidAmount(amount) {
  return typeof amount === "number" && isFinite(amount) && amount > 0;
}

export function isValidSplitType(type) {
  return ["equal", "percentage", "exact", "shares"].includes(type);
}

export function validateSplits(splits, amount, splitType) {
  if (!splits || typeof splits !== "object") return { valid: false, message: "Splits are required." };

  const values = Object.values(splits).map(Number);

  if (values.some(isNaN)) return { valid: false, message: "All split values must be numbers." };

  if (splitType === "percentage") {
    const total = values.reduce((a, b) => a + b, 0);
    if (Math.abs(total - 100) > 0.5) return { valid: false, message: "Percentages must add up to 100." };
  }

  if (splitType === "exact") {
    const total = values.reduce((a, b) => a + b, 0);
    if (Math.abs(total - amount) > 0.5) return { valid: false, message: "Exact amounts must add up to the total expense." };
  }

  return { valid: true };
}