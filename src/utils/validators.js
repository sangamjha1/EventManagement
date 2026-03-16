function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").toLowerCase());
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parsePositiveInt(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

module.exports = {
  isEmail,
  nonEmpty,
  parsePositiveInt,
};